// Email ownership proof for event entry only. A free email address is a destination,
// NOT an identity proof until a server-generated OTP is verified in this browser.
import {createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {verifiedEmailCookie} from './mio-event-pass-core.js';
export const RELEASE='verified-event-email-otp-20261101';
export const enabled=(env=process.env)=>env.MIO_EVENT_EMAIL_OTP_RELEASE===RELEASE;
export const PENDING='__Host-mio_event_email_pending';
const SECRET=x=>typeof x==='string'&&x.length>=48;
const HEX=/^[a-f0-9]{64}$/;
export function normalizeEmail(input){
 if(typeof input!=='string')throw Error('invalid email');
 const email=input.trim().toLowerCase();
 // Conservative ASCII address for common Gmail/Yahoo/iCloud/free providers;
 // never use this to infer legal identity or unique human.
 if(email.length<5||email.length>254||
   !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)||
   email.includes('..'))throw Error('invalid email');
 return email;
}
const digest=(secret,prefix,data)=>{
 if(!SECRET(secret))throw Error('missing email secret');
 return createHmac('sha256',secret).update(prefix+':'+data).digest('hex');
};
export const emailLookup=(email,secret)=>digest(secret,'mio-event-email-v1',normalizeEmail(email));
export const browserHash=(token,secret)=>{
 if(!HEX.test(token||''))throw Error('invalid pending browser');
 return digest(secret,'mio-event-browser-v1',token);
};
export const ipHash=(ip,secret)=>digest(secret,'mio-event-ip-v1',String(ip||'unknown').slice(0,120));
export const otpDigest=(challengeId,otp,secret)=>{
 if(!/^[a-f0-9-]{36}$/i.test(challengeId)||!/^[0-9]{6}$/.test(otp))
  throw Error('invalid OTP');
 return digest(secret,'mio-event-otp-v1',challengeId+':'+otp);
};
export const createPendingToken=()=>randomBytes(32).toString('hex');
export function pendingCookie(token){
 if(!HEX.test(token||''))throw Error('invalid pending token');
 return PENDING+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600';
}
export function readPendingCookie(raw){
 const value=String(raw||'').split(';').map(x=>x.trim())
  .find(x=>x.startsWith(PENDING+'='))?.slice(PENDING.length+1);
 return HEX.test(value||'')?value:null;
}
export async function startEmailChallenge(db,{email,token,ip,secret}){
 const normalized=normalizeEmail(email);
 const lookup=emailLookup(normalized,secret),binding=browserHash(token,secret),
  network=ipHash(ip,secret),code=String(randomInt(0,1000000)).padStart(6,'0'),
  id=randomUUID();
 await db.query('BEGIN');
 try{
  // Lock both the recipient key and network key before calculating hourly limits.
  // Different email addresses coming from one network must not race past its cap.
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,['email:'+lookup]);
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,['ip:'+network]);
  const rate=await db.query(`SELECT
   COUNT(*) FILTER(WHERE email_lookup=$1)::int AS email_count,
   COUNT(*) FILTER(WHERE ip_lookup=$2)::int AS ip_count
   FROM mio_event_email_challenges WHERE requested_at>now()-interval '1 hour'`,
   [lookup,network]);
  if(Number(rate.rows?.[0]?.email_count||0)>=3||
    Number(rate.rows?.[0]?.ip_count||0)>=12)throw Error('email challenge rate limit');
  // Only the most recent code in the same browser may remain usable.
  await db.query(`UPDATE mio_event_email_challenges
    SET state='superseded' WHERE browser_hash=$1 AND state='pending'`,[binding]);
  const r=await db.query(`INSERT INTO mio_event_email_challenges
   (challenge_id,email_lookup,ip_lookup,browser_hash,code_digest,state,expires_at)
   VALUES($1,$2,$3,$4,$5,'pending',now()+interval '10 minutes')
   RETURNING challenge_id`,
   [id,lookup,network,binding,otpDigest(id,code,secret)]);
  if(r.rowCount!==1)throw Error('challenge persistence unconfirmed');
  await db.query('COMMIT');
  // OTP exists only in the app-server memory until the existing GAS sends it.
  return {challengeId:id,code,email:normalized};
 }catch(e){await db.query('ROLLBACK');throw e}
}
export async function invalidateUnsent(db,challengeId){
 await db.query(`UPDATE mio_event_email_challenges SET state='send_failed'
  WHERE challenge_id=$1 AND state='pending'`,[challengeId]);
}
export async function finishEmailChallenge(db,{token,otp,secret,sessionSecret}){
 const binding=browserHash(token,secret);
 if(!/^[0-9]{6}$/.test(otp||'')||!SECRET(sessionSecret))
  throw Error('invalid verification input');
 await db.query('BEGIN');
 try{
  const r=await db.query(`SELECT challenge_id,email_lookup,code_digest,attempts
    FROM mio_event_email_challenges
    WHERE browser_hash=$1 AND state='pending' AND expires_at>now()
    ORDER BY requested_at DESC LIMIT 1 FOR UPDATE`,[binding]);
  if(r.rowCount!==1)throw Error('OTP session expired');
  const item=r.rows[0];
  if(!Number.isInteger(Number(item.attempts))||Number(item.attempts)>=5)
   throw Error('OTP attempt limit');
  const expected=Buffer.from(item.code_digest,'hex'),
   actual=Buffer.from(otpDigest(item.challenge_id,otp,secret),'hex');
  const correct=expected.length===actual.length&&timingSafeEqual(expected,actual);
  if(!correct){
   // Commit the increment, even though verification fails.
   await db.query(`UPDATE mio_event_email_challenges SET attempts=attempts+1,
    state=CASE WHEN attempts+1>=5 THEN 'locked' ELSE state END
    WHERE challenge_id=$1`,[item.challenge_id]);
   await db.query('COMMIT');
   return {verified:false};
  }
  await db.query(`UPDATE mio_event_email_challenges
   SET state='verified',verified_at=now() WHERE challenge_id=$1`,[item.challenge_id]);
  const saved=await db.query(`INSERT INTO mio_event_email_subjects
   (subject_id,email_lookup,last_verified_at)
   VALUES($1,$2,now())
   ON CONFLICT(email_lookup) DO UPDATE SET last_verified_at=now()
   RETURNING subject_id`,[randomUUID(),item.email_lookup]);
  if(saved.rowCount!==1)throw Error('subject persistence unconfirmed');
  const subjectId=saved.rows[0].subject_id;
  const cookie=verifiedEmailCookie(subjectId,sessionSecret);
  await db.query('COMMIT');
  return {verified:true,sessionCookie:cookie};
 }catch(e){await db.query('ROLLBACK');throw e}
}
