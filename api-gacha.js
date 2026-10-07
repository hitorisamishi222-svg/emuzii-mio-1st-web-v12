import {prepare,bridge,readSession,hash} from './bridge.js';

export default async function handler(req,res){
 const cfg=prepare(req,res);
 if(!cfg)return;
 const session=readSession(req.headers.cookie,cfg.secret);
 if(!session)return res.status(401).json({ok:false,error:'この端末の登録情報がありません'});
 let body;
 try{body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{}}
 catch{return res.status(400).json({ok:false,error:'操作を確認してください'})}
 if(!body||typeof body!=='object')return res.status(400).json({ok:false,error:'操作を確認してください'});
 if(!['catalog','draw','history'].includes(body.action))return res.status(400).json({ok:false,error:'操作を確認してください'});
 if(body.action==='draw'&&(!/^[a-f0-9]{32}$/.test(body.drawId||'')||!['通常','ラキフェス'].includes(body.mode)))return res.status(400).json({ok:false,error:'抽選要求が不正です'});
 try{
  const identity={participantId:session.id,tokenHash:hash(session.token)};
  const data=await bridge(body.action,{...identity,...(body.action==='draw'?{drawId:body.drawId,mode:body.mode}:{})});
  if(data.participantId!==session.id)throw Error('登録を確認できません');
  return res.status(200).json(data);
 }catch(error){
  return res.status(409).json({ok:false,error:error.message==='unauthorized'?'登録の確認が必要です':error.message||'抽選結果を確認できませんでした。同じ抽選を再確認してください'});
 }
}
