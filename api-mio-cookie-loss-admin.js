// Private operator review ONLY. Can never mint sessions or modify participant rights.
import pg from 'pg';
import {prepare} from './bridge.js';
import {authorizedCode} from './api-gacha-web-gate.js';
import {sessionOK} from './gacha-passkey-auth.js';
import {enabled,listCases,changeCase} from './mio-cookie-loss-intake-core.js';
const HOST='emuzii-mio-1st-web-v12.vercel.app';
let pool=null;
function db(){
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,
 ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:1200,
 query_timeout:2500,statement_timeout:2500,idleTimeoutMillis:1000});
 return pool;
}
const fail=(res,status,code)=>res.status(status).json({ok:false,code});
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST)
  return fail(res,403,'SAME_ORIGIN_REQUIRED');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
  return fail(res,415,'JSON_REQUIRED');
 if(Number(req.headers['content-length']||0)>600)return fail(res,413,'REQUEST_TOO_LARGE');
 let d;
 try{d=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return fail(res,400,'INVALID_JSON')}
 if(!d||typeof d!=='object'||Array.isArray(d)||!['read','review'].includes(d.action))
  return fail(res,400,'INVALID_ACTION');
 const codeOK=authorizedCode(d.code,process.env.MIO_GACHA_WEB_KEY_SHA256);
 const passkeyOK=codeOK?false:await sessionOK(req);
 if(!codeOK&&!passkeyOK)return fail(res,403,'ADMIN_REQUIRED');
 if(!enabled()||!process.env.MIO_REGISTRATION_DATABASE_URL)
  return fail(res,503,'MANUAL_INTAKE_DISABLED');
 try{
  if(d.action==='read')return res.status(200).json({ok:true,items:await listCases(db())});
  const client=await db().connect();
  try{
   const result=await changeCase(client,d,codeOK?'admin-code':'admin-passkey');
   return res.status(200).json({ok:true,result});
  }finally{client.release()}
 }catch{
  return fail(res,409,'CASE_REVIEW_UNCONFIRMED');
 }
}
