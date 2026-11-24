// Postgres transaction layer for MIO-issued one-time IDs (not wired to production).
// Existing MIO IDs, GAS, gacha draws and attendance MUST NOT be rewritten here.
import { randomUUID } from 'node:crypto';
import {requireMioId,requireIssuerId,requireRank,requireOwner,requireRosterProof,
 requireDeviceThumbprint,requireDeviceProof,issueOneTimeCode,invitationHash,
 newSession,sessionHash,constantTimeSame,effectiveRank,mayEnterRoom} from './mio-issued-id-core.mjs';

const MAX_DAYS=14;
const defaultNow=()=>new Date();

// pg.Pool.query() does not pin a connection. Every multi-statement operation
// MUST acquire a single client; caller-held clients are supported for ceremony
// flows that must consume a challenge and an invitation atomically.
export async function withMioAccessTransaction(db, fn) {
 const client=typeof db.connect==='function' ? await db.connect() : db;
 try {
  await client.query('BEGIN');
  try {
   const value=await fn(client);
   await client.query('COMMIT');
   return value;
  } catch(e) {
   await client.query('ROLLBACK');
   throw e;
  }
 } finally { if(client!==db) client.release(); }
}

export async function issueMioAccessId({db,actor,issuerId,masterId,rank,memberUntil=null,
 rosterProof,pepper,operationId=randomUUID(),now=defaultNow()}) {
 requireIssuerId(issuerId);requireMioId(masterId);requireRank(rank);
 if(typeof operationId!=='string'||! /^[a-f0-9-]{36}$/.test(operationId))throw Error('INVALID_OPERATION');
 if(rank==='member' && (!memberUntil || !Number.isFinite(new Date(memberUntil).getTime()) ||
  new Date(memberUntil)<=now))throw Error('MEMBERSHIP_EXPIRY_REQUIRED');
 requireRosterProof(rosterProof,masterId);
 const {code,codeHash}=issueOneTimeCode(pepper);
 return withMioAccessTransaction(db,async(client)=>{
  const issuerRows=await client.query('SELECT issuer_id,owner_user_id,active FROM mio_access_issuers_v1 WHERE issuer_id=$1 FOR UPDATE',[issuerId]);
  requireOwner(actor,issuerRows.rows[0]);
  const duplicate=await client.query('SELECT operation_id FROM mio_access_audit_v1 WHERE operation_id=$1 LIMIT 1',[operationId]);
  if(duplicate.rows.length)throw Error('DUPLICATE_OPERATION');
  // Updating this one row invalidates ALL former device sessions immediately.
  await client.query(`INSERT INTO mio_access_accounts_v1(master_id,issuer_id,rank,member_until,generation,status)
   VALUES($1,$2,$3,$4,1,'active')
   ON CONFLICT(master_id) DO UPDATE SET issuer_id=EXCLUDED.issuer_id,
    rank=EXCLUDED.rank,member_until=EXCLUDED.member_until,status='active',
    generation=mio_access_accounts_v1.generation+1,
    device_thumbprint=NULL,device_public_jwk=NULL,session_hash=NULL,session_expires_at=NULL,
    updated_at=now()`,[masterId,issuerId,rank,memberUntil]);
  const account=await client.query('SELECT generation FROM mio_access_accounts_v1 WHERE master_id=$1 FOR UPDATE',[masterId]);
  await client.query("UPDATE mio_access_invites_v1 SET status='revoked',revoked_at=now() WHERE master_id=$1 AND status='issued'",[masterId]);
  await client.query(`INSERT INTO mio_access_invites_v1(invite_id,master_id,issuer_id,generation,code_hash,status,expires_at)
   VALUES($1,$2,$3,$4,$5,'issued',$6)`,
   [randomUUID(),masterId,issuerId,account.rows[0].generation,codeHash,new Date(now.getTime()+MAX_DAYS*86400_000)]);
  await client.query(`INSERT INTO mio_access_audit_v1(operation_id,issuer_id,master_id,actor_id,event,generation)
    VALUES($1,$2,$3,$4,'issue',$5)`,[operationId,issuerId,masterId,actor.userId,account.rows[0].generation]);
  return {masterId,issuerId,rank,generation:account.rows[0].generation,code,
   expiresAt:new Date(now.getTime()+MAX_DAYS*86400_000).toISOString()};

 });
}
export async function claimMioAccessId({db,issuerId,code,deviceProof,pepper,now=defaultNow(),existingClient=null}) {
 requireIssuerId(issuerId);
 // Device proof here must be verified by a separate challenge verifier BEFORE
 // passing to the store. No raw browser value is ever trusted.
 if(!deviceProof || deviceProof.trusted!==true || deviceProof.fresh!==true)throw Error('DEVICE_PROOF_REQUIRED');
 const thumbprint=requireDeviceThumbprint(deviceProof.keyThumbprint);
 const codeHash=invitationHash(code,pepper);
 const work=async(client)=>{
  const r=await client.query(`SELECT i.invite_id,i.master_id,i.generation,i.expires_at,
     a.generation AS current_generation,a.status AS account_status
     FROM mio_access_invites_v1 i JOIN mio_access_accounts_v1 a ON a.master_id=i.master_id
     WHERE i.issuer_id=$1 AND i.code_hash=$2 AND i.status='issued'
     FOR UPDATE OF i,a`,[issuerId,codeHash]);
  const row=r.rows[0];
  if(!row||row.account_status!=='active'||Number(row.generation)!==Number(row.current_generation)||
   new Date(row.expires_at)<=now)throw Error('INVALID_OR_USED_ID');
  requireDeviceProof(deviceProof,thumbprint);
  const {token,sessionHash:hashed}=newSession(pepper);
  const expiry=new Date(now.getTime()+30*86400_000);
  await client.query("UPDATE mio_access_invites_v1 SET status='claimed',claimed_at=now() WHERE invite_id=$1 AND status='issued'",[row.invite_id]);
  await client.query(`UPDATE mio_access_accounts_v1 SET device_thumbprint=$2,session_hash=$3,
      session_expires_at=$4,updated_at=now() WHERE master_id=$1 AND generation=$5`,
   [row.master_id,thumbprint,hashed,expiry,row.current_generation]);
  return {masterId:row.master_id,sessionToken:token,deviceThumbprint:thumbprint,expiresAt:expiry.toISOString()};

 };
 return existingClient ? work(existingClient) : withMioAccessTransaction(db,work);
}
export async function authorizeMioRoom({db,room,sessionToken,deviceProof,pepper,now=defaultNow()}) {
 if(room==='public')return {allowed:true,rank:'public'};
 // Every protected request checks current account row, not a JWT role claim;
 // after reissue or role change the former session loses access immediately.
 const hashed=sessionHash(sessionToken,pepper);
 const r=await db.query(`SELECT master_id,rank,status,member_until,device_thumbprint,session_hash,
   session_expires_at FROM mio_access_accounts_v1 WHERE session_hash=$1 LIMIT 1`,[hashed]);
 const a=r.rows[0];
 if(!a||!constantTimeSame(a.session_hash,hashed)||!a.session_expires_at||new Date(a.session_expires_at)<=now)
  return {allowed:false,reason:'SESSION_EXPIRED_OR_REVOKED'};
 try{requireDeviceProof(deviceProof,a.device_thumbprint)}catch{return {allowed:false,reason:'DEVICE_PROOF_REQUIRED'}}
 const rank=effectiveRank(a,now);
 return {allowed:mayEnterRoom(room,rank),rank,masterId:a.master_id};
}

