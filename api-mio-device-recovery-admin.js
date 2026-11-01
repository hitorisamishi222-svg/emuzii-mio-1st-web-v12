// Owner-only approval of an already signed, Neon/GAS-verified browser request.
// Does not create credentials, alter participant tables or grant gacha rights.
import pg from 'pg';
import {prepare} from './bridge.js';
import {authorizedCode} from './api-gacha-web-gate.js';
import {sessionOK} from './gacha-passkey-auth.js';
import {adminEnabled,listRecoveryRequests,approveRecoveryRequest} from './mio-device-recovery-core.js';
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const reply=(res,http,code)=>res.status(http).json({ok:false,code});
let pool;
function db(){
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,
  ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:1200,
  query_timeout:2500,statement_timeout:2500,idleTimeoutMillis:1000});
 return pool;
}
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST)
  return reply(res,403,'INVALID_ORIGIN');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
  return reply(res,415,'JSON_REQUIRED');
 if(Number(req.headers['content-length']||0)>650)return reply(res,413,'REQUEST_TOO_LARGE');
 let body;
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return reply(res,400,'INVALID_JSON')}
 if(!body||typeof body!=='object'||Array.isArray(body)||
    !['read','approve'].includes(body.action))return reply(res,400,'INVALID_ACTION');
 const codeOK=authorizedCode(body.code,process.env.MIO_GACHA_WEB_KEY_SHA256);
 const passkeyOK=codeOK?false:await sessionOK(req);
 if(!codeOK&&!passkeyOK)return reply(res,403,'ADMIN_REQUIRED');
 if(!adminEnabled()||!process.env.MIO_REGISTRATION_DATABASE_URL)
  return reply(res,503,'DEVICE_RECOVERY_NOT_READY');
 try{
  if(body.action==='read'){
   const items=await listRecoveryRequests((sql,args)=>db().query(sql,args));
   return res.status(200).json({ok:true,items});
  }
  const client=await db().connect();
  try{
   const result=await approveRecoveryRequest(client,{
     requestId:body.requestId,webId:body.webId,mioId:body.mioId,operationId:body.operationId
   },codeOK?'admin-code':'admin-passkey');
   return res.status(200).json({ok:true,result});
  }finally{client.release()}
 }catch{
  return reply(res,409,'RECOVERY_APPROVAL_UNCONFIRMED');
 }
}
