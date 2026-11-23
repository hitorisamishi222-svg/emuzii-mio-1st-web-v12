// Preview-only orchestration. Not routed by vercel.json or production APIs.
// Signature and one-time nonce consumption are bound to the same pg transaction
// as invitation claiming; invalid, replayed or reissued IDs fail closed.
import {createHash,randomUUID} from 'node:crypto';
import {invitationHash,sessionHash,requireIssuerId,mayEnterRoom,effectiveRank} from './mio-issued-id-core.mjs';
import {makeDeviceChallenge,deviceKeyThumbprint,verifyDeviceSignature,confirmedOneTimeDeviceProof} from './mio-issued-device-proof.mjs';
import {withMioAccessTransaction,claimMioAccessId,authorizeMioRoom} from './mio-issued-id-store.mjs';

const hash = value=>createHash('sha256').update(value).digest('hex');
const CHALLENGE_TTL_MS=120000;
const validRoom=room=>room==='fan'||room==='member';
const claimRequestHash=(issuerId,codeHash,thumb)=>hash(['MIO-CLAIM-v1',issuerId,codeHash,thumb].join('\n'));
const roomRequestHash=(room,hashed)=>hash(['MIO-ROOM-v1',room,hashed].join('\n'));

export async function beginClaimChallenge({db,issuerId,code,jwk,pepper,now=new Date()}){
 requireIssuerId(issuerId);
 const codeHash=invitationHash(code,pepper);
 const thumb=deviceKeyThumbprint(jwk);
 const r=await db.query(
   `SELECT i.generation,i.expires_at,a.generation AS current_generation,a.status AS account_status
      FROM mio_access_invites_v1 i
      JOIN mio_access_accounts_v1 a ON a.master_id=i.master_id
      WHERE i.issuer_id=$1 AND i.code_hash=$2 AND i.status='issued' LIMIT 1`,
    [issuerId,codeHash]);
 const x=r.rows[0];
 if(!x||x.account_status!=='active'||Number(x.generation)!==Number(x.current_generation)||
    new Date(x.expires_at)<=now)throw Error('INVALID_OR_USED_ID');
 const nonce=makeDeviceChallenge(),requestHash=claimRequestHash(issuerId,codeHash,thumb);
 await db.query(`INSERT INTO mio_access_challenges_v1(challenge_id,issuer_id,nonce_hash,purpose,
    request_hash,bound_code_hash,bound_device_thumbprint,expires_at)
    VALUES($1,$2,$3,'claim',$4,$5,$6,$7)`,
    [randomUUID(),issuerId,hash(nonce),requestHash,codeHash,thumb,new Date(now.getTime()+CHALLENGE_TTL_MS)]);
 return {nonce,requestHash,purpose:'claim',expiresInSeconds:120};
}

export async function finishClaimChallenge({db,issuerId,code,jwk,nonce,signature,pepper,now=new Date()}){
 requireIssuerId(issuerId);
 const codeHash=invitationHash(code,pepper);
 const thumb=deviceKeyThumbprint(jwk);
 const requestHash=claimRequestHash(issuerId,codeHash,thumb);
 const verified=verifyDeviceSignature({jwk,purpose:'claim',nonce,requestHash,signature});
 return withMioAccessTransaction(db,async(client)=>{
  const used=await client.query(`UPDATE mio_access_challenges_v1 SET used_at=now()
    WHERE issuer_id=$1 AND nonce_hash=$2 AND purpose='claim'
      AND request_hash=$3 AND bound_code_hash=$4 AND bound_device_thumbprint=$5
      AND used_at IS NULL AND expires_at>$6
    RETURNING purpose,request_hash,expires_at`,
    [issuerId,hash(nonce),requestHash,codeHash,thumb,now]);
  if(used.rows.length!==1)throw Error('CHALLENGE_EXPIRED_OR_REPLAYED');
  const verifiedProof=confirmedOneTimeDeviceProof({
   verification:verified,
   committedChallenge:{...used.rows[0],serverCommit:true,nonce},now
  });
  const claim=await claimMioAccessId({
   db:client,existingClient:client,issuerId,code,deviceProof:verifiedProof,pepper,now
  });
  const bound=await client.query(
    `UPDATE mio_access_accounts_v1 SET device_public_jwk=$2
     WHERE master_id=$1 AND device_thumbprint=$3 AND session_hash IS NOT NULL
     RETURNING master_id`,[claim.masterId,jwk,thumb]);
  if(bound.rows.length!==1)throw Error('DEVICE_BIND_FAILED');
  return {...claim,issuerId};
 });
}

