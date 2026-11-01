// Public cookie-loss intake: intake and own-ticket status only, never authenticate.
import pg from 'pg';
import {prepare} from './bridge.js';
import {enabled,cookieValue,cookieHeader,readCookie,submitIntake,caseStatus}
 from './mio-cookie-loss-intake-core.js';
const SITE='emuzii-mio-1st-web-v12.vercel.app';
let pool=null;
function db(){
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,
 ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:1200,query_timeout:2500,
 statement_timeout:2500,idleTimeoutMillis:1000});
 return pool;
}
function fail(res,status,code){return res.status(status).json({ok:false,code})}
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==SITE||req.headers.origin!=='https://'+SITE)
  return fail(res,403,'SAME_ORIGIN_REQUIRED');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
  return fail(res,415,'JSON_REQUIRED');
 if(Number(req.headers['content-length']||0)>512)return fail(res,413,'REQUEST_TOO_LARGE');
 let d;
 try{d=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return fail(res,400,'INVALID_JSON')}
 if(!d||typeof d!=='object'||Array.isArray(d)||!['submit','status'].includes(d.action))
  return fail(res,400,'INVALID_ACTION');
 if(!enabled()||!process.env.MIO_REGISTRATION_DATABASE_URL)
  return fail(res,503,'MANUAL_INTAKE_DISABLED');
 const token=readCookie(req.headers.cookie);
 try{
  if(d.action==='status')return res.status(200).json(await caseStatus(db(),token));
  if(token){
   const previous=await caseStatus(db(),token);
   if(previous.status!=='none')return res.status(200).json({ok:true,status:previous.status});
  }
  // A brand new random cookie only identifies this manual support case.
  // It is NOT a browser login credential and can never be exchanged for one.
  const newToken=cookieValue();
  const {action,...fields}=d;
  const saved=await submitIntake(db(),fields,newToken);
  res.setHeader('Set-Cookie',cookieHeader(newToken));
  return res.status(202).json(saved);
 }catch(e){
  return fail(res,/invalid|unexpected|unknown/.test(e.message||'')?400:503,'INTAKE_NOT_CONFIRMED');
 }
}
