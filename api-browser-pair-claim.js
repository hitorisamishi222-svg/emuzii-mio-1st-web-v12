import {prepare,bridge,makeIdentity,hash,sessionCookie,readSession} from './bridge.js';
import {pairReleaseEnabled} from './pair-release-gate.js';

export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;
 // Stage-only: no new browser session may be created until GAS is verified.
 if(!pairReleaseEnabled())return res.status(503).json({ok:false,error:'ブラウザ認証の更新準備中です'});
 const current=readSession(req.headers.cookie,cfg.secret);
 const key=String(req.body?.key||'');
 if(!/^[a-f0-9]{64}$/.test(key))return res.status(400).json({ok:false,error:'接続リンクが不正です'});
 try{
  const identity=current?{id:current.id,token:current.token}:makeIdentity();
  const d=await bridge('pair_claim',{participantId:identity.id,tokenHash:hash(identity.token),pairHash:hash(key)});
  if(d.ok!==true||d.verified!==true||d.participantId!==identity.id||d.status!=='承認済み'||d.linked!==true)
   throw Error('認証失敗');
  if(!current)res.setHeader('Set-Cookie',sessionCookie(identity.id,identity.token,cfg.secret));
  return res.status(200).json({ok:true,linked:true});
 }catch{return res.status(409).json({ok:false,error:'別ブラウザの本人認証を確認できませんでした'});}
}
