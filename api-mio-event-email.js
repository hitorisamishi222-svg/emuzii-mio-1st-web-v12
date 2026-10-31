// Verification is deliberately gated. Reuses the EXISTING Apps Script
// MailApp owner instead of adding an unrelated storage or mail service.
// No mail is sent until the existing GAS deployment has the reviewed action.
import pg from 'pg';
import {prepare,bridge} from './bridge.js';
import {enabled,normalizeEmail,createPendingToken,pendingCookie,
 readPendingCookie,startEmailChallenge,invalidateUnsent,finishEmailChallenge}
 from './mio-event-email-auth-core.js';
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const json=(res,status,obj)=>res.status(status).json(obj);
let pool;
function db(){
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,
 ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:1500,
 query_timeout:4000,statement_timeout:4000,idleTimeoutMillis:1000});
 return pool;
}
function ready(){
 return enabled()&&process.env.MIO_REGISTRATION_DATABASE_URL&&
  process.env.MIO_EVENT_EMAIL_HMAC_SECRET?.length>=48&&
  process.env.MIO_EVENT_EMAIL_SESSION_SECRET?.length>=48;
}
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST)
  return json(res,403,{ok:false,code:'INVALID_ORIGIN'});
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
  return json(res,415,{ok:false,code:'JSON_REQUIRED'});
 if(Number(req.headers['content-length']||0)>384)
  return json(res,413,{ok:false,code:'REQUEST_TOO_LARGE'});
 let d;
 try{d=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return json(res,400,{ok:false,code:'INVALID_JSON'})}
 if(!d||typeof d!=='object'||Array.isArray(d)||!['start','verify'].includes(d.action)||
    Object.keys(d).some(x=>!['action','email','code'].includes(x)))
  return json(res,400,{ok:false,code:'INVALID_ACTION'});
 if(!ready())return json(res,503,{ok:false,code:'EMAIL_VERIFICATION_DISABLED'});
 const secret=process.env.MIO_EVENT_EMAIL_HMAC_SECRET,
  sessionSecret=process.env.MIO_EVENT_EMAIL_SESSION_SECRET;
 if(d.action==='start'){
  if(typeof d.email!=='string'||d.code!==undefined)
   return json(res,400,{ok:false,code:'EMAIL_REQUIRED'});
  let email;try{email=normalizeEmail(d.email)}
  catch{return json(res,400,{ok:false,code:'INVALID_EMAIL'})}
  const token=createPendingToken();
  const network=String(req.headers['x-real-ip']||'unknown').slice(0,120);
  let record;
  try{
   const client=await db().connect();
   try{record=await startEmailChallenge(client,{email,token,ip:network,secret})}
   finally{client.release()}
  }catch(e){
   return json(res,/rate limit/.test(e.message||'')?429:503,
    {ok:false,code:/rate limit/.test(e.message||'')?'EMAIL_RATE_LIMIT':'EMAIL_START_FAILED'});
  }
  try{
   const sent=await bridge('eventEmailOtpSend',{
    email:record.email,code:record.code,challengeId:record.challengeId
   });
   if(sent.ok!==true||sent.sent!==true)throw Error('email not confirmed sent');
  }catch{
   try{await invalidateUnsent(db(),record.challengeId)}catch{}
   return json(res,503,{ok:false,code:'EMAIL_SENDER_NOT_CONNECTED'});
  }
  res.setHeader('Set-Cookie',pendingCookie(token));
  return json(res,202,{ok:true,status:'code_sent',expiresInSeconds:600});
 }
 if(d.email!==undefined||typeof d.code!=='string'||!/^[0-9]{6}$/.test(d.code))
  return json(res,400,{ok:false,code:'INVALID_CODE'});
 const token=readPendingCookie(req.headers.cookie);
 if(!token)return json(res,401,{ok:false,code:'PENDING_BROWSER_REQUIRED'});
 try{
  const client=await db().connect();
  let result;
  try{result=await finishEmailChallenge(client,{token,otp:d.code,secret,sessionSecret})}
  finally{client.release()}
  if(!result.verified)return json(res,409,{ok:false,code:'INCORRECT_CODE'});
  res.setHeader('Set-Cookie',[result.sessionCookie,
   '__Host-mio_event_email_pending=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
  return json(res,200,{ok:true,status:'email_verified'});
 }catch{
  return json(res,409,{ok:false,code:'VERIFICATION_NOT_CONFIRMED'});
 }
}
