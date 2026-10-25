import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedRecoveryResult} from '../recovery-result-gate.js';

const hash='a'.repeat(64);
const web='MIO-W-'+'b'.repeat(24);
const master='MIO-0010';
const valid={
  ok:true,verified:true,recoveryApproved:true,recoveryConsumed:true,
  recoveryTokenBound:true,status:'承認済み',
  participantId:web,approvedWebId:web,
  integratedParticipantId:master,approvedMasterId:master,boundTokenHash:hash
};
const expected={webId:web,masterId:master};

test('accepts only a complete verified recovery result',()=>{
  assert.equal(verifiedRecoveryResult(valid,expected,hash),true);
});
test('rejects mismatched token, web ID and master ID',()=>{
  assert.equal(verifiedRecoveryResult(valid,expected,'c'.repeat(64)),false);
  assert.equal(verifiedRecoveryResult(valid,{...expected,webId:'MIO-W-'+'c'.repeat(24)},hash),false);
  assert.equal(verifiedRecoveryResult(valid,{...expected,masterId:'MIO-0018'},hash),false);
});
test('rejects unapproved, unconsumed and unbound recovery',()=>{
  for(const field of ['verified','recoveryApproved','recoveryConsumed','recoveryTokenBound']){
    assert.equal(verifiedRecoveryResult({...valid,[field]:false},expected,hash),false,field);
  }
});
test('rejects malformed and incomplete results',()=>{
  assert.equal(verifiedRecoveryResult(null,expected,hash),false);
  assert.equal(verifiedRecoveryResult({...valid,status:'申請中'},expected,hash),false);
  assert.equal(verifiedRecoveryResult({...valid,boundTokenHash:'invalid'},expected,hash),false);
});
