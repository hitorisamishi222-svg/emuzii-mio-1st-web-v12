import {randomBytes} from 'node:crypto';
import {prepare,bridge,hash,readSession} from './bridge.js';

// Design candidate only. Preview routing intentionally returns 404 for /api/*.
export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;
 const session=readSession(req.headers.cookie,cfg.secret);
 if(!session)return res.status(401).json({ok:false,error:'認証済みブラウザで操作してください'});
 try{
  const token=randomBytes(32).toString('hex');
  const pairHash=hash(token);
  const result=await bridge('pair_create',{participantId:session.id,tokenHash:hash(session.token),pairHash});
  if(result.participantId!==session.id||result.ok!==true)throw Error('発行元の承認を確認できません');
  return res.status(200).json({ok:true,url:'https://emuzii-mio-1st-web-v12.vercel.app/browser-connect.html#key='+token,expiresInSeconds:180});
 }catch(e){return res.status(409).json({ok:false,error:e.message||'接続リンクを発行できませんでした'})}
}
