import {prepare,bridge,makeIdentity,hash,sessionCookie,readSession} from './bridge.js';

// The share link secret is never placed in a URL query, referrer or server log.
export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;
 // Existing pending-session browsers should be linked, not re-registered.
 const current=readSession(req.headers.cookie,cfg.secret);
 const token=String(req.body?.key||'');
 if(!/^[a-f0-9]{64}$/.test(token))return res.status(400).json({ok:false,error:'接続リンクを確認してください'});
 try{
  const identity=current?{id:current.id,token:current.token}:makeIdentity();
  const d=await bridge('pair_claim',{participantId:identity.id,tokenHash:hash(identity.token),pairHash:hash(token)});
  if(d.ok!==true||d.verified!==true||d.participantId!==identity.id||d.status!=='承認済み'||d.linked!==true)
   throw Error('ブラウザ接続を確認できませんでした');
  if(!current)res.setHeader('Set-Cookie',sessionCookie(identity.id,identity.token,cfg.secret));
  return res.status(200).json({ok:true,linked:true});
 }catch(e){return res.status(409).json({ok:false,error:e.message||'接続できませんでした。元のブラウザから新しいリンクを発行してください'})}
}
