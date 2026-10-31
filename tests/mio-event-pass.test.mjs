import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enabled,eventIdOK,verifiedEmailCookie,readVerifiedEmailCookie,
 inviteDigest,issueEventPass,checkEventPass} from '../mio-event-pass-core.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const subject='11111111-1111-4111-8111-111111111111';
const key='S'.repeat(64),inviteKey='I'.repeat(64),eventId='mio-open-2026';
const now=new Date('2026-11-01T10:00:00.000Z');
function fixture(policy='open'){
 const state={policy,pass:null,inviteUsed:false,eligible:false,closed:false};
 const log=[];
 const db={state,log,async query(sql,args=[]){
  log.push({sql,args});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rowCount:0,rows:[]};
  if(sql.includes('pg_advisory_xact_lock'))return {rowCount:1,rows:[{}]};
  if(sql.includes('SELECT event_id,policy,state'))return {rowCount:1,rows:[{
   event_id:eventId,policy:state.policy,state:state.closed?'closed':'published',
   opens_at:'2026-10-31T00:00:00.000Z',closes_at:'2026-11-04T00:00:00.000Z'
  }]};
  if(sql.includes('SELECT pass_id FROM mio_event_passes')){
   return state.pass?{rowCount:1,rows:[{pass_id:state.pass}]}:{rowCount:0,rows:[]};
  }
  if(sql.includes('UPDATE mio_event_invites')){
   if(state.inviteUsed||args[1]!==inviteDigest(eventId,'InviteToken_2026_X',inviteKey))
    return {rowCount:0,rows:[]};
   state.inviteUsed=true;return {rowCount:1,rows:[{invite_hash:args[1]}]};
  }
  if(sql.includes('SELECT subject_id FROM mio_event_verified_members'))
   return state.eligible?{rowCount:1,rows:[{subject_id:subject}]}:{rowCount:0,rows:[]};
  if(sql.includes('INSERT INTO mio_event_passes')){
   state.pass=args[0];return {rowCount:1,rows:[{pass_id:args[0]}]};
  }
  if(sql.includes('JOIN mio_events e ON'))
   return state.pass&&!state.closed?{rowCount:1,rows:[{pass_id:state.pass}]}:{rowCount:0,rows:[]};
  throw Error('unrecognized SQL: '+sql.slice(0,100));
 }};
 return db;
}
test('release is off unless the exact independent event flag is set',()=>{
 assert.equal(enabled({}),false);
 assert.equal(enabled({MIO_EVENT_PASS_RELEASE:'enabled'}),false);
 assert.equal(enabled({MIO_EVENT_PASS_RELEASE:'verified-event-pass-phase2e-20261101'}),true);
});
test('verified email subject cookie is signed, bound to one subject and expires',()=>{
 const cookie=verifiedEmailCookie(subject,key,now.getTime());
 assert.match(cookie,/^__Host-mio_event_email=/);
 for(const part of ['HttpOnly','Secure','SameSite=Lax','Path=/'])assert.ok(cookie.includes(part));
 assert.deepEqual(readVerifiedEmailCookie(cookie,key,now.getTime()),{
  subjectId:subject,verifiedAt:now.getTime()});
 assert.equal(readVerifiedEmailCookie(cookie,'wrong'.repeat(16),now.getTime()),null);
 assert.equal(readVerifiedEmailCookie(cookie,key,now.getTime()+7*86400000),null);
 assert.equal(readVerifiedEmailCookie(cookie,key,now.getTime()-1),null);
 const mutated=cookie.replace(/(email=)(.)/,(_m,a,_b)=>a+'X');
 assert.equal(readVerifiedEmailCookie(mutated,key,now.getTime()),null);
 assert.equal(readVerifiedEmailCookie('name=fake',key),null);
 assert.throws(()=>verifiedEmailCookie('MIO-0010',key));
});
test('open event issues one pass immediately for a previously verified subject',async()=>{
 const db=fixture();
 const result=await issueEventPass(db,{eventId,subjectId:subject},now);
 assert.equal(result.status,'issued');
 assert.match(result.passId,/^[a-f0-9-]{36}$/);
 const second=await issueEventPass(db,{eventId,subjectId:subject},now);
 assert.deepEqual(second,{status:'already_issued',passId:result.passId});
 assert.equal(db.log.filter(x=>x.sql.includes('INSERT INTO mio_event_passes')).length,1);
 assert.equal(db.log.filter(x=>x.sql.includes('pg_advisory_xact_lock')).length,2);
 assert.deepEqual(await checkEventPass(db,{eventId,subjectId:subject}),{allowed:true});
});
test('closed event cannot issue new passes and access check honors closure',async()=>{
 const db=fixture();db.state.closed=true;
 await assert.rejects(issueEventPass(db,{eventId,subjectId:subject},now),/not open/);
 assert.equal(db.log.at(-1).sql,'ROLLBACK');
 db.state.pass='33333333-3333-4333-8333-333333333333';
 assert.deepEqual(await checkEventPass(db,{eventId,subjectId:subject}),{allowed:false});
});
test('invitation is required, one-use and never substitutes for email verification',async()=>{
 const db=fixture('invite');
 await assert.rejects(issueEventPass(db,{eventId,subjectId:subject},now),/invite required/);
 assert.equal(db.state.pass,null);
 const hash=inviteDigest(eventId,'InviteToken_2026_X',inviteKey);
 assert.notEqual(hash,inviteDigest('other-event','InviteToken_2026_X',inviteKey));
 const first=await issueEventPass(db,{eventId,subjectId:subject,inviteHash:hash},now);
 assert.equal(first.status,'issued');
 assert.equal(db.state.inviteUsed,true);
 assert.equal((await issueEventPass(db,{eventId,subjectId:subject,inviteHash:hash},now)).status,'already_issued');
 assert.equal(db.log.filter(x=>x.sql.includes('UPDATE mio_event_invites')).length,1);
 const another=fixture('invite');another.state.inviteUsed=true;
 await assert.rejects(issueEventPass(another,{eventId,subjectId:subject,inviteHash:hash},now),/invite invalid/);
});
test('member-only event refuses enrollment until preverified server-side eligibility exists',async()=>{
 const db=fixture('member');
 await assert.rejects(issueEventPass(db,{eventId,subjectId:subject},now),/eligibility not verified/);
 assert.equal(db.state.pass,null);
 db.state.eligible=true;
 const r=await issueEventPass(db,{eventId,subjectId:subject},now);
 assert.equal(r.status,'issued');
 assert.equal(db.log.filter(x=>x.sql.includes('SELECT subject_id FROM mio_event_verified_members')).length,2);
});
test('missing subject, invalid event or unknown policy never issues passes',async()=>{
 const db=fixture('made-up');
 await assert.rejects(issueEventPass(db,{eventId,subjectId:subject},now),/unsupported event policy/);
 assert.equal(db.state.pass,null);
 await assert.rejects(issueEventPass(db,{eventId,subjectId:'MIO-0001'},now),/invalid event request/);
 assert.equal(eventIdOK('../gacha'),false);
 assert.equal(eventIdOK('mio-open-2026'),true);
});
test('API refuses unverified email and does not register identities or grant prize rights',()=>{
 const api=read('api-mio-event-pass.js'),core=read('mio-event-pass-core.js');
 const schema=read('db/mio-event-pass-20261101.sql');
 assert.match(api,/readVerifiedEmailCookie\(req.headers.cookie/);
 assert.match(api,/VERIFIED_EMAIL_SESSION_REQUIRED/);
 assert.match(api,/MIO_REGISTRATION_DATABASE_URL/);
 assert.match(api,/EVENT_PASSES_DISABLED/);
 assert.match(api,/SAME|INVALID_ORIGIN/);
 assert.doesNotMatch(api+core,/makeIdentity\(|sessionCookie\(|bridge\(['"]draw|bridge\(['"]register|webAdminOpsGrant|gachaGrant\(/);
 assert.doesNotMatch(schema,/ALTER TABLE mio_registration_v2|DROP TABLE|UPDATE emuzii_/);
 assert.match(schema,/UNIQUE\(event_id,subject_id\)/);
 assert.match(schema,/mio_event_verified_members/);
});
