import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGET,credentialsFromCode,assertVerifiedStatus} from '../mio-yuri-recovery-core.mjs';
import {redeemYuriCode} from '../api-yuri-restore.js';

const code='MIO-REC-'+'a'.repeat(32),stored=credentialsFromCode(code);
const valid={ok:true,participantId:TARGET.webId,name:TARGET.name,status:'承認済み',
 progress:{attendanceAchieved:false,gacha:{confirmed:true,total:2,used:0,remaining:2}}};

function memoryDb({found=true,approved=true}={}){
 let consumed=false;
 const calls=[];
 const query=async (sql,args=[])=>{
  calls.push(sql);
  if(sql.startsWith('SELECT recovery_hash'))return {rows:found?[{recovery_hash:stored.codeHash}]:[]};
  if(sql.startsWith('UPDATE mio_yuri_recovery_v1')){
   if(consumed)return {rows:[]};
   consumed=true;
   assert.deepEqual(args,[stored.codeHash,TARGET.webId,TARGET.mioId,stored.tokenHash]);
   return {rows:[{recovery_hash:stored.codeHash}]};
  }
  if(sql.startsWith('SELECT n.browser_id'))return {rows:approved?[{browser_id:TARGET.webId}]:[]};
  return {rows:[]};
 };
 return {calls,query,async connect(){return {query,release(){calls.push('RELEASE')}}}};
}

test('exact code redeems only after existing GAS entitlement and signed registration',async()=>{
 const db=memoryDb();
 const d=await redeemYuriCode({code,db,callGAS:async(a,p)=>{
  assert.equal(a,'status');assert.deepEqual(p,{participantId:TARGET.webId,tokenHash:stored.tokenHash});
  return valid;
 }});
 assert.equal(d.token,stored.token);assert.equal(d.entitlement.remaining,2);
 assert.deepEqual(db.calls.filter(x=>['BEGIN','COMMIT','ROLLBACK'].includes(x)),['BEGIN','COMMIT']);
});

test('no active/unused code denies before GAS call',async()=>{
 const db=memoryDb({found:false});let called=false;
 await assert.rejects(redeemYuriCode({code,db,callGAS:async()=>{called=true;return valid}}),/CODE_EXPIRED_OR_USED/);
 assert.equal(called,false);assert.deepEqual(db.calls.filter(x=>x==='BEGIN'),[]);
});

test('GAS must confirm exactly two existing draws, not two new grants',async()=>{
 const db=memoryDb();const wrong={...valid,progress:{...valid.progress,gacha:{confirmed:false,total:2,used:0,remaining:2}}};
 await assert.rejects(redeemYuriCode({code,db,callGAS:async()=>wrong}),/GAS_ENTITLEMENT_UNVERIFIED/);
 assert.equal(db.calls.includes('BEGIN'),false);
});

test('missing owner-approved identity rolls back consumed code',async()=>{
 const db=memoryDb({approved:false});
 await assert.rejects(redeemYuriCode({code,db,callGAS:async()=>valid}),/NEON_APPROVAL_MISMATCH/);
 assert.deepEqual(db.calls.filter(x=>['BEGIN','COMMIT','ROLLBACK'].includes(x)),['BEGIN','ROLLBACK']);
});

test('second use of a code is rejected and cannot issue second session',async()=>{
 const db=memoryDb();
 await redeemYuriCode({code,db,callGAS:async()=>valid});
 await assert.rejects(redeemYuriCode({code,db,callGAS:async()=>valid}),/CODE_EXPIRED_OR_USED/);
});

test('pending, other browser, wrong gacha history and unexpected claims fail',()=>{
 assert.deepEqual(assertVerifiedStatus(valid),{remaining:2,total:2,used:0});
 for(const x of [{...valid,participantId:'MIO-W-'+'a'.repeat(24)},
  {...valid,name:'別人'}, {...valid,status:'承認待ち'},
  {...valid,progress:{...valid.progress,gacha:{confirmed:true,total:4,used:0,remaining:4}}},
  {...valid,progress:{...valid.progress,gacha:{confirmed:true,total:2,used:1,remaining:2}}}])
   assert.throws(()=>assertVerifiedStatus(x),/GAS_ENTITLEMENT_UNVERIFIED/);
});
