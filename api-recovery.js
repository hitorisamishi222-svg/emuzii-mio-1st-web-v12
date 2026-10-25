import {prepare,bridge,hash,sessionCookie} from './bridge.js';
import {recoveryToken} from './recovery-token.js';
import {verifiedRecoveryResult} from './recovery-result-gate.js';

/**
 * STAGED ONLY. Not routed in production vercel.json.
 * Use the original production bridge; never accept a client-selected Web-ID.
 * Dependency injection exists for isolated integration tests only.
 */
export function makeRecoveryHandler({prepare,bridge,hash,sessionCookie,recoveryToken,verifiedRecoveryResult}){
  return async function handler(req,res){
    const cfg=prepare(req,res);
    if(!cfg)return;
    if(process.env.MIO_RECOVERY_RELEASE!=='verified-gas-recovery-v2')
      return res.status(503).json({ok:false,error:'端末認証の復旧は準備中です'});
    const {grant,retryKey,retryIssuedAt}=req.body||{};
    if(typeof grant!=='string'||!/^MIO-R1-[a-f0-9]{64}$/.test(grant))
      return res.status(400).json({ok:false,error:'復旧コードが正しくありません'});
    const token=recoveryToken(retryKey,retryIssuedAt,cfg.secret);
    if(!token)return res.status(409).json({ok:false,error:'復旧操作の有効期限が切れています。管理者に確認してください'});
    try{
      // GAS must atomically bind this token hash to the pre-existing,
      // operator-verified Web-ID; the request contains no target ID.
      const tokenHash=hash(token);
      const result=await bridge('recover',{grantHash:hash(grant),tokenHash});
      const expected={webId:result.approvedWebId,masterId:result.approvedMasterId};
      if(!verifiedRecoveryResult(result,expected,tokenHash))throw Error('identity mismatch');
      res.setHeader('Set-Cookie',sessionCookie(result.participantId,token,cfg.secret));
      return res.status(200).json({ok:true,recovered:true});
    }catch{
      return res.status(409).json({ok:false,error:'復旧コードを確認できませんでした。管理者にお問い合わせください'});
    }
  };
}
export default makeRecoveryHandler({prepare,bridge,hash,sessionCookie,recoveryToken,verifiedRecoveryResult});
