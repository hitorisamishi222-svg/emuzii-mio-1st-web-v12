import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryToken} from '../recovery-token.js';
import {verifiedRecoveryResult} from '../recovery-result-gate.js';

const key='a'.repeat(64),secret='test-secret-which-is-longer-than-32-characters';
const now=1760000000000;
const target={webId:'MIO-W-'+'a'.repeat(24),masterId:'MIO-0010'};
const approved={ok:true,verified:true,recoveryApproved:true,recoveryConsumed:true,
 recoveryTokenBound:true,status:'承認済み',participantId:target.webId,
 integratedParticipantId:target.masterId};

test('retries yield the same token without generating a Web-ID',()=>{
 const a=recoveryToken(key,now,secret,now);
 assert.match(a,/^[a-f0-9]{64}$/);
 assert.equal(recoveryToken(key,now,secret,now),a);
 assert.equal(recoveryToken('b'.repeat(64),now,secret,now)===a,false);
 assert.equal(recoveryToken(key,now-1000,secret,now)===a,false);
});
test('invalid, stale, future and weak-secret inputs fail closed',()=>{
 for(const [k,t,s,n] of [
  ['x',now,secret,now],[key,now-16*60000,secret,now],
  [key,now+61000,secret,now],[key,1.5,secret,now],
  [null,now,secret,now],[key,now,'short',now]
 ])assert.equal(recoveryToken(k,t,s,n),null);
});
test('GAS response must prove approval, one-time consumption and bound token',()=>{
 assert.equal(verifiedRecoveryResult(approved,target),true);
 for(const field of ['ok','verified','recoveryApproved','recoveryConsumed','recoveryTokenBound'])
  assert.equal(verifiedRecoveryResult({...approved,[field]:false},target),false);
 assert.equal(verifiedRecoveryResult({...approved,participantId:'MIO-W-'+'b'.repeat(24)},target),false);
 assert.equal(verifiedRecoveryResult({...approved,integratedParticipantId:'MIO-9999'},target),false);
 assert.equal(verifiedRecoveryResult({...approved,status:'承認待ち'},target),false);
 assert.equal(verifiedRecoveryResult(approved,{webId:'not-id',masterId:'MIO-0010'}),false);
});
