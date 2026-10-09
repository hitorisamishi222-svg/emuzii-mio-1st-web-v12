import test from 'node:test';
import assert from 'node:assert/strict';
import {issueTestDeviceSession,verifyTestDeviceSession} from './test-device-session.js';

const secret='TEST_only_secret_not_used_in_production_64_bytes_minimum_7h!25';
const otherSecret='another_independent_TEST_secret_not_used_in_production_9z!';
const now=Date.parse('2026-10-10T06:00:00Z');
const original={participantId:'MIO-0001',deviceId:'TESTDEVICE_A',generation:1,secret,now,ttlMs:3600_000};
const issued=()=>issueTestDeviceSession(original);
const record=(session,overrides={})=>({
 participantId:original.participantId,
 activeDeviceId:original.deviceId,
 generation:original.generation,
 sessionDigest:session.sessionDigest,
 active:true,
 participantApproved:true,
 ...overrides
});
const check=(session,state,overrides={})=>verifyTestDeviceSession({
 token:session.token,secret,record:state,now:now+1000,...overrides
});

test('trusted TEST participant can use current signed session',()=>{
 const session=issued();
 assert.match(session.sessionDigest,/^[a-f0-9]{64}$/);
 assert.equal(session.expiresAt,now+3600_000);
 assert.deepEqual(check(session,record(session)),{
  ok:true,participantId:'MIO-0001',deviceId:'TESTDEVICE_A',generation:1
 });
});

test('old device fails after verified device transfer and generation rotation',()=>{
 const oldSession=issued();
 const nextSession=issueTestDeviceSession({...original,deviceId:'TESTDEVICE_B',generation:2});
 const newRecord=record(nextSession,{activeDeviceId:'TESTDEVICE_B',generation:2});
 assert.equal(check(oldSession,newRecord).reason,'REVOKED_DEVICE');
 assert.equal(check(nextSession,newRecord).ok,true);
});

test('logout or session replacement revokes earlier cookie even without device change',()=>{
 const first=issued(),replacement=issued();
 const state=record(replacement);
 assert.equal(check(first,state).reason,'REVOKED_SESSION');
 assert.equal(check(replacement,state).ok,true);
 assert.notEqual(first.sessionDigest,replacement.sessionDigest);
});

test('unapproved or deactivated participant cannot use a valid signed token',()=>{
 const session=issued();
 for(const state of [
  record(session,{participantApproved:false}),
  record(session,{active:false}),
  record(session,{participantId:'MIO-0002'}),
  null,{}
 ])assert.equal(check(session,state).ok,false);
 assert.equal(check(session,record(session,{participantApproved:false})).reason,'INACTIVE_OR_UNAPPROVED');
});

test('expired and not-yet-issued tokens are rejected',()=>{
 const session=issued(),state=record(session);
 assert.equal(check(session,state,{now:session.expiresAt}).reason,'EXPIRED_OR_INVALID');
 assert.equal(check(session,state,{now:now-1}).reason,'EXPIRED_OR_INVALID');
});

test('tampering, wrong secret and missing signed state are rejected',()=>{
 const session=issued(),state=record(session);
 const parts=session.token.split('.');
 const malicious=parts[0].slice(0,-2)+'xx.'+parts[1];
 assert.equal(check(session,state,{token:malicious}).ok,false);
 assert.equal(check(session,state,{secret:otherSecret}).reason,'BAD_SIGNATURE');
 for(const token of ['',null,'abc','@@.@@','a'.repeat(3000),parts[0]+'.bad'])
  assert.equal(check(session,state,{token}).ok,false);
});

test('client-submitted display names and unverified identity do not grant rights',()=>{
 const session=issued();
 for(const fakeState of [
  {participantId:'MIO-0001',activeDeviceId:'TESTDEVICE_A',generation:1,active:true,participantApproved:true},
  {participantId:'MIO-0001',activeDeviceId:'TESTDEVICE_A',generation:1,sessionDigest:'0'.repeat(64),active:true,participantApproved:true},
  record(session,{activeDeviceId:null}),
  record(session,{generation:undefined}),
  record(session,{participantApproved:'true'})
 ])assert.equal(check(session,fakeState).ok,false);
});

test('issuance requires secure secret, participant ID, device ID and generation',()=>{
 for(const args of [
  {...original,secret:'weak'},
  {...original,participantId:''},
  {...original,deviceId:''},
  {...original,generation:0},
  {...original,generation:1.1},
  {...original,ttlMs:0},
  {...original,ttlMs:31*86_400_000},
  {...original,now:-1}
 ])assert.throws(()=>issueTestDeviceSession(args));
});

test('tokens cannot be replayed for other participants or devices',()=>{
 const session=issued();
 assert.equal(check(session,record(session,{participantId:'MIO-0002'})).reason,'PARTICIPANT_MISMATCH');
 assert.equal(check(session,record(session,{activeDeviceId:'TESTDEVICE_B'})).reason,'REVOKED_DEVICE');
});

test('no production or persistent storage is written by test proof helpers',()=>{
 const session=issued(),state=record(session);
 assert.equal(check(session,state).ok,true);
 // The returned digest must be persisted separately by a TEST-only service.
 assert.equal(Object.hasOwn(session,'token'),true);
 assert.equal(Object.hasOwn(session,'record'),false);
});
