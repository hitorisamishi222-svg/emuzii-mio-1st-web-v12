import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyManifest} from './verify-manifest.js';
const original=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(original);
test('new release remains blocked until checks and user approval',()=>{
 assert.deepEqual(verifyManifest(clone()),{valid:true,readyToIntegrate:false});
});
test('reject unreviewed permission for production writes',()=>{
 const m=clone();m.productionWritesAllowed=true;assert.throws(()=>verifyManifest(m),/Unsafe production/);
});
test('reject missing identity integration and branch omissions',()=>{
 const m=clone();m.streams=m.streams.filter(s=>s.key!=='device-identity');
 assert.throws(()=>verifyManifest(m),/Incomplete/);
});
test('complete gated plan would be ready only after every check',()=>{
 const m=clone();m.streams.forEach(s=>s.ready=true);
 Object.keys(m.gates).forEach(k=>m.gates[k]=true);
 assert.equal(verifyManifest(m).readyToIntegrate,true);
 m.gates.ownerApprovedRelease=false;
 assert.equal(verifyManifest(m).readyToIntegrate,false);
});
