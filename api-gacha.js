import {prepare,bridge,readSession,hash} from './bridge.js';

function historyCount(h){
 const list=Array.isArray(h?.history)?h.history:null;
 return list?list.length:NaN;
}

function festGate(c,h){
 const start=Number(c?.festAvailableFrom)||5;
 const remaining=Number(c?.remaining);
 const explicitTotal=Number(c?.total);
 const reportedUsed=Number(c?.used);
 const total=Number.isFinite(explicitTotal)?explicitTotal:(Number.isFinite(reportedUsed)&&Number.isFinite(remaining)?reportedUsed+remaining:NaN);
 const entitled=c?.festEntitled===true||(c?.festEntitled==null&&Number.isFinite(total)&&total>=start);
 const webUsed=historyCount(h);
 return {
  start,remaining,total,entitled,webUsed,
  unlocked:entitled&&Number.isFinite(webUsed)&&webUsed>=start-1&&Number.isFinite(remaining)&&remaining>0
 };
}

async function readGateState(ident){
 const c=await bridge('catalog',ident);
 if(c.participantId!==ident.participantId)throw Error('登録を確認できません');
 const h=await bridge('history',ident);
 if(h.participantId!==ident.participantId)throw Error('登録を確認できません');
 const g=festGate(c,h);
 if(!Number.isFinite(g.webUsed))throw Error('抽選履歴を確認できません');
 return {c,h,g};
}

export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;
 const s=readSession(req.headers.cookie,cfg.secret);
 if(!s)return res.status(401).json({ok:false,error:'この端末の登録情報がありません'});
 let b;try{b=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{}}catch{return res.status(400).json({ok:false,error:'操作を確認してください'})}
 if(!b||typeof b!=='object')return res.status(400).json({ok:false,error:'操作を確認してください'});
 if(!['catalog','draw','history'].includes(b.action))return res.status(400).json({ok:false,error:'操作を確認してください'});
 if(b.action==='draw'&&(!/^[a-f0-9]{32}$/.test(b.drawId||'')||!['通常','ラキフェス'].includes(b.mode)))return res.status(400).json({ok:false,error:'抽選要求が不正です'});
 const ident={participantId:s.id,tokenHash:hash(s.token)};
 try{
  if(b.action==='catalog'){
   const {c,g}=await readGateState(ident);
   return res.status(200).json({
    ...c,
    festEntitled:g.entitled,
    festUnlocked:g.unlocked,
    festAvailableFrom:g.start,
    nextOrdinal:g.webUsed+1,
    webDrawsUsed:g.webUsed
   });
  }
  if(b.action==='draw'){
   const {c,g}=await readGateState(ident);
   if(b.mode==='通常'&&c.normalOpen!==true)throw Error('メンシプガチャは現在停止中です');
   if(b.mode==='ラキフェス'&&c.festOpen!==true)throw Error('ラキフェスガチャは現在停止中です');
   if(b.mode==='ラキフェス'&&!g.entitled)throw Error(`ラキフェスは総ガチャ権利${g.start}回以上が対象です`);
   if(b.mode==='ラキフェス'&&!g.unlocked)throw Error(`ラキフェスは${g.start}回目の抽選から利用できます`);
  }
  const d=await bridge(b.action,{...ident,...(b.action==='draw'?{drawId:b.drawId,mode:b.mode}:{})});
  if(d.participantId!==s.id)throw Error('登録を確認できません');
  res.status(200).json(d)
 }catch(e){res.status(409).json({ok:false,error:e.message==='unauthorized'?'登録の確認が必要です':e.message||'抽選結果を確認できませんでした。同じ抽選を再確認してください'})}
}