export async function revokeMioAccess({db,actor,issuerId,masterId,pepper,rosterProof,operationId=randomUUID()}){
 requireMioId(masterId);requireIssuerId(issuerId);requireRosterProof(rosterProof,masterId);
 // Missing auth or pepper is denied before opening a transaction.
 if(typeof pepper!=='string'||pepper.length<48)throw Error('ACCESS_PEPPER_MISSING');
 return withMioAccessTransaction(db,async(client)=>{
  const i=await client.query('SELECT owner_user_id,active FROM mio_access_issuers_v1 WHERE issuer_id=$1 FOR UPDATE',[issuerId]);
  requireOwner(actor,i.rows[0]);
  const row=await client.query(`UPDATE mio_access_accounts_v1 SET generation=generation+1,
   session_hash=NULL,session_expires_at=NULL,device_thumbprint=NULL,device_public_jwk=NULL,status='revoked',updated_at=now()
   WHERE master_id=$1 AND issuer_id=$2 RETURNING generation`,[masterId,issuerId]);
  if(row.rows.length===0)throw Error('ACCOUNT_NOT_FOUND');
  await client.query("UPDATE mio_access_invites_v1 SET status='revoked',revoked_at=now() WHERE master_id=$1 AND status='issued'",[masterId]);
  await client.query(`INSERT INTO mio_access_audit_v1(operation_id,issuer_id,master_id,actor_id,event,generation)
    VALUES($1,$2,$3,$4,'revoke',$5)`,[operationId,issuerId,masterId,actor.userId,row.rows[0].generation]);
  return {ok:true,masterId};

 });
}