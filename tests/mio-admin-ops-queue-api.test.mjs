import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateQueueSnapshot} from '../scripts/mio-admin-queue-contract.mjs';

// These tests validate an INDEPENDENT staging-only read contract.
// The protected api-gacha-admin-ops.js is deliberately not modified.
const blank=()=>({ok:true,pending:[],roster:[],simple:[],simplePending:[],
 totalPending:0,pendingRegistrationCount:0,pendingIdentityCount:0,
 pendingSimpleCount:0,unknownWebStatusCount:0,unknownSimpleStatusCount:0,
 invalidWebIdCount:0,incompleteSimpleRowCount:0,
 pendingListTruncated:false,simplePendingListTruncated:false,rejectedCount:0});
const guarded=()=>/管理台帳の待機人数を検証できません/;
test('staging queue contract recognizes three explicit zero counts without claiming a live connection',()=>{
 const out=validateQueueSnapshot(blank());
 assert.equal(out.totalPending,0);
 assert.equal(out.pendingRegistrationCount,0);
 assert.equal(out.pendingIdentityCount,0);
 assert.equal(out.pendingSimpleCount,0);
 assert.equal(out.hasUnclassifiedRows,false);
 assert.equal(Object.isFrozen(out),true);
 assert.equal(Object.hasOwn(out,'liveConnected'),false);
});
test('staging queue contract rejects missing metadata instead of displaying false zero',()=>{
 for(const field of ['pendingRegistrationCount','pendingIdentityCount',
  'pendingSimpleCount','unknownWebStatusCount','unknownSimpleStatusCount',
  'invalidWebIdCount','incompleteSimpleRowCount','simplePending']){
  const candidate=blank();delete candidate[field];
  assert.throws(()=>validateQueueSnapshot(candidate),guarded(),field);
 }
});
test('staging queue contract rejects negative, noninteger, inconsistent and truncated counts',()=>{
 const candidates=[
  {...blank(),totalPending:1},
  {...blank(),pendingSimpleCount:-1},
  {...blank(),pendingIdentityCount:0.5},
  {...blank(),unknownWebStatusCount:'0'},
  {...blank(),invalidWebIdCount:Number.MAX_SAFE_INTEGER+1},
  {...blank(),incompleteSimpleRowCount:NaN},
  {...blank(),pendingListTruncated:true},
  {...blank(),simplePendingListTruncated:true}
 ];
 for(const state of candidates)assert.throws(()=>validateQueueSnapshot(state),guarded());
});
test('staging queue contract retains correct totals and warns about corrupt or incomplete rows',()=>{
 const candidate=blank();
 candidate.totalPending=100;candidate.pendingRegistrationCount=99;candidate.pendingIdentityCount=1;
 candidate.pending=[{name:'PRIVATE_PERSON',token:'PRIVATE_TOKEN'}];
 candidate.pendingListTruncated=true;
 candidate.pendingSimpleCount=72;
 candidate.simplePending=[{name:'PRIVATE_PARTICIPANT',browserId:'PRIVATE_DEVICE_ID'}];
 candidate.simplePendingListTruncated=true;
 candidate.unknownWebStatusCount=2;candidate.invalidWebIdCount=3;
 candidate.incompleteSimpleRowCount=4;
 const out=validateQueueSnapshot(candidate);
 assert.equal(out.totalPending,100);
 assert.equal(out.pendingRegistrationCount,99);
 assert.equal(out.pendingIdentityCount,1);
 assert.equal(out.pendingSimpleCount,72);
 assert.equal(out.hasUnclassifiedRows,true);
 assert.equal(out.pendingListTruncated,true);
 assert.equal(out.simplePendingListTruncated,true);
 assert.equal(JSON.stringify(out).includes('PRIVATE_'),false,'contract must not echo identifiers or names');
});
test('protected admin API remains unchanged while a separate draft contract is tested',()=>{
 const api=readFileSync(new URL('../api-gacha-admin-ops.js',import.meta.url),'utf8');
 assert.match(api,/MIO_GACHA_ADMIN_OPS_RELEASE/);
 assert.doesNotMatch(api,/validateQueueSnapshot|pendingRegistrationCount|invalidWebIdCount/);
});
