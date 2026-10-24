import {prepare,bridge,readSession,hash,sessionCookie} from './bridge.js';
import {recoveryToken} from './recovery-token.js';
import {verifiedRecoveryResult} from './recovery-result-gate.js';

/**
 * STAGED: not routed by production vercel.json.
 * The live GAS source/deployment MUST be audited before enabling.
 * Only GAS can select the pre-approved EXISTING Web-ID and MIO-ID.
 */
export default async function handler(req,res){
  const cfg=prepare(req,res);
  if(!cfg)return;
  if(process.env.MIO_RECOVERY_RELEASE!=='verified-gas-recovery-v2')
    return res.status(503).json({ok:false,error:'端末認証の復旧は準備中です'});
  // Do not use a valid legacy cookie to choose the target account.
  // A stale cookie may belong to another person; the grant is authoritative.
  const {grant,retryKey,retryIssuedAt}=req.body||{};
  if(typeof grant!=='string'||!/^MIO-R1-[a-f0-9]{64}$/.test(grant))
    return res.status(400).json({ok:false,error:'復旧コードが正しくありません'});
  const token=recoveryToken(retryKey,retryIssuedAt,cfg.secret);
  if(!token)return res.status(409).json({ok:false,error:'復旧操作の有効期限が切れています。管理者に確認してください'});
  try{
    // GAS atomically validates and consumes the grant, binds tokenHash to the
    // approved EXISTING Web-ID and verifies the linked MIO-ID.
    // No user-supplied name, Web-ID or MIO-ID is accepted.
    const tokenHash=hash(token);
    const result=await bridge('recover',{grantHash:hash(grant),tokenHash});
    const expected={webId:result.approvedWebId,masterId:result.approvedMasterId};
    if(!verifiedRecoveryResult(result,expected,tokenHash))throw Error('承認済みの参加者IDと照合できません');
    res.setHeader('Set-Cookie',sessionCookie(result.participantId,token,cfg.secret));
    return res.status(200).json({ok:true,recovered:true});
  }catch{
    return res.status(409).json({ok:false,error:'復旧コードを確認できませんでした。管理者にお問い合わせください'});
  }
}
