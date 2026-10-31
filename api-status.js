import {prepare,bridge,readSession,hash,sessionCookie} from './bridge.js';
import {recoverFromAdminApprovedLightCookie} from './mio-admin-approved-light-recovery.js';
import {recordObservedFailure} from './mio-incident-recorder.js';
import {readLightSession} from './registration-light-session.js';

export default async function handler(req,res){
  const cfg=prepare(req,res);
  if(!cfg)return;
  const session=readSession(req.headers.cookie,cfg.secret);
  if(!session){
    let recovery;
    try{
      recovery=await recoverFromAdminApprovedLightCookie({req,res,config:process.env});
    }catch{
      recovery={status:'failed'};
    }
    if(recovery.status==='recovered')return res.status(200).json(recovery.data);
    // Only a separately verified signed light cookie supplies a trustworthy browser ID.
    const light=readLightSession(req.headers.cookie,process.env.MIO_LIGHT_SESSION_SECRET);
    if(light)await recordObservedFailure({session:light,action:'status',category:'AUTH_COOKIE_MISSING'});
    return res.status(401).json({
      ok:false,
      error:'このブラウザの認証情報を確認できません。登録済みの方は再登録せず、管理者に端末認証の復旧をご依頼ください。',
      code:'BROWSER_SESSION_MISSING'
    });
  }
  try{
    const data=await bridge('status',{participantId:session.id,tokenHash:hash(session.token)});
    if(data.participantId!==session.id)throw Error('identity mismatch');
    if(data.status==='承認済み')res.setHeader('Set-Cookie',sessionCookie(session.id,session.token,cfg.secret));
    return res.status(200).json(data);
  }catch(error){
    // Retired legacy browser sessions can retain a valid signature.
    // Only the independently verified, allowlisted light session can recover.
    let recovery;
    try{
      recovery=await recoverFromAdminApprovedLightCookie({req,res,config:process.env});
    }catch{
      recovery={status:'failed'};
    }
    if(recovery.status==='recovered')return res.status(200).json(recovery.data);
    // Only an explicit GAS authentication rejection with a second valid signed
    // cookie from the SAME browser identity can be classified as recoverable.
    // Generic connection timeouts MUST remain 502 and never alter sessions.
    const light=readLightSession(req.headers.cookie,process.env.MIO_LIGHT_SESSION_SECRET);
    const sameBrowser=!!light&&light.id===session.id&&light.token===session.token;
    if(sameBrowser&&String(error?.message||'')==='unauthorized'){
      await recordObservedFailure({session,action:'status',error,
        category:'AUTH_LEGACY_REJECTED'});
      return res.status(401).json({ok:false,
        code:'BROWSER_SESSION_REVIEW_AVAILABLE',
        error:'旧ログイン情報の照合が必要です。元の登録ブラウザで管理者へ復旧申請してください。新規登録は不要です。'});
    }
    await recordObservedFailure({session,action:'status',error});
    return res.status(502).json({ok:false,error:'⚠️ 一時的な通信エラーの可能性があります。ページを再読み込みして、もう一度お試しください。再登録は不要です。登録情報・ガチャ回数・当選履歴は、この再確認操作では変更されません。改善しない場合は管理者にご連絡ください。'});
  }
}
