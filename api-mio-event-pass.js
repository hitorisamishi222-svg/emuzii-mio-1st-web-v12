// Issue/check a scoped event ENTRY PASS for an already email-verified subject.
// THIS API NEVER verifies email, registers a MIO-ID, or changes GAS/gacha/attendance.
import pg from 'pg';
import {prepare} from './bridge.js';
import {enabled,readVerifiedEmailCookie,eventIdOK,inviteDigest,
 issueEventPass,checkEventPass} from './mio-event-pass-core.js';
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const respond=(res,status,body)=>res.status(status).json(body);
let pool;
function db(){
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,
 ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:1500,
 query_timeout:3000,statement_timeout:3000,idleTimeoutMillis:1000});
 return pool;
}
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST)
  return respond(res,403,{ok:false,code:'INVALID_ORIGIN'});
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
  return respond(res,415,{ok:false,code:'JSON_REQUIRED'});
 if(Number(req.headers['content-length']||0)>384)
  return respond(res,413,{ok:false,code:'REQUEST_TOO_LARGE'});
 let input;
 try{input=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return respond(res,400,{ok:false,code:'INVALID_JSON'})}
 if(!input||typeof input!=='object'||Array.isArray(input)||
  !['issue','check'].includes(input.action)||!eventIdOK(input.eventId)||
  Object.keys(input).some(k=>!['action','eventId','inviteCode'].includes(k)))
  return respond(res,400,{ok:false,code:'INVALID_EVENT_REQUEST'});
 if(!enabled()||!process.env.MIO_REGISTRATION_DATABASE_URL)
  return respond(res,503,{ok:false,code:'EVENT_PASSES_DISABLED'});
 const email=readVerifiedEmailCookie(req.headers.cookie,process.env.MIO_EVENT_EMAIL_SESSION_SECRET);
 if(!email)return respond(res,401,{ok:false,code:'VERIFIED_EMAIL_SESSION_REQUIRED'});
 if(input.action==='check'){
  try{
   const result=await checkEventPass(db(),{eventId:input.eventId,subjectId:email.subjectId});
   return respond(res,200,{ok:true,allowed:result.allowed});
  }catch{return respond(res,503,{ok:false,code:'EVENT_PASS_CHECK_FAILED'})}
 }
 let invitation=null;
 if(input.inviteCode!==undefined){
  try{invitation=inviteDigest(input.eventId,input.inviteCode,process.env.MIO_EVENT_INVITE_SECRET)}
  catch{return respond(res,400,{ok:false,code:'INVITE_FORMAT_INVALID'})}
 }
 const client=await db().connect().catch(()=>null);
 if(!client)return respond(res,503,{ok:false,code:'EVENT_DB_UNAVAILABLE'});
 try{
  const result=await issueEventPass(client,
   {eventId:input.eventId,subjectId:email.subjectId,inviteHash:invitation});
  // passId is for displaying/reconciliation only, never a bearer key.
  return respond(res,200,{ok:true,passId:result.passId,status:result.status});
 }catch{
  return respond(res,409,{ok:false,code:'EVENT_NOT_ELIGIBLE_OR_UNAVAILABLE'});
 }finally{client.release()}
}
