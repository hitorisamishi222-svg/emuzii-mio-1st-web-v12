/**
 * NEXT TEST ONLY: signed device-session proof with durable revocation.
 * This module does not connect to production, GAS, Sheets, a DB, or an HTTP route.
 *
 * The server must authenticate a device transfer/recovery separately, update the
 * participant's single active session in durable storage atomically, and supply
 * the resulting record to verifyTestDeviceSession on EVERY protected request.
 * A copied cookie remains a bearer credential until revoked. Browsers cannot
 * be reliably identified as the same person by fingerprinting alone.
 */
import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

const DOMAIN='mio-next-device-v1';
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
  if(!Buffer.isBuffer(a)||!Buffer.isBuffer(b)||a.length!==b.length)return false;
  return timingSafeEqual(a,b);
}
function sessionDigest(sessionId){
  return createHash('sha256').update(DOMAIN+':'+sessionId,'utf8').digest('hex');
}
function isValidTime(now){return Number.isSafeInteger(now)&&now>=0}
function isValidGeneration(value){return Number.isSafeInteger(value)&&value>=1}

/**
 * Server-only TEST issuance. Save sessionDigest + active device + generation
 * transactionally in a TEST database before putting token in a secure cookie.
 * Server must generate its own deviceId rather than trusting a client-supplied ID.
 */
export function issueTestDeviceSession({participantId,deviceId,generation,secret,now=Date.now(),ttlMs=7*DAY}){
  const key=requireKey(secret);
  if(!ID.test(String(participantId||''))||!ID.test(String(deviceId||''))||
      !isValidGeneration(generation)||!isValidTime(now)||!Number.isSafeInteger(ttlMs)||
      ttlMs<=0||ttlMs>MAX_TTL||now+ttlMs>Number.MAX_SAFE_INTEGER)
    throw new Error('INVALID_TEST_SESSION_INPUT');
  const sessionId=randomBytes(32).toString('base64url');
  const expiresAt=now+ttlMs;
  const payload={v:1,p:participantId,d:deviceId,g:generation,s:sessionId,i:now,e:expiresAt};
  const encoded=Buffer.from(JSON.stringify(payload),'utf8').toString('base64url');
  const signature=createHmac('sha256',key).update(DOMAIN+'.'+encoded,'utf8').digest('base64url');
  return {token:encoded+'.'+signature,sessionDigest:sessionDigest(sessionId),expiresAt};
}

/**
 * Every value in record must come from a server-side TEST database lookup
 * (never from request JSON or a UI approved toggle).
 * record: participantId, activeDeviceId, generation, sessionDigest,
 *         participantApproved, active.
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
      session.v!==1||!ID.test(String(session.p||''))||!ID.test(String(session.d||''))||
      !isValidGeneration(session.g)||typeof session.s!=='string'||
      !/^[A-Za-z0-9_-]{43}$/.test(session.s)||
      !isValidTime(session.i)||!isValidTime(session.e)||
      session.e<=session.i||session.e-session.i>MAX_TTL||session.i>now||
      session.e<=now)return deny('EXPIRED_OR_INVALID');
  if(!record||record.active!==true||record.participantApproved!==true||
      !ID.test(String(record.participantId||''))||
      !ID.test(String(record.activeDeviceId||''))||
      !isValidGeneration(record.generation)||
      typeof record.sessionDigest!=='string'||!DIGEST.test(record.sessionDigest))
    return deny('INACTIVE_OR_UNAPPROVED');
  if(record.participantId!==session.p)return deny('PARTICIPANT_MISMATCH');
  if(record.activeDeviceId!==session.d||record.generation!==session.g)return deny('REVOKED_DEVICE');
  if(!safeEqual(Buffer.from(record.sessionDigest,'hex'),Buffer.from(sessionDigest(session.s),'hex')))
    return deny('REVOKED_SESSION');
  return {ok:true,participantId:session.p,deviceId:session.d,generation:session.g};
}
