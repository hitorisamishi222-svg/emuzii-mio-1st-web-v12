import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverFromAdminApprovedLightCookie} from '../mio-admin-approved-light-recovery.js';

const id='MIO-W-1b85de069bf677d2affca3c5';
const secret='unit-test-secret-long-enough-to-satisfy-cookie-signing';
const config={MIO_AUTO_RECOVER_VERIFIED_TWO:'enabled',MIO_LIGHT_SESSION_SECRET:secret,APPS_SCRIPT_SECRET:secret};
const fakeSession={id,token:'b'.repeat(64)};
function makeHarness({light={ok:true,participantId:id,name:'えむじー🐱',pendingReview:true,status:'本人確認待ち'},gas={ok:true,participantId:id,name:'えむじー🐱',status:'承認済み',progress:{attendanceConfirmedDays:[1],attendanceLockedDays:[]}},session=fakeSession}={}){
 const calls=[],headers=[];
 const dependencies={
  readLightSession:()=>session,
  statusV201:async()=>light,
  hash:()=> 'a'.repeat(64),
  bridge:async(action,identity)=>{calls.push({action,identity});return gas},
  sessionCookie:()=> 'mio_session=test-only'
 };
 return {calls,headers,dependencies,res:{setHeader:(key,value)=>headers.push([key,value])}};
}
test('approved MIO-0003 browser recovers from signed light cookie and exact GAS identity',async()=>{
 const h=makeHarness();
 const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:'signed-light-cookie'}},res:h.res,config,dependencies:h.dependencies});
 assert.equal(r.status,'recovered');
 assert.equal(r.data.participantId,id);
 assert.deepEqual(h.calls.map(x=>x.action),['status']);
 assert.equal(h.calls[0].identity.participantId,id);
 assert.equal(h.calls[0].identity.tokenHash,'a'.repeat(64));
 assert.deepEqual(h.headers,[['Set-Cookie','mio_session=test-only']]);
});
test('same-name response with another browser id cannot receive a session',async()=>{
 const h=makeHarness({gas:{ok:true,participantId:'MIO-W-'+'c'.repeat(24),name:'えむじー🐱',status:'承認済み',progress:{attendanceConfirmedDays:[],attendanceLockedDays:[]}}});
 const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:''}},res:h.res,config,dependencies:h.dependencies});
 assert.equal(r.status,'gas-status-failed');
 assert.equal(h.headers.length,0);
});
test('pending GAS identity cannot receive a session even for a reviewed admin browser',async()=>{
 const h=makeHarness({gas:{ok:true,participantId:id,name:'えむじー🐱',status:'承認待ち',progress:{attendanceConfirmedDays:[],attendanceLockedDays:[]}}});
 const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:''}},res:h.res,config,dependencies:h.dependencies});
 assert.equal(r.status,'gas-status-failed');
 assert.equal(h.headers.length,0);
});
test('Neon identity disagreement cannot use an approved GAS row',async()=>{
 const h=makeHarness({light:{ok:true,participantId:id,name:'another user',pendingReview:true}});
 const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:''}},res:h.res,config,dependencies:h.dependencies});
 assert.equal(r.status,'neon-identity-mismatch');
 assert.equal(h.calls.length,0);
});
test('other unapproved browsers cannot use this one-browser recovery',async()=>{
 const h=makeHarness({session:{id:'MIO-W-'+'f'.repeat(24),token:'a'.repeat(64)}});
 const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:''}},res:h.res,config,dependencies:h.dependencies});
 assert.equal(r.status,'not-admin-approved-for-gacha');
 assert.equal(h.calls.length,0);
 assert.equal(h.headers.length,0,'unapproved browser must not receive a cookie');
});