export async function beginRoomChallenge({db,room,sessionToken,pepper,now=new Date()}){
 if(!validRoom(room))throw Error('INVALID_PROTECTED_ROOM');
 const hashed=sessionHash(sessionToken,pepper);
 const a=await db.query(`SELECT rank,status,member_until,session_expires_at,device_public_jwk
   FROM mio_access_accounts_v1 WHERE session_hash=$1 LIMIT 1`,[hashed]);
 const account=a.rows[0];
 if(!account||account.status!=='active'||!account.device_public_jwk||
   !account.session_expires_at||new Date(account.session_expires_at)<=now)
   throw Error('SESSION_EXPIRED_OR_REVOKED');
 if(!mayEnterRoom(room,effectiveRank(account,now)))throw Error('ROOM_FORBIDDEN');
 const nonce=makeDeviceChallenge(),requestHash=roomRequestHash(room,hashed);
 await db.query(`INSERT INTO mio_access_challenges_v1(challenge_id,issuer_id,nonce_hash,purpose,
   request_hash,bound_session_hash,bound_room,expires_at)
   SELECT $1,issuer_id,$2,'room',$3,$4,$5,$6
   FROM mio_access_accounts_v1 WHERE session_hash=$4 AND status='active'`,
   [randomUUID(),hash(nonce),requestHash,hashed,room,new Date(now.getTime()+CHALLENGE_TTL_MS)]);
 return {nonce,requestHash,purpose:'room',expiresInSeconds:120};
}

export async function finishRoomChallenge({db,room,sessionToken,nonce,signature,pepper,now=new Date()}){
 if(!validRoom(room))throw Error('INVALID_PROTECTED_ROOM');
 const hashed=sessionHash(sessionToken,pepper);
 const requestHash=roomRequestHash(room,hashed);
 return withMioAccessTransaction(db,async(client)=>{
  const used=await client.query(`UPDATE mio_access_challenges_v1 SET used_at=now()
   WHERE nonce_hash=$1 AND purpose='room' AND bound_session_hash=$2 AND bound_room=$3
    AND request_hash=$4 AND used_at IS NULL AND expires_at>$5
   RETURNING purpose,request_hash,expires_at`,
   [hash(nonce),hashed,room,requestHash,now]);
  if(used.rows.length!==1)throw Error('CHALLENGE_EXPIRED_OR_REPLAYED');
  const r=await client.query(`SELECT device_public_jwk,device_thumbprint FROM mio_access_accounts_v1
    WHERE session_hash=$1 AND status='active' AND session_expires_at>$2 FOR UPDATE`,[hashed,now]);
  const account=r.rows[0];
  if(!account?.device_public_jwk)throw Error('SESSION_EXPIRED_OR_REVOKED');
  const verified=verifyDeviceSignature({
   jwk:account.device_public_jwk,purpose:'room',nonce,requestHash,signature
  });
  if(verified.keyThumbprint!==account.device_thumbprint)throw Error('DEVICE_KEY_MISMATCH');
  const proof=confirmedOneTimeDeviceProof({
   verification:verified,committedChallenge:{...used.rows[0],serverCommit:true,nonce},now
  });
  const result=await authorizeMioRoom({
   db:client,room,sessionToken,deviceProof:proof,pepper,now
  });
  if(!result.allowed)throw Error('ROOM_FORBIDDEN');
  return result;
 });
}
