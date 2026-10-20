// Lightweight public enrollment. Isolated from legacy GAS, privileges and sessions.
import {registerV201,statusV201} from './registration-name-v201.js';
import {identityFromRetryKey} from './registration-attempt.js';
import {hash} from './bridge.js';
import {legacyIdentityState} from './registration-legacy-guard.js';
import {auditEnrollmentIP} from './registration-ip-audit-v202.js';
import {readLightSession,setLightSessionCookie} from './registration-light-session.js';
function secret(){const s=process.env.MIO_LIGHT_SESSION_SECRET;if(!s||s.length<48)throw Error('registration secret missing');return s}
const respond=(res,code,obj)=>res.status(code).json(obj);
// A valid legacy signed cookie means this device already has a MIO identity.
// This is only a duplicate-registration guard; it never grants privileges.
// Audit is advisory and must never block enrollment or disclose IP data.
async function audit(req,id,event){try{await auditEnrollmentIP(req,id,event)}catch(e){console.warn('IP audit unavailable:',e?.code||'error')}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(process.env.VERCEL_ENV!=='production')return respond(res,503,{ok:false,error:'本番サイトから登録してください'});
 if(process.env.MIO_LIGHT_REGISTRATION_OPEN!=='enabled')return respond(res,503,{ok:false,error:'簡易登録受付は準備中です'});
 let key;try{key=secret();if(!process.env.MIO_REGISTRATION_DATABASE_URL)throw Error()}catch{return respond(res,503,{ok:false,error:'登録先を準備中です'})}
 const origin=req.headers.origin;
 if(origin){try{if(new URL(origin).host!==req.headers.host)throw Error()}catch{return respond(res,403,{ok:false,error:'別サイトから操作できません'})}}
 const existing=readLightSession(req.headers.cookie,key);
 const legacyState=legacyIdentityState(req.headers.cookie,process.env.APPS_SCRIPT_SECRET);
 if(req.method==='GET'){
  if(legacyState)return respond(res,200,{ok:true,registered:false,legacyRegistration:true,legacyPending:legacyState==='pending',access:'legacy'});
  if(!existing)return respond(res,200,{ok:true,registered:false,access:'public'});
  try{const d=await statusV201(existing.id,hash(existing.token));await audit(req,existing.id,'status');return respond(res,200,{ok:true,registered:!d.pendingReview,pendingReview:!!d.pendingReview,access:d.pendingReview?'review':'basic',name:d.name,participantId:d.participantId,status:d.status})}
  catch{return respond(res,401,{ok:false,registered:false,error:'登録情報を確認できません'})}
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return respond(res,405,{ok:false})}
 if(legacyState)return respond(res,409,{ok:false,legacyRegistration:true,legacyPending:legacyState==='pending',error:legacyState==='pending'?'この端末には従来の登録手続きが残っています。重複登録をせず、登録状況を管理者に確認してください':'この端末には従来の登録情報があります。新規登録せず、トップの参加状況を確認してください。端末変更は管理者へご連絡ください'});
 if(existing){try{const d=await statusV201(existing.id,hash(existing.token));await audit(req,existing.id,'status');return respond(res,200,{ok:true,registered:!d.pendingReview,pendingReview:!!d.pendingReview,access:d.pendingReview?'review':'basic',name:d.name,participantId:d.participantId,status:d.status})}catch{return respond(res,409,{ok:false,error:'登録情報の確認が必要です'})}}
 const b=req.body||{};
 if(typeof b.name!=='string'||typeof b.retryKey!=='string'||!Number.isSafeInteger(b.retryIssuedAt))return respond(res,400,{ok:false,error:'入力内容を確認してください'});
 const name=b.name.trim();
 if(name.length<1||name.length>40||/[\x00-\x1f]/.test(name))return respond(res,400,{ok:false,error:'ColorSing名は1〜40文字で入力してください'});
 const identity=identityFromRetryKey(b.retryKey,key,b.retryIssuedAt);
 if(!identity)return respond(res,409,{ok:false,error:'再送期限切れです。運営へ確認してください。新規登録を重ねないでください'});
 try{
  const d=await registerV201({browserId:identity.id,tokenHash:hash(identity.token),name,loginId:''});
  res.setHeader('Set-Cookie',setLightSessionCookie(identity.id,identity.token,key));
  await audit(req,identity.id,'registration');
  return respond(res,d.created?201:200,{ok:true,registered:!d.pendingReview,pendingReview:!!d.pendingReview,access:d.pendingReview?'review':'basic',participantId:d.participantId,name:d.name,status:d.status});
 }catch(e){
  if(/identity mismatch|invalid/.test(String(e.message)))return respond(res,409,{ok:false,error:'以前の登録内容と一致しません。運営へ確認してください'});
  return respond(res,502,{ok:false,error:'保存の確認ができません。同じ内容で再送してください'});
 }
}
