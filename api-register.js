import {prepare,bridge,makeIdentity,hash,sessionCookie,readSession} from './bridge.js';
export default async function handler(req,res){const cfg=prepare(req,res);if(!cfg)return;try{
const name=String(req.body?.name||'').trim();if(name.length<1||name.length>40||/[\u0000-\u001f]/.test(name))return res.status(400).json({ok:false,error:'ColorSing名を1〜40文字で入力してください'});
if(readSession(req.headers.cookie,cfg.secret))return res.status(409).json({ok:false,error:'この端末は登録済みです。参加状況を確認してください'});
const {id,token}=makeIdentity();const d=await bridge('register',{participantId:id,tokenHash:hash(token),name,memberClaim:req.body?.memberClaim===true});
if(d.participantId!==id||d.verified!==true)throw Error('登録の保存を確認できませんでした');
res.setHeader('Set-Cookie',sessionCookie(id,token,cfg.secret));return res.status(201).json({ok:true,participantId:id,status:d.status,name});
}catch{res.status(502).json({ok:false,error:'保存を確認できませんでした。登録は確定していません。時間をおいてお試しください'})}}
