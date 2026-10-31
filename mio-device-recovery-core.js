// Existing credential-only recovery. Never create a participant, change GAS or issue a new token.
import {createHmac,randomUUID} from 'node:crypto';
import {hash} from './bridge.js';

export const RELEASE='verified-device-recovery-20261031';
export const REQUEST_RELEASE='verified-device-recovery-request-20261031';
export const ADMIN_RELEASE='verified-device-recovery-admin-20261031';
export const CLAIM_RELEASE='verified-device-recovery-claim-20261031';
export const enabled=(env=process.env)=>env.MIO_DEVICE_RECOVERY_RELEASE===RELEASE;
export const requestEnabled=(env=process.env)=>enabled(env)&&env.MIO_DEVICE_RECOVERY_REQUEST_RELEASE===REQUEST_RELEASE;
export const adminEnabled=(env=process.env)=>enabled(env)&&env.MIO_DEVICE_RECOVERY_ADMIN_RELEASE===ADMIN_RELEASE;
export const claimEnabled=(env=process.env)=>enabled(env)&&env.MIO_DEVICE_RECOVERY_CLAIM_RELEASE===CLAIM_RELEASE;
const ID=/^MIO-W-[a-f0-9]{24}$/;
const MASTER=/^MIO-\d{4}$/;
const OP=/^[a-f0-9]{32}$/;
export function tokenBinding(session,secret){
 if(!session||!ID.test(session.id||'')||!/^[a-f0-9]{64}$/.test(session.token||'')||
    typeof secret!=='string'||secret.length<32)throw Error('signed identity and server key required');
 return createHmac('sha256',secret).update('mio-device-recovery-v1:'+session.id+':'+session.token).digest('hex');
}
export async function verifyExistingIdentity(session,{getLight,callGAS,digest=hash}){
 if(!session||!ID.test(session.id||'')||!/^[a-f0-9]{64}$/.test(session.token||''))
  return {ok:false,code:'SIGNED_SESSION_REQUIRED'};
 const tokenHash=digest(session.token);
 let neon,gas;
 try{neon=await getLight(session.id,tokenHash)}
 catch{return {ok:false,code:'REGISTRATION_LOOKUP_FAILED'}}
 if(!neon||neon.ok!==true||neon.participantId!==session.id||
    neon.pendingReview!==false||neon.status!=='承認済み'||
    neon.attendanceGrantVerified!==true||!MASTER.test(neon.integratedParticipantId||'')||
    typeof neon.name!=='string'||!neon.name.trim())
  return {ok:false,code:'REGISTRATION_NOT_VERIFIED'};
 try{gas=await callGAS('status',{participantId:session.id,tokenHash})}
 catch{return {ok:false,code:'GAS_LOOKUP_FAILED'}}
 if(!gas||gas.ok!==true||gas.participantId!==session.id||
    gas.name!==neon.name||gas.status!=='承認済み'||
    !gas.progress||!Array.isArray(gas.progress.attendanceConfirmedDays)||
    !Array.isArray(gas.progress.attendanceLockedDays))
  return {ok:false,code:'GAS_IDENTITY_MISMATCH'};
 const gacha=gas.progress.gacha;
 if(!gacha||gacha.confirmed!==true||
    !Number.isSafeInteger(Number(gacha.total))||Number(gacha.total)<1||
    !Number.isSafeInteger(Number(gacha.remaining))||Number(gacha.remaining)<0)
  return {ok:false,code:'GAS_GACHA_PROOF_MISSING'};
 return {ok:true,webId:session.id,mioId:neon.integratedParticipantId,
  name:neon.name,tokenHash,gasStatus:gas};
}
export async function createRecoveryRequest(client,identity,binding){
 if(!identity?.ok||!ID.test(identity.webId||'')||!MASTER.test(identity.mioId||'')||
    !/^[a-f0-9]{64}$/.test(binding||''))throw Error('verified participant required');
 await client.query('BEGIN');
 try{
  await client.query(`UPDATE mio_device_recovery_requests SET state='expired'
   WHERE web_id=$1 AND state IN ('pending','approved') AND expires_at<=now()`,[identity.webId]);
  const r=await client.query(`INSERT INTO mio_device_recovery_requests
    (request_id,web_id,mio_id,display_name,token_binding,state,expires_at)
    VALUES ($1,$2,$3,$4,$5,'pending',now()+interval '15 minutes')
    ON CONFLICT (web_id) WHERE state IN ('pending','approved')
    DO UPDATE SET requested_at=now()
    WHERE mio_device_recovery_requests.token_binding=$5
      AND mio_device_recovery_requests.mio_id=$3
      AND mio_device_recovery_requests.expires_at>now()
    RETURNING request_id,state,expires_at`,
   [randomUUID(),identity.webId,identity.mioId,identity.name.slice(0,80),binding]);
  if(r.rowCount!==1)throw Error('another recovery browser is already pending');
  await client.query('COMMIT');
  return {requestId:r.rows[0].request_id,state:r.rows[0].state,expiresAt:r.rows[0].expires_at};
 }catch(e){await client.query('ROLLBACK');throw e}
}
export async function listRecoveryRequests(query){
 const r=await query(`SELECT request_id,web_id,mio_id,display_name,state,requested_at,expires_at
   FROM mio_device_recovery_requests WHERE state IN ('pending','approved')
   AND expires_at>now() ORDER BY requested_at DESC LIMIT 80`,[]);
 return (r.rows||[]).map(v=>({
  requestId:v.request_id,webId:v.web_id,mioId:v.mio_id,name:v.display_name,
  state:v.state,requestedAt:v.requested_at,expiresAt:v.expires_at
 }));
}
export async function approveRecoveryRequest(client,{requestId,webId,mioId,operationId},actor){
 if(typeof requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(requestId)||
   !ID.test(webId||'')||!MASTER.test(mioId||'')||!OP.test(operationId||'')||
   !['admin-code','admin-passkey'].includes(actor))throw Error('invalid approval');
 await client.query('BEGIN');
 try{
  const r=await client.query(`SELECT state,web_id,mio_id,approved_operation_id FROM mio_device_recovery_requests
   WHERE request_id=$1 FOR UPDATE`,[requestId]);
  if(r.rowCount!==1)throw Error('recovery request missing');
  const row=r.rows[0];
  if(row.web_id!==webId||row.mio_id!==mioId)throw Error('participant identity changed');
  if(row.state==='approved'&&row.approved_operation_id===operationId){
   await client.query('COMMIT');return {replayed:true,status:'approved'};
  }
  if(row.state!=='pending')throw Error('request no longer pending');
  const u=await client.query(`UPDATE mio_device_recovery_requests
   SET state='approved',approved_operation_id=$4,approved_by=$5,approved_at=now()
   WHERE request_id=$1 AND web_id=$2 AND mio_id=$3
    AND state='pending' AND expires_at>now() RETURNING request_id`,
   [requestId,webId,mioId,operationId,actor]);
  if(u.rowCount!==1)throw Error('request expired or modified');
  await client.query('COMMIT');
  return {replayed:false,status:'approved'};
 }catch(e){await client.query('ROLLBACK');throw e}
}
export async function redeemRecovery(client,{requestId,webId,mioId,binding}){
 if(!ID.test(webId||'')||!MASTER.test(mioId||'')||
    !/^[0-9a-f-]{36}$/i.test(requestId||'')||!/^[a-f0-9]{64}$/.test(binding||''))
  throw Error('invalid claim');
 await client.query('BEGIN');
 try{
  const r=await client.query(`UPDATE mio_device_recovery_requests
   SET state='consumed',redeemed_at=now()
   WHERE request_id=$1 AND web_id=$2 AND mio_id=$3 AND token_binding=$4
     AND state='approved' AND expires_at>now() RETURNING request_id`,
    [requestId,webId,mioId,binding]);
  if(r.rowCount!==1)throw Error('approval not valid for this browser');
  await client.query('COMMIT');
  return true;
 }catch(e){await client.query('ROLLBACK');throw e}
}
