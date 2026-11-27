import {yuriRecoveryGASHash} from './mio-yuri-recovery-session.mjs';
import {prepare,bridge,readSession,hash,sessionCookie} from './bridge.js';
import {legacyFeatureGateEnabled,legacyLevelDatabase,authorizeLegacyApiFeature} from './mio-level-legacy-api-gate-vnext.mjs';

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
  const delegated=await yuriRecoveryGASHash(session).catch(()=>null);
  const identity={participantId:session.id,tokenHash:delegated||hash(session.token)};
  if(legacyFeatureGateEnabled(process.env)){
   const db=await legacyLevelDatabase(process.env);
   const gasStatus=await bridge('status',identity);
   await authorizeLegacyApiFeature({db,session,gasStatus,resource:'member_gacha'});
  }
  const data=await bridge(body.action,{...identity,...(body.action==='draw'?{drawId:body.drawId,mode:body.mode}:{})});
  if(data.participantId!==session.id)throw Error('登録を確認できません');
  res.setHeader('Set-Cookie',sessionCookie(session.id,session.token,cfg.secret));
  return res.status(200).json(data);
 }catch(error){
  if(error.message==='FEATURE_LEVEL_REQUIRED')return res.status(403).json({ok:false,error:'メンシプガチャはレベル3の登録が必要です'});
  if(error.message==='LEVEL_AUTH_UNAVAILABLE')return res.status(503).json({ok:false,error:'認証を確認できません。時間をおいて再試行してください'});
  return res.status(409).json({ok:false,error:error.message==='unauthorized'?'登録の確認が必要です':error.message||'抽選結果を確認できませんでした。同じ抽選を再確認してください'});
 }
}
