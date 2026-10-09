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
 const issued=issueTestDeviceSession({participantId,deviceId:'TESTDEVICE_OLD',
  generation:1,secret,now,ttlMs:3600_000});
 const data={
  profile:{participantId,generation:1,active:true,participantApproved:true,
   activeDeviceId:'TESTDEVICE_OLD',sessionDigest:issued.sessionDigest},
  approvals:{
   [approvalId]:{id:approvalId,participantId,verifiedByOperator:true,expiresAt:now+500_000,usedAt:null},
   [nextApprovalId]:{id:nextApprovalId,participantId,verifiedByOperator:true,expiresAt:now+500_000,usedAt:null}
  },
  history:[
   {id:'checkin-01',participantId,kind:'attendance',date:'2026-10-01'},
   {id:'gacha-01',participantId,kind:'gacha',prize:'TEST_SR',count:2},
   {id:'fanart-01',participantId,kind:'gallery',asset:'test-only-image'}
  ],audit:[]
 };
 // Serial transaction queue + isolated snapshot simulates a durable DB contract.
 // THIS MOCK IS NEVER A PRODUCTION STORE.
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
    async rotateSession({participantId,expectedGeneration,nextGeneration,nextDeviceId,nextSessionDigest}){
     if(draft.profile.participantId!==participantId||
        draft.profile.generation!==expectedGeneration)return false;
     draft.profile={...draft.profile,generation:nextGeneration,
      activeDeviceId:nextDeviceId,sessionDigest:nextSessionDigest};
     return true;
    },
    async audit(entry){draft.audit.push(entry)}
   };
   if(store.failAudit)tx.audit=async()=>{throw Error('mock audit storage unavailable')};
   if(store.failRotate)tx.rotateSession=async()=>false;
   const result=await fn(tx);
   Object.assign(data,draft);
   return result;
  });
  tail=run.catch(()=>{});
  return run;
 }};
 return {data,store,oldSession:issued};
}
function perform(store,overrides={}){
 return transferTestDevice({store,participantId,transferApprovalId:approvalId,secret,now,...overrides});
}
function activeState(data){
 return {participantId:data.profile.participantId,activeDeviceId:data.profile.activeDeviceId,
  generation:data.profile.generation,sessionDigest:data.profile.sessionDigest,
  active:data.profile.active,participantApproved:data.profile.participantApproved};
}
function verify(token,data){
 return verifyTestDeviceSession({token,secret,record:activeState(data),now:now+1000});
}

test('verified transfer invalidates old token and preserves ALL participant history',async()=>{
 const {data,store,oldSession}=fixture();
 const historyBefore=structuredClone(data.history);
 const result=await perform(store);
 assert.equal(result.generation,2);
 assert.equal(verify(oldSession.token,data).reason,'REVOKED_DEVICE');
 assert.equal(verify(result.token,data).ok,true);
 assert.deepEqual(data.history,historyBefore);
 assert.equal(data.approvals[approvalId].usedAt,now);
 assert.equal(data.audit.length,1);
 assert.equal(data.audit[0].event,'test_device_transferred');
 assert.equal(JSON.stringify(data.audit).includes('sessionDigest'),false);
 assert.equal(JSON.stringify(data.audit).includes(result.token),false);
});

test('used one-time approval fails and makes no additional changes',async()=>{
 const {data,store}=fixture();
 await perform(store);
 const before=structuredClone(data);
 await assert.rejects(()=>perform(store),/TRANSFER_NOT_VERIFIED_OR_USED/);
 assert.deepEqual(data,before);
});

test('wrong participant, expired, nonverified or unknown approval fail closed',async()=>{
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

test('suspended participant cannot be transferred or consume approval',async()=>{
 for(const change of [{active:false},{participantApproved:false},{generation:0}]){
  const f=fixture();Object.assign(f.data.profile,change);
  const before=structuredClone(f.data);
  await assert.rejects(()=>perform(f.store),/PARTICIPANT_NOT_ACTIVE/);
  assert.deepEqual(f.data,before);
 }
});

test('session update and audit failures roll back used approval as well',async()=>{
 for(const mode of ['failRotate','failAudit']){
  const f=fixture();f.store[mode]=true;const before=structuredClone(f.data);
  await assert.rejects(()=>perform(f.store));
  assert.deepEqual(f.data,before);
 }
});

test('parallel requests for same approval cannot create two valid devices',async()=>{
 const f=fixture();
 const results=await Promise.allSettled([perform(f.store),perform(f.store)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.equal(f.data.profile.generation,2);
 assert.equal(f.data.audit.length,1);
});

test('two distinct approved transfers rotate generation twice; first new device expires',async()=>{
 const f=fixture();
 const first=await perform(f.store);
 const second=await perform(f.store,{transferApprovalId:nextApprovalId});
 assert.equal(second.generation,3);
 assert.equal(verify(first.token,f.data).reason,'REVOKED_DEVICE');
 assert.equal(verify(second.token,f.data).ok,true);
 assert.equal(f.data.audit.length,2);
 assert.equal(f.data.history.length,3);
});

test('invalid transfer input never starts a transaction',async()=>{
 const f=fixture();let calls=0;
 const spy={transaction(fn){calls++;return f.store.transaction(fn)}};
 for(const overrides of [{participantId:''},{participantId:{}},
  {transferApprovalId:'too-short'},{now:-1}]){
  await assert.rejects(()=>perform(spy,overrides),/INVALID_TRANSFER_REQUEST/);
 }
 assert.equal(calls,0);
});

test('unknown participant is rejected without account creation',async()=>{
 const f=fixture();const before=structuredClone(f.data);
 await assert.rejects(()=>perform(f.store,{participantId:'TEST_MIO_MISSING'}),/TRANSFER_NOT_VERIFIED_OR_USED/);
 assert.deepEqual(f.data,before);
});

test('a nontransactional storage adapter is refused',async()=>{
 await assert.rejects(()=>perform({}),/TRANSACTIONAL_TEST_STORE_REQUIRED/);
});
