import {prepare,bridge,readSession,hash} from './bridge.js';
export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;const s=readSession(req.headers.cookie,cfg.secret);
 if(!s)return res.status(401).json({ok:false,error:'この端末の登録情報がありません'});
 let b;try{b=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{}}catch{return res.status(400).json({ok:false,error:'操作を確認してください'})}if(!b||typeof b!=='object')return res.status(400).json({ok:false,error:'操作を確認してください'});
 if(!['catalog','draw','history'].includes(b.action))return res.status(400).json({ok:false,error:'操作を確認してください'});
 if(b.action==='draw'&&(!/^[a-f0-9]{32}$/.test(b.drawId||'')||!['通常','ラキフェス'].includes(b.mode)))return res.status(400).json({ok:false,error:'抽選要求が不正です'});
 try{const d=await bridge(b.action,{participantId:s.id,tokenHash:hash(s.token),...(b.action==='draw'?{drawId:b.drawId,mode:b.mode}:{})});if(d.participantId!==s.id)throw Error('登録を確認できません');res.status(200).json(d)}catch(e){res.status(409).json({ok:false,error:e.message==='unauthorized'?'登録の確認が必要です':e.message||'抽選結果を確認できませんでした。同じ抽選を再確認してください'})}
}
