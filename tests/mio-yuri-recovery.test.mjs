import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGET,credentialsFromCode,assertVerifiedStatus} from '../mio-yuri-recovery-core.mjs';
import {redeemYuriCode} from '../api-yuri-restore.js';
import {approvedYuriGASHash,yuriRecoveryGASHash} from '../mio-yuri-recovery-session.mjs';
import {issueYuriCode} from '../api-yuri-issue.js';
import {sessionCookie,readSession} from '../bridge.js';

const code='MIO-REC-'+'a'.repeat(32),newCred=credentialsFromCode(code);
const oldHash='9ac305f78857e9c3a2fbf81cc442e6d7c794621d74390dec14d4dcb51a400467';
const valid={ok:true,participantId:TARGET.webId,name:TARGET.name,status:'承認済み',
 progress:{attendanceAchieved:false,gacha:{confirmed:true,total:2,used:0,remaining:2}}};

function mockDb({found=true,approved=true,session=true,alreadyConsumed=false}={}){
 const calls=[];
 let consumed=alreadyConsumed;
 const query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT recovery_hash'))return {rows:found?[{recovery_hash:newCred.codeHash}]:[]};
  if(sql.startsWith('SELECT n.token_hash AS gas_hash FROM mio_yuri_recovery_v1'))return {rows:session?[{gas_hash:oldHash}]:[]};
  if(sql.startsWith('SELECT n.token_hash AS gas_hash FROM mio_registration_v2'))return {rows:approved?[{gas_hash:oldHash}]:[]};
  if(sql.startsWith('UPDATE mio_yuri_recovery_v1')){
   if(consumed)return {rows:[]};
   consumed=true;
   assert.deepEqual(args,[newCred.codeHash,TARGET.webId,TARGET.mioId,newCred.tokenHash]);
   assert.match(sql,/session_expires_at=now\(\)\+interval '90 days'/);
   return {rows:[{recovery_hash:newCred.codeHash}]};
  }
  if(sql.startsWith('SELECT n.browser_id'))return {rows:approved?[{browser_id:TARGET.webId}]:[]};
  if(sql.startsWith('INSERT INTO mio_yuri_recovery_v1'))return {rows:found?[{expires_at:'2026-11-26T09:00:00Z'}]:[]};
  return {rows:[]};
 };
 return {calls,query,async connect(){return {query,release(){calls.push({sql:'RELEASE',args:[]})}}}};
}

test('owner-approved exact legacy token hash is read only, not rotated',async()=>{
 const db=mockDb();
 assert.equal(await approvedYuriGASHash(db),oldHash);
 assert.equal(db.calls.length,1);
 assert.ok(db.calls[0].sql.includes("n.approved_by='owner-authorized-recovery-20261124'"));
});
test('a new recovery token delegates only to the original exact approved GAS hash',async()=>{
 const db=mockDb();
 assert.equal(await yuriRecoveryGASHash({id:TARGET.webId,token:newCred.token},{db}),oldHash);
 assert.ok(db.calls[0].sql.includes('t.redeemed_at IS NOT NULL'));
 assert.ok(db.calls[0].sql.includes('t.session_expires_at>now()'));
 assert.ok(db.calls[0].sql.includes('rv.token_hash=n.token_hash'));
});
test('other people, expired sessions and corrupt tokens fail closed',async()=>{
 const db=mockDb({session:false});
 assert.equal(await yuriRecoveryGASHash({id:TARGET.webId,token:newCred.token},{db}),null);
 assert.equal(await yuriRecoveryGASHash({id:'MIO-W-'+'b'.repeat(24),token:newCred.token},{db}),null);
 assert.equal(await yuriRecoveryGASHash({id:TARGET.webId,token:'oops'},{db}),null);
 assert.equal(db.calls.length,1);
});
test('owner issue requires real GAS rights before creating one-use record',async()=>{
 const db=mockDb();
 const result=await issueYuriCode({database:db,newCode:code,callGAS:async(action,body)=>{
  assert.equal(action,'status');
  assert.deepEqual(body,{participantId:TARGET.webId,tokenHash:oldHash});
  return valid;
 }});
 assert.equal(result.code,code);assert.equal(result.drawsRemaining,2);
 assert.equal(db.calls.filter(x=>x.sql.startsWith('INSERT INTO')).length,1);
});
test('owner issue denies when GAS proof is missing, without minting a code',async()=>{
 const db=mockDb();
 await assert.rejects(issueYuriCode({database:db,newCode:code,callGAS:async()=>({...valid,progress:{...valid.progress,gacha:{confirmed:false,total:2,used:0,remaining:2}}})}),/GAS_ENTITLEMENT_UNVERIFIED/);
 assert.equal(db.calls.filter(x=>x.sql.startsWith('INSERT INTO')).length,0);
});
test('one-use redemption verifies original GAS hash and signs an independent session',async()=>{
 const db=mockDb();
 const out=await redeemYuriCode({code,db,callGAS:async(action,payload)=>{
  assert.equal(action,'status');
  assert.deepEqual(payload,{participantId:TARGET.webId,tokenHash:oldHash});
  return valid;
 }});
 assert.equal(out.token,newCred.token);assert.equal(out.entitlement.remaining,2);
 assert.deepEqual(db.calls.filter(x=>['BEGIN','COMMIT','ROLLBACK'].includes(x.sql)).map(x=>x.sql),['BEGIN','COMMIT']);
 const key='another-shared-bridge-secret-value'.repeat(3);
 const c=sessionCookie(TARGET.webId,out.token,key);
 assert.deepEqual(readSession(c,key),{id:TARGET.webId,token:newCred.token});
});
test('no active owner code blocks redemption without contacting GAS',async()=>{
 const db=mockDb({found:false});let called=false;
 await assert.rejects(redeemYuriCode({code,db,callGAS:async()=>{called=true;return valid}}),/CODE_EXPIRED_OR_USED/);
 assert.equal(called,false);
});
test('unverified GAS response blocks redemption before transaction',async()=>{
 const db=mockDb();
 await assert.rejects(redeemYuriCode({code,db,callGAS:async()=>({...valid,participantId:'fake'})}),/GAS_ENTITLEMENT_UNVERIFIED/);
 assert.equal(db.calls.some(x=>x.sql==='BEGIN'),false);
});
test('owner approval mismatch rolls back code consumption',async()=>{
 const db=mockDb({approved:false});
 await assert.rejects(redeemYuriCode({code,db,callGAS:async()=>valid}),/YURI_OWNER_APPROVAL_NOT_VERIFIED/);
 assert.equal(db.calls.some(x=>x.sql==='BEGIN'),false);
});
test('second usage cannot mint second session',async()=>{
 const db=mockDb();
 await redeemYuriCode({code,db,callGAS:async()=>valid});
 await assert.rejects(redeemYuriCode({code,db,callGAS:async()=>valid}),/CODE_EXPIRED_OR_USED/);
});
test('wrong account and duplicated draws remain rejected',()=>{
 assert.equal(assertVerifiedStatus(valid).remaining,2);
 for(const d of [{...valid,participantId:'MIO-W-'+'b'.repeat(24)},
  {...valid,name:'別人'},{...valid,status:'承認待ち'},
  {...valid,progress:{...valid.progress,gacha:{confirmed:true,total:4,used:0,remaining:4}}},
  {...valid,progress:{...valid.progress,gacha:{confirmed:true,total:2,used:1,remaining:2}}}])
  assert.throws(()=>assertVerifiedStatus(d),/GAS_ENTITLEMENT_UNVERIFIED/);
});
