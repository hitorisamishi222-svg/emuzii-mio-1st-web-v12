// Phase 2E: scoped EVENT entry passes; never authenticates a legacy MIO browser.
// Only a server-issued, HMAC-signed, already-verified email subject can request an entry pass.
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';

export const RELEASE='verified-event-pass-phase2e-20261101';
export const enabled=(env=process.env)=>env.MIO_EVENT_PASS_RELEASE===RELEASE;
export const COOKIE='__Host-mio_event_email';
const ID=/^[a-z0-9][a-z0-9_-]{2,39}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EXPIRY=7*86400000;
const goodSecret=x=>typeof x==='string'&&x.length>=48;
export function eventIdOK(id){return typeof id==='string'&&ID.test(id)}
export function verifiedEmailCookie(subjectId,key,now=Date.now()){
 if(!UUID.test(subjectId||'')||!goodSecret(key))throw Error('unverified subject or key');
 const payload=Buffer.from(JSON.stringify({v:1,sub:subjectId,verifiedAt:now,expiresAt:now+EXPIRY})).toString('base64url');
 const mac=createHmac('sha256',key).update('mio-event-email-v1:'+payload).digest('base64url');
 return COOKIE+'='+payload+'.'+mac+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
}
export function readVerifiedEmailCookie(header,key,now=Date.now()){
 if(!goodSecret(key))return null;
 const raw=String(header||'').split(';').map(x=>x.trim())
   .find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!raw)return null;
 try{
  const [payload,signature,...rest]=raw.split('.');
  if(rest.length||!payload||!signature||payload.length>250)return null;
  const expected=createHmac('sha256',key).update('mio-event-email-v1:'+payload).digest();
  const actual=Buffer.from(signature,'base64url');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;
  const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(data.v!==1||!UUID.test(data.sub||'')||
     !Number.isSafeInteger(data.verifiedAt)||!Number.isSafeInteger(data.expiresAt)||
     data.verifiedAt>now||data.expiresAt<=now||data.expiresAt-data.verifiedAt!==EXPIRY)return null;
  return {subjectId:data.sub,verifiedAt:data.verifiedAt};
 }catch{return null}
}
export function inviteDigest(eventId,code,secret){
 if(!eventIdOK(eventId)||typeof code!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(code)||
    !goodSecret(secret))throw Error('invite proof invalid');
 return createHmac('sha256',secret).update('mio-event-invite-v1:'+eventId+':'+code).digest('hex');
}
export async function issueEventPass(client,{eventId,subjectId,inviteHash=null},now=new Date()){
 if(!eventIdOK(eventId)||!UUID.test(subjectId||'')||
  (inviteHash!==null&&!/^[a-f0-9]{64}$/.test(inviteHash)))throw Error('invalid event request');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('invalid clock');
 await client.query('BEGIN');
 try{
  // Serializes concurrent requests for this event and email subject; no duplicate pass
  // and no wasting two one-time invites in a race.
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2::text, 0))`,
    [eventId,subjectId]);
  const ev=await client.query(`SELECT event_id,policy,state,opens_at,closes_at
    FROM mio_events WHERE event_id=$1 FOR SHARE`,[eventId]);
  const e=ev.rows?.[0];
  if(ev.rowCount!==1||!e||e.state!=='published'||
     new Date(e.opens_at).getTime()>now.getTime()||
     new Date(e.closes_at).getTime()<=now.getTime())throw Error('event not open');
  const prior=await client.query(`SELECT pass_id FROM mio_event_passes
    WHERE event_id=$1 AND subject_id=$2 AND state='active'`,[eventId,subjectId]);
  if(prior.rowCount===1){
   await client.query('COMMIT');
   return {status:'already_issued',passId:prior.rows[0].pass_id};
  }
  if(e.policy==='invite'){
   if(!inviteHash)throw Error('invite required');
   const invite=await client.query(`UPDATE mio_event_invites SET used_by=$3,used_at=now()
     WHERE event_id=$1 AND invite_hash=$2 AND used_at IS NULL
     AND (reserved_for IS NULL OR reserved_for=$3)
     RETURNING invite_hash`,[eventId,inviteHash,subjectId]);
   if(invite.rowCount!==1)throw Error('invite invalid or already used');
  }else if(e.policy==='member'){
   const rights=await client.query(`SELECT subject_id FROM mio_event_verified_members
     WHERE event_id=$1 AND subject_id=$2 AND verified=true`,[eventId,subjectId]);
   if(rights.rowCount!==1)throw Error('event member eligibility not verified');
  }else if(e.policy!=='open'){
   throw Error('unsupported event policy');
  }
  const passId=randomUUID();
  const r=await client.query(`INSERT INTO mio_event_passes
    (pass_id,event_id,subject_id,state,issued_at)
    VALUES($1,$2,$3,'active',now()) RETURNING pass_id`,[passId,eventId,subjectId]);
  if(r.rowCount!==1)throw Error('pass persistence unconfirmed');
  await client.query('COMMIT');
  return {status:'issued',passId:r.rows[0].pass_id};
 }catch(e){await client.query('ROLLBACK');throw e}
}
export async function checkEventPass(db,{eventId,subjectId},now=new Date()){
 if(!eventIdOK(eventId)||!UUID.test(subjectId||''))return {allowed:false};
 const r=await db.query(`SELECT p.pass_id FROM mio_event_passes p
 JOIN mio_events e ON e.event_id=p.event_id
 WHERE p.event_id=$1 AND p.subject_id=$2 AND p.state='active'
 AND e.state='published' AND e.opens_at<=now() AND e.closes_at>now()
 LIMIT 1`,[eventId,subjectId]);
 return {allowed:r.rowCount===1};
}
