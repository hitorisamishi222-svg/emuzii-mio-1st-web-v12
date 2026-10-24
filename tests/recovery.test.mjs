import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryIdentity} from '../recovery-identity.js';
import {verifiedRecoveryResult} from '../recovery-result-gate.js';

const key='a'.repeat(64);
const secret='a-long-independent-test-only-secret-32';
const now=Date.now();

test('same retry key and timestamp yield same identity',()=>{
 const a=recoveryIdentity(key,now,secret),b=recoveryIdentity(key,now,secret);
 assert.deepEqual(a,b);
 assert.match(a.id,/^MIO-W-[a-f0-9]{24}$/);
 assert.match(a.token,/^[a-f0-9]{64}$/);
 assert.notEqual(a.token,key);
});
test('changed retry key or timestamp changes identity',()=>{
 const a=recoveryIdentity(key,now,secret);
 assert.notDeepEqual(a,recoveryIdentity('b'.repeat(64),now,secret));
 assert.notDeepEqual(a,recoveryIdentity(key,now-1000,secret));
});
test('reject invalid, expired and future retry keys',()=>{
 for(const [k,t] of [['x',now],[key,now-16*60000],[key,now+61000],[key,1.5],[null,now]]){
  assert.equal(recoveryIdentity(k,t,secret),null);
 }
});
test('require explicit approval, consumed grant and exact approved IDs',()=>{
 const expected={webId:'MIO-W-'+'a'.repeat(24),masterId:'MIO-0010'};
 const approved={ok:true,verified:true,recoveryApproved:true,recoveryConsumed:true,status:'承認済み',participantId:expected.webId,integratedParticipantId:expected.masterId};
 assert.equal(verifiedRecoveryResult(approved,expected),true);
 for(const field of ['ok','verified','recoveryApproved','recoveryConsumed']){
  assert.equal(verifiedRecoveryResult({...approved,[field]:false},expected),false);
 }
 assert.equal(verifiedRecoveryResult({...approved,participantId:'MIO-W-'+'b'.repeat(24)},expected),false);
 assert.equal(verifiedRecoveryResult({...approved,integratedParticipantId:'MIO-9999'},expected),false);
 assert.equal(verifiedRecoveryResult({...approved,status:'承認待ち'},expected),false);
 assert.equal(verifiedRecoveryResult(approved,{webId:'not-id',masterId:'MIO-0010'}),false);
});
