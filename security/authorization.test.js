import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeOperation,applyAuthorizedChange} from './authorization.js';
const actor={id:'operator-test',verified:true,scopes:['dev:write','test:write','content:write','media:moderate','release:production','gacha:manage']};
const approval=(operation)=>({verified:true,operation,actorId:actor.id,expiresAt:Date.now()+60000});
test('no unverified identity or privilege',()=>{
 assert.throws(()=>authorizeOperation({operation:'public_announcement',actor:{...actor,verified:false},controls:{routineWritesEnabled:true}}),/UNVERIFIED_ACTOR/);
 assert.throws(()=>authorizeOperation({operation:'gacha_grant',actor:{...actor,scopes:[]}}),/MISSING_SCOPE/);
 assert.throws(()=>authorizeOperation({operation:'not-in-policy',actor}),/UNKNOWN_OPERATION/);
});
test('development cannot be executed in production',()=>{
 assert.throws(()=>authorizeOperation({operation:'branch_code_edit',actor,environment:'production'}),/ISOLATED_ONLY/);
 assert.equal(authorizeOperation({operation:'branch_code_edit',actor,environment:'test'}).risk,'development');
});
test('production routine writes require positive administrator switch and verified identity',()=>{
 assert.throws(()=>authorizeOperation({operation:'public_announcement',actor,environment:'production'}),/ROUTINE_WRITES_DISABLED/);
 assert.equal(authorizeOperation({operation:'public_announcement',actor,environment:'production',controls:{routineWritesEnabled:true}}).needsAudit,true);
 assert.throws(()=>authorizeOperation({operation:'public_announcement',actor,controls:{routineWritesEnabled:true,emergencyStop:true}}),/EMERGENCY_STOP/);
});
test('high impact action needs matching unexpired verified approval',()=>{
 for(const operation of ['production_release','gacha_grant']){
  assert.throws(()=>authorizeOperation({operation,actor}),/EXPLICIT_APPROVAL_REQUIRED/);
  assert.throws(()=>authorizeOperation({operation,actor,approval:{...approval(operation),expiresAt:1}}),/EXPLICIT_APPROVAL_REQUIRED/);
  assert.throws(()=>authorizeOperation({operation,actor,approval:approval('wrong')}),/EXPLICIT_APPROVAL_REQUIRED/);
  assert.equal(authorizeOperation({operation,actor,approval:approval(operation)}).needsAudit,true);
 }
});
test('isolated test action validates and audits',async()=>{
 const events=[];
 const driver={acquire:async()=>true,validate:async()=>events.push('validate'),audit:async(x)=>events.push(x.event),apply:async()=>{events.push('apply');return {ok:true}},checkpoint:async()=>{events.push('checkpoint');return {}},rollback:async()=>events.push('rollback')};
 const result=await applyAuthorizedChange({operation:'isolated_test_data',actor,environment:'test',requestId:'1234567890123456',driver,payload:{}});
 assert.deepEqual(result,{ok:true});assert.deepEqual(events,['validate','attempt','apply','success']);
});
test('duplicate request is refused before applying',async()=>{
 let applied=false;const driver={acquire:async()=>false,validate:async()=>{},audit:async()=>{},apply:async()=>{applied=true},checkpoint:async()=>{},rollback:async()=>{}};
 await assert.rejects(()=>applyAuthorizedChange({operation:'isolated_test_data',actor,environment:'test',requestId:'1234567890123456',driver,payload:{}}),/DUPLICATE_REQUEST/);
 assert.equal(applied,false);
});
test('routine update gets checkpoint and rollback on error',async()=>{
 const events=[];
 const driver={acquire:async()=>true,validate:async()=>{},audit:async(x)=>events.push(x.event),apply:async()=>{throw Error('storage failed')},checkpoint:async()=>{events.push('checkpoint');return {before:true}},rollback:async()=>events.push('rollback')};
 await assert.rejects(()=>applyAuthorizedChange({operation:'public_announcement',actor,environment:'production',controls:{routineWritesEnabled:true},requestId:'1234567890123456',driver,payload:{}}),/storage failed/);
 assert.deepEqual(events,['checkpoint','attempt','rollback']);
});
