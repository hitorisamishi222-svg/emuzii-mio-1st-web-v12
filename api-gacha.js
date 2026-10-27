import {prepare,bridge,readSession,hash,sessionCookie} from './bridge.js';
import {preflightGachaDraw} from './gacha-draw-preflight.js';

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
  if(body.action==='draw'){
   const decision=await preflightGachaDraw(bridge,identity,{drawId:body.drawId,mode:body.mode});
   if(decision.kind==='replayed'){
    res.setHeader('Set-Cookie',sessionCookie(session.id,session.token,cfg.secret));
    return res.status(200).json(decision.data);
   }
   if(decision.kind!=='fresh')
    return res.status(409).json({ok:false,error:decision.reason==='gate'?'現在のガチャ受付・利用条件を確認できませんでした。新しい抽選は行っていません。同じ抽選IDで結果を再確認してください。':'ガチャの安全確認が完了していません。新規抽選を停止しています。未確認の抽選は同じIDで再確認してください。'});
  }
  const data=await bridge(body.action,{...identity,...(body.action==='draw'?{drawId:body.drawId,mode:body.mode}:{})});
  if(data.participantId!==session.id)throw Error('登録を確認できません');
  res.setHeader('Set-Cookie',sessionCookie(session.id,session.token,cfg.secret));
  return res.status(200).json(data);
 }catch(error){
  return res.status(409).json({ok:false,error:error.message==='unauthorized'?'登録の確認が必要です':error.message||'抽選結果を確認できませんでした。同じ抽選を再確認してください'});
 }
}
