// Isolated PostgreSQL orchestration. NOT connected to production APIs or GAS.
// One canonical MIO master_id owns attendance, draws and historic records.
import {randomUUID} from 'node:crypto';
import {LEVEL,RESOURCE,issuerOwned,trustedRosterBinding,validMaster,
 safeName,validLevel,verifiedMemberGrant,issueCode,codeDigest,newSession,
 sessionDigest,verifiedDevice,sameHash,authorizedFeature} from './mio-level-access-vnext.mjs';

export async function accessTransaction(db,work){
 const client=typeof db.connect==='function'?await db.connect():db;
 try{
  await client.query('BEGIN');
  try{const result=await work(client);await client.query('COMMIT');return result}
  catch(e){await client.query('ROLLBACK');throw e}
 }finally{if(client!==db)client.release()}
}
const assertOperation=id=>{
 if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(id))
  throw Error('INVALID_OPERATION_ID');
};
export async function issuerRegisterAccess({db,actor,issuerId,masterId,displayName,
 level,memberUntil=null,memberEvidence=null,rosterProof,pepper,now=new Date(),
 operationId=randomUUID()}){
 validMaster(masterId);const name=safeName(displayName);validLevel(level);
 if(typeof issuerId!=='string'||!/^[a-z][a-z0-9_-]{1,31}$/.test(issuerId))throw Error('INVALID_ISSUER');
 assertOperation(operationId);
 trustedRosterBinding(rosterProof,masterId,name);
 const expiry=verifiedMemberGrant(level,memberUntil,memberEvidence,now);
 const {code,codeHash}=issueCode(pepper);
 const result=await accessTransaction(db,async(client)=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[masterId]);
  const issuer=(await client.query('SELECT owner_user_id,active FROM mio_level_issuers_v1 WHERE issuer_id=$1 FOR UPDATE',[issuerId])).rows[0];
  issuerOwned(actor,issuer);
  const existing=(await client.query('SELECT master_id,generation,status FROM mio_level_accounts_v1 WHERE master_id=$1 FOR UPDATE',[masterId])).rows[0];
  const operation=(await client.query('SELECT operation_id FROM mio_level_audit_v1 WHERE operation_id=$1',[operationId])).rows;
  if(operation.length)throw Error('DUPLICATE_OPERATION');
  let generation=0;
  if(existing){
   generation=Number(existing.generation);
   // Reissuing an ID must NOT change the current user's room rights.
   // The new requested level is staged on the invitation until claim.
   if(existing.status==='revoked')throw Error('REVOKED_ACCOUNT_REQUIRES_REVIEW');
  }else{
   await client.query("INSERT INTO mio_level_accounts_v1(master_id,display_name,issuer_id,level,member_until,status,generation) VALUES($1,$2,$3,$4,$5,'pending',0)",
    [masterId,name,issuerId,level,expiry]);
  }
  // Old *unredeemed* codes become unusable immediately, even if the owner
  // previously generated one but forgot to share it. Do not revoke the
  // currently successful device session until the new claim succeeds.
  const revoked=await client.query("UPDATE mio_level_invites_v1 SET status='revoked',revoked_at=now() WHERE master_id=$1 AND status='issued' RETURNING invite_id",[masterId]);
  await client.query("INSERT INTO mio_level_invites_v1(invite_id,master_id,issuer_id,generation,code_hash,status,expires_at,level,member_until) VALUES($1,$2,$3,$4,$5,'issued',$6,$7,$8)",
   [randomUUID(),masterId,issuerId,generation+1,codeHash,new Date(now.getTime()+48*3600_000),level,expiry]);
  await client.query("INSERT INTO mio_level_audit_v1(operation_id,master_id,issuer_id,actor_id,event,generation) VALUES($1,$2,$3,$4,'issue',$5)",
   [operationId,masterId,issuerId,actor.userId,generation+1]);
  return {replacedCount:revoked.rows.length,generation:generation+1};
 });
 return {...result,masterId,displayName:name,level,code,expiresAt:new Date(now.getTime()+48*3600_000).toISOString()};
}
export async function claimIssuedAccess({db,displayName,code,deviceProof,deviceInfo={},
 pepper,now=new Date()}){
 const name=safeName(displayName);
 const thumbprint=verifiedDevice(deviceProof); // MUST originate inside trusted API after fresh ECDSA challenge.
 const digest=codeDigest(code,pepper);
 const browser=String(deviceInfo.browser||'unknown').slice(0,40);
 const os=String(deviceInfo.os||'unknown').slice(0,40);
 return accessTransaction(db,async(client)=>{
  // Peek before locking; serialise on the SAME per-master advisory lock
  // as issuance, THEN lock invite/account rows in issue's order.
  // Without this order, issuance(account -> invite) and
  // redemption(invite -> account) can deadlock.
  const peek=(await client.query("SELECT master_id FROM mio_level_invites_v1 WHERE code_hash=$1 AND status='issued'",[digest])).rows[0];
  if(!peek)throw Error('INVALID_OR_USED_CODE');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[peek.master_id]);
  const item=(await client.query("SELECT invite_id,master_id,issuer_id,generation,expires_at,level,member_until FROM mio_level_invites_v1 WHERE code_hash=$1 AND status='issued' FOR UPDATE",[digest])).rows[0];
  if(!item||item.master_id!==peek.master_id||new Date(item.expires_at)<=now)throw Error('INVALID_OR_USED_CODE');
  const account=(await client.query('SELECT master_id,display_name,generation,status FROM mio_level_accounts_v1 WHERE master_id=$1 FOR UPDATE',[item.master_id])).rows[0];
  if(!account||account.status==='revoked'||safeName(account.display_name)!==name||Number(item.generation)!==Number(account.generation)+1)
   throw Error('NAME_OR_GENERATION_MISMATCH');
  const {token,sessionHash}=newSession(pepper);
  const expiresAt=new Date(now.getTime()+30*86400_000);
  const claimed=await client.query("UPDATE mio_level_invites_v1 SET status='claimed',claimed_at=now() WHERE invite_id=$1 AND status='issued' RETURNING invite_id",[item.invite_id]);
  if(claimed.rows.length!==1)throw Error('INVITE_RACE');
  const result=await client.query("UPDATE mio_level_accounts_v1 SET status='active',generation=$2,device_thumbprint=$3,device_public_jwk=$4,session_hash=$5,session_expires_at=$6,browser_hint=$7,os_hint=$8,level=$9,member_until=$10,issuer_id=$11,device_registered_at=now(),updated_at=now() WHERE master_id=$1 RETURNING master_id",
   [item.master_id,item.generation,thumbprint,deviceProof.publicJwk||null,sessionHash,expiresAt,browser,os,item.level,item.member_until,item.issuer_id]);
  if(result.rows.length!==1)throw Error('ACCOUNT_UPDATE_FAILED');
  return {masterId:item.master_id,sessionToken:token,sessionExpiresAt:expiresAt.toISOString()};
 });
}
export async function checkAccess({db,resource,token,deviceProof,pepper,now=new Date()}){
 if(resource===RESOURCE.SITE||resource===RESOURCE.PUBLIC_GALLERY)return {allowed:true,level:LEVEL.PUBLIC};
 const digest=sessionDigest(token,pepper);
 const row=(await db.query('SELECT master_id,level,status,member_until,session_hash,session_expires_at,device_thumbprint FROM mio_level_accounts_v1 WHERE session_hash=$1',[digest])).rows[0];
 if(!row||!sameHash(row.session_hash,digest)||!row.session_expires_at||new Date(row.session_expires_at)<=now)
  return {allowed:false,reason:'SESSION_EXPIRED_OR_REVOKED'};
 let freshDevice=false;
 try{freshDevice=verifiedDevice(deviceProof)===row.device_thumbprint}catch{}
 return {allowed:authorizedFeature({account:row,resource,sessionValid:true,deviceProofVerified:freshDevice,now}),
  masterId:row.master_id};
}
