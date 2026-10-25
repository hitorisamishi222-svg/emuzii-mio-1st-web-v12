import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeAdditionalDevice} from '../additional-device-policy.js';

const masterId='MIO-0010',webId='MIO-W-'+'a'.repeat(24);
const approval={status:'approved',adminVerified:true,masterId,webId,expiresAt:2000,deviceProofHash:'b'.repeat(64)};
const device={tokenHash:'c'.repeat(64),proofHash:'b'.repeat(64),now:1000};
const existing={status:'承認済み',masterId,webId};
const check=(a=approval,d=device,e=existing)=>authorizeAdditionalDevice({approval:a,device:d,existing:e});

test('allows approved additional device without replacing existing credentials',()=>{
 const before=structuredClone(existing);
 assert.deepEqual(check(),{ok:true,masterId,webId,tokenHash:device.tokenHash,mode:'ADDITIVE_DEVICE'});
 assert.deepEqual(existing,before);
});
test('rejects missing or unverified admin approval',()=>{
 assert.equal(check({...approval,adminVerified:false}).ok,false);
 assert.equal(check({...approval,status:'pending'}).ok,false);
});
test('rejects identity mismatch and expired approval',()=>{
 assert.equal(check({...approval,masterId:'MIO-0018'}).ok,false);
 assert.equal(check({...approval,expiresAt:999}).ok,false);
 assert.equal(check(approval,device,{...existing,status:'未承認'}).ok,false);
});
test('rejects missing or mismatched device proof',()=>{
 assert.equal(check(approval,{...device,proofHash:'d'.repeat(64)}).ok,false);
 assert.equal(check(approval,{...device,tokenHash:'invalid'}).ok,false);
});
