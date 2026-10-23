import test from 'node:test';
import assert from 'node:assert/strict';
import {
 MIO_RELEASE_CHECKS,CURRENT_V223_RELEASE_EVIDENCE,evaluateMioReleaseReadiness
} from '../mio-release-readiness-v223.js';

test('current evidence must fail closed and leave production untouched',()=>{
 const r=evaluateMioReleaseReadiness(CURRENT_V223_RELEASE_EVIDENCE);
 assert.equal(r.canRelease,false);
 assert.equal(r.complete,0);
 assert.equal(r.incomplete.length,MIO_RELEASE_CHECKS.length);
});
test('empty evidence cannot release',()=>{
 assert.equal(evaluateMioReleaseReadiness({}).canRelease,false);
});
test('only exact true flags accepted; truthy strings and numbers denied',()=>{
 const all=Object.fromEntries(MIO_RELEASE_CHECKS.map(k=>[k,true]));
 for(const value of ['true','verified',1,{},[],null,false,undefined]){
   const r=evaluateMioReleaseReadiness({...all,manualReleaseApproval:value});
   assert.equal(r.canRelease,false);
   assert.ok(r.incomplete.includes('manualReleaseApproval'));
 }
});
test('all independently confirmed gates can be represented as ready',()=>{
 const all=Object.fromEntries(MIO_RELEASE_CHECKS.map(k=>[k,true]));
 const r=evaluateMioReleaseReadiness(all);
 assert.equal(r.canRelease,true);
 assert.equal(r.required,MIO_RELEASE_CHECKS.length);
 assert.equal(r.incomplete.length,0);
});
test('a single missing gate always blocks release',()=>{
 const all=Object.fromEntries(MIO_RELEASE_CHECKS.map(k=>[k,true]));
 for(const key of MIO_RELEASE_CHECKS){
   const r=evaluateMioReleaseReadiness({...all,[key]:false});
   assert.equal(r.canRelease,false);
   assert.deepEqual(r.incomplete,[key]);
 }
});
test('CI passing does not substitute for real GAS deployment verification',()=>{
 const all=Object.fromEntries(MIO_RELEASE_CHECKS.map(k=>[k,true]));
 all.gasLiveDeploymentRead=false;
 all.gasDeploymentParityVerified=false;
 const r=evaluateMioReleaseReadiness(all);
 assert.equal(r.canRelease,false);
 assert.deepEqual(r.incomplete,['gasLiveDeploymentRead','gasDeploymentParityVerified']);
});
test('unresolved real ledger mismatch and incomplete orphan row block release',()=>{
 const all=Object.fromEntries(MIO_RELEASE_CHECKS.map(k=>[k,true]));
 all.orphanRowsReviewed=false;
 all.participantIdentityConflictsReviewed=false;
 const r=evaluateMioReleaseReadiness(all);
 assert.equal(r.canRelease,false);
 assert.deepEqual(r.incomplete,['orphanRowsReviewed','participantIdentityConflictsReviewed']);
});
test('real-device and actual revocation remain separate blockers',()=>{
 const all=Object.fromEntries(MIO_RELEASE_CHECKS.map(k=>[k,true]));
 all.realDevicePasskeysVerified=false;
 all.browserRevocationGASSynchronized=false;
 const r=evaluateMioReleaseReadiness(all);
 assert.equal(r.canRelease,false);
 assert.deepEqual(r.incomplete,['browserRevocationGASSynchronized','realDevicePasskeysVerified']);
});
test('readiness evaluator cannot mutate evidence inputs',()=>{
 const input={...CURRENT_V223_RELEASE_EVIDENCE};
 const before=JSON.stringify(input);
 evaluateMioReleaseReadiness(input);
 assert.equal(JSON.stringify(input),before);
});
test('release flags cannot be accidentally dropped from policy',()=>{
 for(const key of [
   'gasEditorFourFilesRead','gasLiveDeploymentRead','gasTriggersAudited',
   'participantIdentityConflictsReviewed','orphanRowsReviewed',
   'freshBootstrapProofVerified','manualReleaseApproval']){
     assert.ok(MIO_RELEASE_CHECKS.includes(key));
   }
});
