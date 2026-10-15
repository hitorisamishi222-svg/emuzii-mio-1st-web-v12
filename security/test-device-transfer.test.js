import test from 'node:test';
import assert from 'node:assert/strict';
import {transferTestDevice} from './test-device-transfer.js';
import {issueTestDeviceSession,verifyTestDeviceSession} from './test-device-session.js';

const secret='TEST_only_unique_signing_key_for_transfer_workflow_32+_chars';
const now=Date.parse('2026-10-10T00:00:00Z');
const participantId='TEST_MIO_0001';
const approvalId='test_approval_0123456789abcdef';
const nextApprovalId='test_approval_0123456789abcdee';

function fixture(){
 const phone=issueTestDeviceSession({participantId,deviceId:'TESTDEVICE_PHONE',secret,now,ttlMs:3600_000});
 const data={
  profile:{participantId,active:true,participantApproved:true},
  approvals:{
   [approvalId]:{id:approvalId,participantId,verifiedByOperator:true,expiresAt:now+500_000,usedAt:null},
   [nextApprovalId]:{id:nextApprovalId,participantId,verifiedByOperator:true,expiresAt:now+500_000,usedAt:null}
  },
  sessions:[{...phone,participantId,deviceId:'TESTDEVICE_PHONE',active:true,revoked:false}],
  history:[
   {id:'checkin-01',participantId,kind:'attendance',date:'2026-10-01'},
   {id:'gacha-01',participantId,kind:'gacha',prize:'TEST_SR',count:2},
   {id:'fanart-01',participantId,kind:'gallery',asset:'test-only-image'}
  ],audit:[]
 };
 // Serialized snapshot is a mock for the TEST transaction contract only.
 let tail=Promise.resolve();
 const store={transaction(fn){
  const run=tail.then(async()=>{
   const draft=structuredClone(data);
   const tx={
    async consumeVerifiedTransferApproval({transferApprovalId,participantId,now}){
     const entry=draft.approvals[transferApprovalId];
     if(!entry||entry.usedAt!==null||entry.participantId!==participantId||
       !entry.verifiedByOperator||entry.expiresAt<=now)return null;
     entry.usedAt=now;return {...entry};
    },
    async lockProfile({participantId}){
     return draft.profile.participantId===participantId?{...draft.profile}:null;
    },
    async createSession(session){
     if(draft.sessions.some(x=>x.sessionId===session.sessionId||
       (x.participantId===session.participantId&&x.deviceId===session.deviceId&&!x.revoked)))return false;
     draft.sessions.push({...session,active:true,revoked:false});return true;
    },
    async audit(entry){draft.audit.push(entry)}
   };
   if(store.failAudit)tx.audit=async()=>{throw Error('mock audit storage unavailable')};
   if(store.failCreate)tx.createSession=async()=>false;
   const result=await fn(tx);Object.assign(data,draft);return result;
  });
  tail=run.catch(()=>{});return run;
 }};
 return {data,store,phone};
}
function perform(store,overrides={}){
 return transferTestDevice({store,participantId,transferApprovalId:approvalId,secret,now,...overrides});
}
function state(session,data){
 const row=data.sessions.find(x=>x.sessionId===session.sessionId);
 return row&&{participantId:row.participantId,deviceId:row.deviceId,
  sessionId:row.sessionId,sessionDigest:row.sessionDigest,expiresAt:row.expiresAt,
  active:row.active,revoked:row.revoked,
  participantApproved:data.profile.participantApproved};
}
function verify(session,data){
 return verifyTestDeviceSession({token:session.token,secret,record:state(session,data),now:now+1000});
}

test('verified device addition preserves other sessions and all participant history',async()=>{
 const f=fixture(),historyBefore=structuredClone(f.data.history);
 const added=await perform(f.store);
 assert.equal(verify(f.phone,f.data).ok,true);
 assert.equal(verify(added,f.data).ok,true);
 assert.notEqual(added.deviceId,'TESTDEVICE_PHONE');
 assert.deepEqual(f.data.history,historyBefore);
 assert.equal(f.data.approvals[approvalId].usedAt,now);
 assert.equal(f.data.audit.length,1);
 assert.equal(f.data.audit[0].event,'test_device_added');
 assert.equal(JSON.stringify(f.data.audit).includes('sessionDigest'),false);
 assert.equal(JSON.stringify(f.data.audit).includes(added.token),false);
});

test('used one-time approval fails without changing sessions or history',async()=>{
 const f=fixture();await perform(f.store);const before=structuredClone(f.data);
 await assert.rejects(()=>perform(f.store),/TRANSFER_NOT_VERIFIED_OR_USED/);
 assert.deepEqual(f.data,before);
});

test('wrong participant, expired, nonverified or unknown approval fails closed',async()=>{
 for(const mutation of [
  f=>f.data.approvals[approvalId].verifiedByOperator=false,
  f=>f.data.approvals[approvalId].expiresAt=now,
  f=>{f.data.approvals[approvalId].participantId='TEST_MIO_OTHER'},
  f=>{delete f.data.approvals[approvalId]}
 ]){
  const f=fixture();mutation(f);const before=structuredClone(f.data);
  await assert.rejects(()=>perform(f.store),/TRANSFER_NOT_VERIFIED_OR_USED/);
  assert.deepEqual(f.data,before);
 }
});

test('suspended participant cannot add a device or consume approval',async()=>{
 for(const change of [{active:false},{participantApproved:false}]){
  const f=fixture();Object.assign(f.data.profile,change);const before=structuredClone(f.data);
  await assert.rejects(()=>perform(f.store),/PARTICIPANT_NOT_ACTIVE/);
  assert.deepEqual(f.data,before);
 }
});

test('session creation and audit failures roll back approval consumption',async()=>{
 for(const mode of ['failCreate','failAudit']){
  const f=fixture();f.store[mode]=true;const before=structuredClone(f.data);
  await assert.rejects(()=>perform(f.store));assert.deepEqual(f.data,before);
 }
});

test('parallel use of one approval can add only one device session',async()=>{
 const f=fixture();
 const results=await Promise.allSettled([perform(f.store),perform(f.store)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.equal(f.data.sessions.length,2);
 assert.equal(f.data.audit.length,1);
});

test('separate verified additions keep all devices active',async()=>{
 const f=fixture(),first=await perform(f.store);
 const second=await perform(f.store,{transferApprovalId:nextApprovalId});
 assert.equal(verify(f.phone,f.data).ok,true);
 assert.equal(verify(first,f.data).ok,true);
 assert.equal(verify(second,f.data).ok,true);
 assert.equal(f.data.sessions.length,3);
 assert.equal(f.data.audit.length,2);
 assert.equal(f.data.history.length,3);
});

test('invalid transfer input never starts a transaction',async()=>{
 const f=fixture();let calls=0;
 const spy={transaction(fn){calls++;return f.store.transaction(fn)}};
 for(const overrides of [{participantId:''},{participantId:{}},
  {transferApprovalId:'too-short'},{now:-1}])
  await assert.rejects(()=>perform(spy,overrides),/INVALID_TRANSFER_REQUEST/);
 assert.equal(calls,0);
});

test('unknown participant is rejected without creating a session',async()=>{
 const f=fixture(),before=structuredClone(f.data);
 await assert.rejects(()=>perform(f.store,{participantId:'TEST_MIO_MISSING'}),/TRANSFER_NOT_VERIFIED_OR_USED/);
 assert.deepEqual(f.data,before);
});

test('a nontransactional storage adapter is refused',async()=>{
 await assert.rejects(()=>perform({}),/TRANSACTIONAL_TEST_STORE_REQUIRED/);
});
