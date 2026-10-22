import test from 'node:test';
import assert from 'node:assert/strict';
import {createBootstrapVerifier} from '../participant-bootstrap-guard-v210.js';
const mioId='MIO-0042',browserId='MIO-W-'+'a'.repeat(24),tokenHash='b'.repeat(64);
function fixture(overrides={}){
 const session={mioId,browserId,tokenHash,active:true,...overrides.session};
 const row={mio_id:mioId,browser_id:browserId,token_hash:tokenHash,status:'active',...overrides.row};
 const proof={mioId,browserId,tokenHash,userVerified:true,consumed:true,method:'approved-device-pairing',...overrides.proof};
 const state={queries:0,stepUps:0,released:0};
 const db={async connect(){return {async query(sql,args){state.queries++;assert.match(sql,/mio_browser_links_v204/);assert.deepEqual(args,[mioId,browserId,tokenHash]);return {rowCount:overrides.rowCount??1,rows:[row]};},release(){state.released++}}}};
 const verify=createBootstrapVerifier({db,resolveSession:async()=>session,verifyStepUp:async()=>{state.stepUps++;return proof}});
 return {verify,state};
}
test('approved active browser with fresh verified step-up can bootstrap',async()=>{
 const {verify,state}=fixture();const result=await verify({mioId});
 assert.deepEqual(result,{mioId,userVerified:true,deviceApproved:true,method:'approved-device-pairing'});
 assert.equal(state.released,1);
});
test('invalid MIO-ID rejected without database access',async()=>{
 const {verify,state}=fixture();await assert.rejects(verify({mioId:'bad'}),/INVALID_MIO_ID/);assert.equal(state.queries,0);
});
test('wrong MIO-ID session rejected',async()=>{
 const {verify,state}=fixture({session:{mioId:'MIO-0001'}});
 await assert.rejects(verify({mioId}),/SESSION_NOT_VERIFIED/);assert.equal(state.queries,0);
});
test('revoked server session rejected',async()=>{
 const {verify}=fixture({session:{active:false}});
 await assert.rejects(verify({mioId}),/SESSION_NOT_VERIFIED/);
});
test('wrong token in server session rejected by database match',async()=>{
 const {verify}=fixture({row:{token_hash:'c'.repeat(64)}});
 await assert.rejects(verify({mioId}),/DEVICE_NOT_APPROVED/);
});
test('revoked browser row rejected before step-up',async()=>{
 const {verify,state}=fixture({row:{status:'revoked'}});
 await assert.rejects(verify({mioId}),/DEVICE_NOT_APPROVED/);assert.equal(state.stepUps,0);
});
test('no device row rejected',async()=>{
 const {verify}=fixture({rowCount:0});
 await assert.rejects(verify({mioId}),/DEVICE_NOT_APPROVED/);
});
test('unverified step-up rejected',async()=>{
 const {verify}=fixture({proof:{userVerified:false}});
 await assert.rejects(verify({mioId}),/STEP_UP_REQUIRED/);
});
test('replayed step-up rejected',async()=>{
 const {verify}=fixture({proof:{consumed:false}});
 await assert.rejects(verify({mioId}),/STEP_UP_REQUIRED/);
});
test('name or IP matching is not an accepted proof',async()=>{
 const {verify}=fixture({proof:{method:'name-and-ip'}});
 await assert.rejects(verify({mioId}),/STEP_UP_REQUIRED/);
});
test('step-up proof for another browser rejected',async()=>{
 const {verify}=fixture({proof:{browserId:'MIO-W-'+'c'.repeat(24)}});
 await assert.rejects(verify({mioId}),/STEP_UP_REQUIRED/);
});
test('missing trusted dependencies rejected at creation',()=>{
 assert.throws(()=>createBootstrapVerifier({}),/SERVER_DEPENDENCIES_REQUIRED/);
});
