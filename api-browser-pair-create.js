import {randomBytes} from 'node:crypto';
import {prepare,bridge,hash,readSession} from './bridge.js';
import {pairReleaseEnabled} from './pair-release-gate.js';

export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;
 // Stage-only: the live Apps Script does not yet support pair_create.
 if(!pairReleaseEnabled())return res.status(503).json({ok:false,error:'ブラウザ認証の更新準備中です'});
 const session=readSession(req.headers.cookie,cfg.secret);
 if(!session)return res.status(401).json({ok:false,error:'認証済みブラウザから操作してください'});
 try{
  const token=randomBytes(32).toString('hex');
  const d=await bridge('pair_create',{participantId:session.id,tokenHash:hash(session.token),pairHash:hash(token)});
  if(d.ok!==true||d.participantId!==session.id||d.expiresInSeconds!==180)
   throw Error('接続リンクを発行できませんでした');
  return res.status(200).json({ok:true,url:'https://emuzii-mio-1st-web-v12.vercel.app/browser-connect.html#key='+token,expiresInSeconds:180});
 }catch{ return res.status(409).json({ok:false,error:'安全な接続リンクを発行できませんでした'}); }
}
