/**
 * NEXT TEST ONLY: signed per-device sessions with durable individual revocation.
 * This module does not connect to production, GAS, Sheets, a DB, or an HTTP route.
 *
 * Each signed token maps to one persisted session row. Multiple rows may belong
 * to one participant, so logging out one device leaves the other devices active.
 */
import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

const DOMAIN='mio-next-device-v2';
const DAY=86_400_000;
const MAX_TTL=30*DAY;
const ID=/^[A-Za-z0-9_-]{3,120}$/;
const DIGEST=/^[0-9a-f]{64}$/;
const B64=/^[A-Za-z0-9_-]+$/;

function requireKey(secret){
  const key=Buffer.isBuffer(secret)?secret:typeof secret==='string'?Buffer.from(secret,'utf8'):null;
  if(!key || key.length<32)throw new Error('TEST_SESSION_SECRET_REQUIRED');
  return key;
}
function safeEqual(a,b){
  return Buffer.isBuffer(a)&&Buffer.isBuffer(b)&&a.length===b.length&&timingSafeEqual(a,b);
}
function sessionDigest(sessionId){
  return createHash('sha256').update(DOMAIN+':'+sessionId,'utf8').digest('hex');
}
function isValidTime(now){return Number.isSafeInteger(now)&&now>=0}

/** Server-only TEST issuance. Persist the returned row before setting a cookie. */
export function issueTestDeviceSession({participantId,deviceId,secret,now=Date.now(),ttlMs=7*DAY}){
  const key=requireKey(secret);
  if(!ID.test(String(participantId||''))||!ID.test(String(deviceId||''))||
      !isValidTime(now)||!Number.isSafeInteger(ttlMs)||ttlMs<=0||
      ttlMs>MAX_TTL||now+ttlMs>Number.MAX_SAFE_INTEGER)
    throw new Error('INVALID_TEST_SESSION_INPUT');
  const sessionId=randomBytes(32).toString('base64url');
  const expiresAt=now+ttlMs;
  const payload={v:2,p:participantId,d:deviceId,sid:sessionId,i:now,e:expiresAt};
  const encoded=Buffer.from(JSON.stringify(payload),'utf8').toString('base64url');
  const signature=createHmac('sha256',key).update(DOMAIN+'.'+encoded,'utf8').digest('base64url');
  return {token:encoded+'.'+signature,sessionId,deviceId,sessionDigest:sessionDigest(sessionId),expiresAt};
}

/**
 * record must be fetched from the TEST session table on each protected request.
 * Never derive participant identity or approval from request JSON.
 */
export function verifyTestDeviceSession({token,secret,record,now=Date.now()}){
  const key=requireKey(secret);
  const deny=(reason)=>({ok:false,reason});
  if(!isValidTime(now)||typeof token!=='string'||token.length>2048)return deny('BAD_TOKEN');
  const chunks=token.split('.');
  if(chunks.length!==2||!chunks.every(v=>B64.test(v)))return deny('BAD_TOKEN');
  const [encoded,signature]=chunks;
  if(encoded.length>1600||signature.length!==43)return deny('BAD_TOKEN');
  const signatureBytes=Buffer.from(signature,'base64url');
  const expected=createHmac('sha256',key).update(DOMAIN+'.'+encoded,'utf8').digest();
  if(!safeEqual(signatureBytes,expected))return deny('BAD_SIGNATURE');
  let session;
  try{session=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'))}
  catch{return deny('BAD_PAYLOAD')}
  if(!session||typeof session!=='object'||Array.isArray(session)||
      session.v!==2||!ID.test(String(session.p||''))||!ID.test(String(session.d||''))||
      typeof session.sid!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(session.sid)||
      !isValidTime(session.i)||!isValidTime(session.e)||
      session.e<=session.i||session.e-session.i>MAX_TTL||session.i>now||session.e<=now)
    return deny('EXPIRED_OR_INVALID');
  if(!record||record.active!==true||record.participantApproved!==true||
      record.revoked===true||!ID.test(String(record.participantId||''))||
      !ID.test(String(record.deviceId||''))||
      typeof record.sessionId!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(record.sessionId)||
      typeof record.sessionDigest!=='string'||!DIGEST.test(record.sessionDigest))
    return deny('INACTIVE_OR_UNAPPROVED');
  if(record.participantId!==session.p)return deny('PARTICIPANT_MISMATCH');
  if(record.deviceId!==session.d||record.sessionId!==session.sid)return deny('REVOKED_SESSION');
  if(!safeEqual(Buffer.from(record.sessionDigest,'hex'),Buffer.from(sessionDigest(session.sid),'hex')))
    return deny('REVOKED_SESSION');
  if(!isValidTime(record.expiresAt)||record.expiresAt<=now||record.expiresAt!==session.e)
    return deny('EXPIRED_OR_INVALID');
  return {ok:true,participantId:session.p,deviceId:session.d,sessionId:session.sid};
}

/** Revoke just this authenticated session; other devices remain signed in. */
export async function revokeTestDeviceSession({store,participantId,sessionId,now=Date.now()}){
  if(!ID.test(String(participantId||''))||
      typeof sessionId!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(sessionId)||
      !isValidTime(now))throw new Error('INVALID_TEST_LOGOUT_REQUEST');
  if(!store||typeof store.transaction!=='function')throw new Error('TRANSACTIONAL_TEST_STORE_REQUIRED');
  return store.transaction(async(tx)=>{
    if(!tx||typeof tx.revokeSession!=='function')throw new Error('INCOMPLETE_TEST_TRANSACTION');
    return tx.revokeSession({participantId,sessionId,revokedAt:now});
  });
}
