import {prepare,bridge,readSession,hash,sessionCookie} from './bridge.js';
import {recoverFromAdminApprovedLightCookie} from './mio-admin-approved-light-recovery.js';

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
  }catch{
    // Retired legacy browser sessions can retain a valid signature.
    // Only the independently verified, allowlisted light session can recover.
    let recovery;
    try{
      recovery=await recoverFromAdminApprovedLightCookie({req,res,config:process.env});
    }catch{
      recovery={status:'failed'};
    }
    if(recovery.status==='recovered')return res.status(200).json(recovery.data);
    return res.status(502).json({ok:false,error:'参加状況を取得できませんでした。以前の情報は現在値として表示しません。'});
  }
}
