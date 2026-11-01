// Participant-originated device recovery: requires an existing signed light cookie.
// This module NEVER creates identities, changes gacha grants or calls GAS register/draw.
import pg from 'pg';
import {prepare,readSession,bridge,sessionCookie,hash} from './bridge.js';
import {readLightSession} from './registration-light-session.js';
import {statusV201} from './registration-name-v201.js';
import {requestEnabled,claimEnabled,tokenBinding,verifyExistingIdentity,
 createRecoveryRequest,redeemRecovery} from './mio-device-recovery-core.js';
const SITE='emuzii-mio-1st-web-v12.vercel.app';
const reply=(res,http,code)=>res.status(http).json({ok:false,code});
let pool;
function db(){
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,
  ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:1200,
  query_timeout:2500,statement_timeout:2500,idleTimeoutMillis:1000});
 return pool;
}
export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;
 if(req.headers.host!==SITE||req.headers.origin!=='https://'+SITE)
   return reply(res,403,'INVALID_ORIGIN');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
   return reply(res,415,'JSON_REQUIRED');
 if(Number(req.headers['content-length']||0)>320)return reply(res,413,'REQUEST_TOO_LARGE');
 let body;
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return reply(res,400,'INVALID_JSON')}
 if(!body||typeof body!=='object'||Array.isArray(body)||
    !['request','status','claim'].includes(body.action))return reply(res,400,'INVALID_ACTION');
 if(body.action==='request'&&!requestEnabled()||
    body.action==='claim'&&!claimEnabled()||
    body.action==='status'&&!requestEnabled())return reply(res,503,'DEVICE_RECOVERY_DISABLED');
 if(!process.env.MIO_REGISTRATION_DATABASE_URL||
    !process.env.MIO_LIGHT_SESSION_SECRET||
    !process.env.MIO_DEVICE_RECOVERY_BINDING_SECRET||
    process.env.MIO_DEVICE_RECOVERY_BINDING_SECRET.length<32)
   return reply(res,503,'RECOVERY_DB_NOT_READY');
 const session=readLightSession(req.headers.cookie,process.env.MIO_LIGHT_SESSION_SECRET);
 if(!session)return reply(res,401,'SIGNED_LIGHT_SESSION_REQUIRED');
 // A legacy cookie can be correctly signed but point to a retired GAS record.
 // Never treat its signature alone as proof of a working login.
 const legacy=readSession(req.headers.cookie,cfg.secret);
 if(legacy&&(legacy.id!==session.id||legacy.token!==session.token))
   return reply(res,409,'COOKIE_IDENTITY_CONFLICT');
 let binding;
 try{binding=tokenBinding(session,process.env.MIO_DEVICE_RECOVERY_BINDING_SECRET)}
 catch{return reply(res,401,'LIGHT_COOKIE_INVALID')}
 try{
  if(body.action==='status'){
   const r=await db().query(`SELECT request_id,state,expires_at FROM mio_device_recovery_requests
      WHERE web_id=$1 AND token_binding=$2
       AND expires_at>now()
       AND (state IN ('pending','approved') OR
            (state='consumed' AND redeemed_at>now()-interval '2 minutes'))
       ORDER BY requested_at DESC LIMIT 1`,[session.id,binding]);
   return res.status(200).json({ok:true,
    status:r.rows[0]?.state||'none',expiresAt:r.rows[0]?.expires_at||null});
  }
  // Both request and claim recheck existing, approved Neon + GAS identity.
  // Admin approval alone can never create a participant session.
  const identity=await verifyExistingIdentity(session,{getLight:statusV201,callGAS:bridge,digest:hash});
  if(!identity.ok)return reply(res,409,identity.code);
  if(body.action==='request'){
   const p=await db().connect();
   try{
    const saved=await createRecoveryRequest(p,identity,binding);
    return res.status(200).json({ok:true,status:saved.state,expiresAt:saved.expiresAt});
   }finally{p.release()}
  }
  const p=await db().connect();
  try{
   const row=await p.query(`SELECT request_id FROM mio_device_recovery_requests
      WHERE web_id=$1 AND mio_id=$2 AND token_binding=$3
       AND state IN ('approved','consumed') AND expires_at>now()
      ORDER BY requested_at DESC LIMIT 1`,[session.id,identity.mioId,binding]);
   if(row.rowCount!==1)return reply(res,409,'ADMIN_APPROVAL_REQUIRED');
   await redeemRecovery(p,{requestId:row.rows[0].request_id,
     webId:session.id,mioId:identity.mioId,binding});
  }finally{p.release()}
  res.setHeader('Set-Cookie',sessionCookie(session.id,session.token,cfg.secret));
  return res.status(200).json({ok:true,status:'recovered'});
 }catch{
  return reply(res,503,'RECOVERY_RETRY_REQUIRED');
 }
}
