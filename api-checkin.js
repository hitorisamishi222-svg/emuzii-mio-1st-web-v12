import {yuriRecoveryGASHash} from './mio-yuri-recovery-session.mjs';
import {prepare,bridge,readSession,hash,sessionCookie} from './bridge.js';
import {legacyFeatureGateEnabled,legacyLevelDatabase,authorizeLegacyApiFeature} from './mio-level-legacy-api-gate-vnext.mjs';
export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;const s=readSession(req.headers.cookie,cfg.secret);
 if(!s)return res.status(401).json({ok:false,error:'この端末の登録情報がありません'});
 const keyword=String(req.body?.keyword||'').trim();const day=Number(req.body?.day);if(!Number.isInteger(day)||day<1||day>31)return res.status(400).json({ok:false,error:'10/1〜10/31の日付を選んでください'});if(!keyword||keyword.length>40)return res.status(400).json({ok:false,error:'今日の確認文字を入力してください'});
 try{
  const delegated=await yuriRecoveryGASHash(s).catch(()=>null);
  const identity={participantId:s.id,tokenHash:delegated||hash(s.token)};
  if(legacyFeatureGateEnabled(process.env)){
   const db=await legacyLevelDatabase(process.env);
   const gasStatus=await bridge('status',identity);
   await authorizeLegacyApiFeature({db,session:s,gasStatus,resource:'attendance'});
  }
  const d=await bridge('checkin',{...identity,keyword,day});
  if(d.participantId!==s.id)throw Error('登録を確認できません');
  res.setHeader('Set-Cookie',sessionCookie(s.id,s.token,cfg.secret));res.status(200).json(d);
 }catch(e){
  if(e.message==='FEATURE_LEVEL_REQUIRED')return res.status(403).json({ok:false,error:'皆勤賞はレベル2以上の登録が必要です'});
  if(e.message==='LEVEL_AUTH_UNAVAILABLE')return res.status(503).json({ok:false,error:'認証を確認できません。時間をおいて再試行してください'});
  res.status(409).json({ok:false,error:e.message||'確認できませんでした'});
 }}
}
