import {prepare, bridge, readSession, hash, sessionCookie} from './bridge.js';
import {recoveryIdentity} from './recovery-identity.js';
import {verifiedRecoveryResult} from './recovery-result-gate.js';

/**
 * Staged only. This file is NOT routed by the production vercel.json.
 * Requires a verified matching GAS implementation and explicit release.
 */
export default async function handler(req,res) {
  const cfg=prepare(req,res);
  if(!cfg)return;
  if(process.env.MIO_RECOVERY_RELEASE!=='verified-gas-recovery-v1')
    return res.status(503).json({ok:false,error:'端末認証の復旧は準備中です'});
  if(readSession(req.headers.cookie,cfg.secret))
    return res.status(409).json({ok:false,error:'このブラウザは認証済みです。参加状況を確認してください'});
  const {grant,retryKey,retryIssuedAt}=req.body||{};
  if(typeof grant!=='string'||!/^MIO-R1-[a-f0-9]{64}$/.test(grant))
    return res.status(400).json({ok:false,error:'復旧コードが正しくありません'});
  const identity=recoveryIdentity(retryKey,retryIssuedAt,cfg.secret);
  if(!identity)
    return res.status(409).json({ok:false,error:'復旧操作の有効期限が切れています。管理者に確認してください'});
  try {
    // GAS must prove manual approval and atomically consume this grant.
    // Never accept a target Web-ID, MIO-ID or nickname from the browser.
    const result=await bridge('recover',{
      participantId:identity.id, tokenHash:hash(identity.token),
      grantHash:hash(grant)
    });
    const expected={webId:result.approvedWebId,masterId:result.approvedMasterId};
    if(!verifiedRecoveryResult(result,expected))
      throw Error('承認済みの参加者IDと照合できません');
    res.setHeader('Set-Cookie',sessionCookie(result.participantId,identity.token,cfg.secret));
    return res.status(200).json({ok:true,recovered:true});
  }catch {
    return res.status(409).json({ok:false,error:'復旧コードを確認できませんでした。管理者にお問い合わせください'});
  }
}
