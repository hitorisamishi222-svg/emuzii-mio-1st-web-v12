// Safe, opt-in promotion from a light enrollment session to a legacy MIO session.
// Never issues privileges based on names, IP matches, or Neon approval alone.
// The existing GAS bridge must recognize the EXACT browser id + token hash
// and report administrator-approved status before session promotion.
import {readLightSession} from './registration-light-session.js';
import {legacyIdentityState} from './registration-legacy-guard.js';
import {statusV201} from './registration-name-v201.js';
import {verifyAttendanceIntegration} from './attendance-integration-proof.js';
import {bridge,hash,sessionCookie} from './bridge.js';

const json=(res,code,obj)=>res.status(code).json(obj);
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return json(res,405,{ok:false,error:'POSTを使用してください'});
 }
 if(process.env.VERCEL_ENV!=='production')return json(res,503,{ok:false,error:'本番環境のみ使用できます'});
 if(process.env.MIO_ATTENDANCE_ACTIVATION!=='verified')return json(res,503,{ok:false,error:'皆勤連携は安全確認中です。従来の登録者は今までどおりご利用ください'});
 const origin=req.headers.origin;
 if(origin){
  try{if(new URL(origin).host!==req.headers.host)throw Error()}
  catch{return json(res,403,{ok:false,error:'別サイトから操作できません'})}
 }
 const state=legacyIdentityState(req.headers.cookie,process.env.APPS_SCRIPT_SECRET);
 if(state)return json(res,409,{ok:false,error:'従来の登録情報があります。トップページで参加状況を確認してください'});
 const key=process.env.MIO_LIGHT_SESSION_SECRET;
 const session=readLightSession(req.headers.cookie,key);
 if(!session)return json(res,401,{ok:false,error:'簡易登録したブラウザから操作してください'});
 try{
  const tokenHash=hash(session.token);
  const light=await statusV201(session.id,tokenHash);
  if(light.pendingReview||light.status!=='承認済み'||light.attendanceGrantVerified!==true||!/^MIO-[0-9]{4}$/.test(light.integratedParticipantId||''))return json(res,409,{ok:false,error:'本人確認・管理者承認をお待ちください'});
  // GAS verifies its own saved browser ID/tokenHash and spreadsheet approval.
  // A Neon status or name match alone is never sufficient.
  const legacy=await bridge('status',{participantId:session.id,tokenHash});
  if(!verifyAttendanceIntegration(light,legacy,session.id))
   return json(res,409,{ok:false,error:'皆勤の本人確認・登録照合がまだ完了していません。管理者へお問い合わせください'});
  const secret=process.env.APPS_SCRIPT_SECRET;
  if(!secret||secret.length<32)return json(res,503,{ok:false,error:'皆勤連携を準備中です'});
  res.setHeader('Set-Cookie',sessionCookie(session.id,session.token,secret));
  return json(res,200,{ok:true,attendanceEnabled:true,message:'皆勤の登録確認が完了しました。トップページから参加状況を確認してください'});
 }catch(e){
  console.warn('Attendance activation unavailable:',e?.code||'not_ready');
  return json(res,409,{ok:false,error:'皆勤の登録照合は未完了です。新規登録を重ねず、管理者にお問い合わせください'});
 }
}
