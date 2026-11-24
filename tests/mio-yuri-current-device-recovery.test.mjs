import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverFromAdminApprovedLightCookie} from '../mio-admin-approved-light-recovery.js';
const id='MIO-W-b502544b66bbb759c52114d1';
const config={MIO_AUTO_RECOVER_VERIFIED_TWO:'enabled',MIO_LIGHT_SESSION_SECRET:'test-secret-'.repeat(6),
 APPS_SCRIPT_SECRET:'test-apps-'.repeat(6)};
const light={ok:true,participantId:id,name:'ユーリ',status:'承認済み',pendingReview:false,
 attendanceGrantVerified:true,integratedParticipantId:'MIO-0017'};
const gas={ok:true,participantId:id,name:'ユーリ',status:'承認済み',progress:{
 prediction:true,attendanceAchieved:false,attendanceTodayDone:false,fa:0,
 gacha:{confirmed:true,total:2,used:0,remaining:2}}};
const harness=(opts={})=>{
 const headers=[],calls=[];
 const dependencies={
  readLightSession:()=>({...opts.session,id:opts.id||id,token:'a'.repeat(64)}),
  statusV201:async()=>opts.light||light,hash:()=> 'b'.repeat(64),
  bridge:async(action,input)=>{calls.push({action,input});return opts.gas||gas},
  sessionCookie:()=> 'mio_session=valid-test-cookie'};
 return {headers,calls,dependencies,res:{setHeader:(key,value)=>headers.push([key,value])}};
};
test('owner-approved exact new Yuri browser recovers using current GAS aggregate data',async()=>{
 const h=harness();
 const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:'signed'}},res:h.res,config,dependencies:h.dependencies});
 assert.equal(r.status,'recovered');
 assert.equal(r.data.progress.gacha.remaining,2);
 assert.deepEqual(h.calls.map(x=>x.action),['status']);
 assert.deepEqual(h.headers,[['Set-Cookie','mio_session=valid-test-cookie']]);
});
test('pending Neon review cannot grant a login even with matching ColorSing name',async()=>{
 const h=harness({light:{...light,pendingReview:true,status:'本人確認待ち'}});
 const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:'signed'}},res:h.res,config,dependencies:h.dependencies});
 assert.equal(r.status,'not-admin-approved-for-gacha');assert.equal(h.headers.length,0);assert.equal(h.calls.length,0);
});
test('different MIO-ID cannot borrow Yuri aggregate-shape exception',async()=>{
 const h=harness({light:{...light,integratedParticipantId:'MIO-0018'}});
 const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:'signed'}},res:h.res,config,dependencies:h.dependencies});
 assert.equal(r.status,'gas-gacha-entitlement-not-verified');assert.equal(h.headers.length,0);
});
test('different browser cannot borrow Yuri aggregate-shape exception',async()=>{
 const h=harness({id:'MIO-W-'+'c'.repeat(24),light:{...light,participantId:'MIO-W-'+'c'.repeat(24)}});
 const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:'signed'}},res:h.res,config,dependencies:h.dependencies});
 assert.equal(r.status,'gas-gacha-entitlement-not-verified');assert.equal(h.headers.length,0);
});
test('mismatched actual GAS identity and negative remaining are rejected',async()=>{
 for(const g of [{...gas,name:'別人'}, {...gas,progress:{...gas.progress,gacha:{...gas.progress.gacha,remaining:-1}}}]){
  const h=harness({gas:g});
  const r=await recoverFromAdminApprovedLightCookie({req:{headers:{cookie:'signed'}},res:h.res,config,dependencies:h.dependencies});
  assert.equal(r.status,'gas-gacha-entitlement-not-verified');assert.equal(h.headers.length,0);
 }
});
