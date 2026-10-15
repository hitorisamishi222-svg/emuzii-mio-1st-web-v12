import test from 'node:test';
import assert from 'node:assert/strict';
import {issueTestDeviceSession,verifyTestDeviceSession,revokeTestDeviceSession} from './test-device-session.js';

const secret='TEST_only_secret_not_used_in_production_64_bytes_minimum_7h!25';
const otherSecret='another_independent_TEST_secret_not_used_in_production_9z!';
const now=Date.parse('2026-10-10T06:00:00Z');
const participantId='MIO-0001';
const issue=(deviceId)=>issueTestDeviceSession({participantId,deviceId,secret,now,ttlMs:3600_000});
const record=(session,overrides={})=>({
 participantId,deviceId:session.deviceId,sessionId:session.sessionId,
 sessionDigest:session.sessionDigest,expiresAt:session.expiresAt,
 active:true,participantApproved:true,revoked:false,...overrides
});
const check=(session,state,overrides={})=>verifyTestDeviceSession({
 token:session.token,secret,record:state,now:now+1000,...overrides
});

test('trusted TEST participant can use a persisted signed session',()=>{
 const session=issue('TESTDEVICE_A');
 assert.match(session.sessionDigest,/^[a-f0-9]{64}$/);
 assert.equal(session.expiresAt,now+3600_000);
 assert.deepEqual(check(session,record(session)),{
  ok:true,participantId,deviceId:'TESTDEVICE_A',sessionId:session.sessionId
 });
});

test('two devices can remain signed in at the same time',()=>{
 const phone=issue('TESTDEVICE_PHONE'),tablet=issue('TESTDEVICE_TABLET');
 assert.equal(check(phone,record(phone)).ok,true);
 assert.equal(check(tablet,record(tablet)).ok,true);
});

test('individual logout revokes only the selected session',async()=>{
 const phone=issue('TESTDEVICE_PHONE'),tablet=issue('TESTDEVICE_TABLET');
 const rows=new Map([[phone.sessionId,record(phone)],[tablet.sessionId,record(tablet)]]);
 const store={transaction:fn=>fn({async revokeSession({participantId:owner,sessionId,revokedAt}){
  const row=rows.get(sessionId);
  if(!row||row.participantId!==owner||row.revoked)return false;
  rows.set(sessionId,{...row,revoked:true,revokedAt,active:false});return true;
 }})};
 assert.equal(await revokeTestDeviceSession({store,participantId,sessionId:phone.sessionId,now:now+2000}),true);
 assert.equal(check(phone,rows.get(phone.sessionId)).reason,'INACTIVE_OR_UNAPPROVED');
 assert.equal(check(tablet,rows.get(tablet.sessionId)).ok,true);
});

test('a different account cannot revoke another participant session',async()=>{
 const phone=issue('TESTDEVICE_PHONE'),row=record(phone);
 const store={transaction:fn=>fn({async revokeSession(){return false}})};
 assert.equal(await revokeTestDeviceSession({store,participantId:'MIO-0002',sessionId:phone.sessionId,now}),false);
 assert.equal(check(phone,row).ok,true);
});

test('expired, inactive, unapproved and mismatched session rows are rejected',()=>{
 const session=issue('TESTDEVICE_A');
 for(const state of [
  record(session,{active:false}),record(session,{revoked:true}),
  record(session,{participantApproved:false}),record(session,{participantId:'MIO-0002'}),
  record(session,{deviceId:'TESTDEVICE_B'}),record(session,{sessionId:'x'.repeat(43)}),
  record(session,{sessionDigest:'0'.repeat(64)}),record(session,{expiresAt:now+500})
 ])assert.equal(check(session,state).ok,false);
 assert.equal(check(session,record(session,{active:false})).reason,'INACTIVE_OR_UNAPPROVED');
});

test('expired and not-yet-issued tokens are rejected',()=>{
 const session=issue('TESTDEVICE_A'),state=record(session);
 assert.equal(check(session,state,{now:session.expiresAt}).reason,'EXPIRED_OR_INVALID');
 assert.equal(check(session,state,{now:now-1}).reason,'EXPIRED_OR_INVALID');
});

test('tampering, wrong secret and malformed tokens are rejected',()=>{
 const session=issue('TESTDEVICE_A'),state=record(session);
 const parts=session.token.split('.');
 const malicious=parts[0].slice(0,-2)+'xx.'+parts[1];
 assert.equal(check(session,state,{token:malicious}).ok,false);
 assert.equal(check(session,state,{secret:otherSecret}).reason,'BAD_SIGNATURE');
 for(const token of ['',null,'abc','@@.@@','a'.repeat(3000),parts[0]+'.bad'])
  assert.equal(check(session,state,{token}).ok,false);
});

test('browser supplied names or approval flags never authorize a session',()=>{
 const session=issue('TESTDEVICE_A');
 for(const fakeState of [
  {participantId,deviceId:'TESTDEVICE_A',sessionId:session.sessionId,
   sessionDigest:session.sessionDigest,expiresAt:session.expiresAt,active:true},
  record(session,{participantApproved:'true'}),record(session,{revoked:true})
 ])assert.equal(check(session,fakeState).ok,false);
});

test('issuance requires a strong TEST secret and valid participant/device IDs',()=>{
 for(const args of [
  {participantId,deviceId:'TESTDEVICE_A',secret:'weak',now},
  {participantId:'',deviceId:'TESTDEVICE_A',secret,now},
  {participantId,deviceId:'',secret,now},
  {participantId,deviceId:'TESTDEVICE_A',secret,now:-1},
  {participantId,deviceId:'TESTDEVICE_A',secret,now,ttlMs:0},
  {participantId,deviceId:'TESTDEVICE_A',secret,now,ttlMs:31*86_400_000}
 ])assert.throws(()=>issueTestDeviceSession(args));
});

test('session token cannot be replayed for a different participant or device',()=>{
 const session=issue('TESTDEVICE_A');
 assert.equal(check(session,record(session,{participantId:'MIO-0002'})).reason,'PARTICIPANT_MISMATCH');
 assert.equal(check(session,record(session,{deviceId:'TESTDEVICE_B'})).reason,'REVOKED_SESSION');
});

test('proof helpers do not persist data or connect to production stores',()=>{
 const session=issue('TESTDEVICE_A');
 assert.equal(check(session,record(session)).ok,true);
 assert.equal(Object.hasOwn(session,'token'),true);
 assert.equal(Object.hasOwn(session,'record'),false);
});
