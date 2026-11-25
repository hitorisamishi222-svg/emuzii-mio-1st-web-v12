// Preview-gated owner operations. Never route to legacy registration/gacha APIs.
// Client names, level flags or claimed roster proof do NOT grant access.
import pg from 'pg';
import {bridge} from './bridge.js';
import {authorizedCode} from './api-gacha-web-gate.js';
import {sessionOK} from './gacha-passkey-auth.js';
import {issuerRegisterAccess} from './mio-level-registration-vnext.mjs';
import {ownerOperationInput,verifiedRosterTarget,
 verifiedMembershipEvidence,restrictedRosterView} from './mio-level-admin-gate-vnext.mjs';

const HOST='emuzii-mio-1st-web-v12.vercel.app';
const RELEASE='vnext-verified';
const fail=(res,http,code)=>res.status(http).json({ok:false,error:code});
let pool;
function database(){
 if(!process.env.MIO_LEVEL_DATABASE_URL)throw Error('LEVEL_DATABASE_UNAVAILABLE');
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_LEVEL_DATABASE_URL,
   ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000});
 return pool;
}
async function liveRoster(callGAS){
 const result=await callGAS('webAdminOpsRead',{});
 if(result?.ok!==true||!Array.isArray(result.roster)||!Array.isArray(result.approvedBrowsers))
  throw Error('VERIFIED_ROSTER_UNAVAILABLE');
 return result;
}

export async function processOwnerOperation({
 d,db,callGAS=bridge,actor,pepper,now=new Date(),issue=issuerRegisterAccess
}){
 if(d?.action==='read'){
  const live=await liveRoster(callGAS);
  const roster=restrictedRosterView(live.roster);
  // Do not leak device credentials or gacha entitlements in this API.
  const master=typeof d.masterId==='string'?d.masterId:'';
  let current=null;
  if(master&&roster.some(p=>p.mioId===master)){
   const x=await db.query('SELECT master_id,level,status,generation,member_until,device_registered_at FROM mio_level_accounts_v1 WHERE master_id=$1',[master]);
   if(x.rows.length===1)current={masterId:x.rows[0].master_id,level:x.rows[0].level,
    status:x.rows[0].status,generation:Number(x.rows[0].generation),
    memberUntil:x.rows[0].member_until,deviceRegisteredAt:x.rows[0].device_registered_at};
  }
  return {ok:true,roster,current};
 }
 const input=ownerOperationInput(d);
 const live=await liveRoster(callGAS);
 const rosterProof=verifiedRosterTarget(live.roster,input.masterId,input.displayName);
 const membership=verifiedMembershipEvidence({level:input.level,masterId:input.masterId,
  approvedBrowsers:live.approvedBrowsers,memberUntil:d.memberUntil,confirmed:d.memberConfirmed,now});
 const result=await issue({db,actor,issuerId:'mio',masterId:input.masterId,
  displayName:input.displayName,level:input.level,rosterProof,
  memberUntil:membership.memberUntil,memberEvidence:membership.memberEvidence,
  pepper,now,operationId:input.operationId});
 return {ok:true,masterId:result.masterId,displayName:result.displayName,level:result.level,
  recoveryId:result.code,expiresAt:result.expiresAt,
  replacedCount:result.replacedCount,generation:result.generation};
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(process.env.MIO_LEVEL_ADMIN_RELEASE!==RELEASE||
    process.env.VERCEL_ENV!=='production')
  return fail(res,503,'NOT_RELEASED');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(res,405,'METHOD_NOT_ALLOWED')}
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST)
  return fail(res,403,'ORIGIN_FORBIDDEN');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||
    Number(req.headers['content-length']||0)>3072)
  return fail(res,400,'INVALID_REQUEST');
 const d=typeof req.body==='object'&&req.body&&!Array.isArray(req.body)?req.body:{};
 if(!['read','issue'].includes(d.action))return fail(res,400,'INVALID_ACTION');
 const verified=authorizedCode(d.adminCode,process.env.MIO_GACHA_WEB_KEY_SHA256)||
  await sessionOK(req);
 if(!verified)return fail(res,403,'OWNER_AUTH_REQUIRED');
 const ownerId=process.env.MIO_LEVEL_OWNER_USER_ID;
 const pepper=process.env.MIO_LEVEL_ACCESS_PEPPER;
 if(!ownerId||!pepper||pepper.length<48||!process.env.MIO_LEVEL_DATABASE_URL)
  return fail(res,503,'ADMIN_BACKEND_NOT_READY');
 try{
  const result=await processOwnerOperation({d,db:database(),
   actor:{source:'server-session',role:'owner',userId:ownerId},pepper});
  return res.status(200).json(result);
 }catch(e){
  // Do not echo database errors, code hashes, GAS identity details or secrets.
  const code=String(e?.message||'');
  const acceptable=new Set(['ROSTER_IDENTITY_REVIEW_REQUIRED','ROSTER_UNAVAILABLE',
   'MEMBERSHIP_RECORD_UNVERIFIED','MEMBERSHIP_EXPIRY_REQUIRED',
   'MEMBERSHIP_OWNER_CONFIRMATION_REQUIRED','OWNER_CONFIRMATION_REQUIRED',
   'INVALID_OPERATION_ID','DUPLICATE_OPERATION','INVALID_LEVEL',
   'VERIFIED_ROSTER_UNAVAILABLE','OWNER_AUTH_REQUIRED']);
  console.warn('MIO level-admin pre-release error',acceptable.has(code)?code:'OPERATION_FAILED');
  return fail(res,409,acceptable.has(code)?code:'ADMIN_OPERATION_FAILED');
 }
}
