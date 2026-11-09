import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditMigrationPlan,GRANT_HEADERS,AUDIT_HEADERS,GRANT_TAB,AUDIT_TAB}
 from '../tools/mio-audit-schema-migration-plan.mjs';
const create=(changes={})=>({
 sheetNames:[GRANT_TAB,'emuzii_Web登録','emuzii_参加者'],
 grantHeaders:[...GRANT_HEADERS],
 jColumnValues:Array(1000).fill(''),
 grantRowCapacity:1000,grantColumnCapacity:26,
 ...changes
});
test('realistic existing sheet shape yields precisely two metadata/header operations, NEVER approval',()=>{
 const out=auditMigrationPlan(create());
 assert.equal(out.ok,true);
 assert.equal(out.status,'AWAITING_EXPLICIT_SCHEMA_APPROVAL');
 assert.equal(out.writeAllowed,false);
 assert.equal(out.operations.length,2);
 assert.deepEqual(out.operations.map(x=>x.type),['CREATE_AUDIT_TAB','SET_GRANT_J1']);
 assert.equal(out.operations[0].title,AUDIT_TAB);
 assert.deepEqual(out.operations[0].headings,AUDIT_HEADERS);
 assert.equal(out.operations[1].cell,'J1');
 assert.equal(out.verifiedJRowCount,1000);
 assert.equal(out.existingGrantHistoryProtected,true);
});
test('existing exact audit sheet and J1 are ALREADY_READY with no mutation plan',()=>{
 const j=Array(1000).fill('');j[0]='Web操作ID';
 const out=auditMigrationPlan(create({
  sheetNames:[GRANT_TAB,AUDIT_TAB],
  auditHeaders:[...AUDIT_HEADERS],
  jColumnValues:j
 }));
 assert.equal(out.ok,true);assert.equal(out.status,'ALREADY_READY');
 assert.deepEqual(out.operations,[]);assert.equal(out.writeAllowed,false);
});
test('existing exact J1 but missing audit sheet only requires audit-tab creation',()=>{
 const j=Array(1000).fill('');j[0]='Web操作ID';
 const out=auditMigrationPlan(create({jColumnValues:j}));
 assert.deepEqual(out.operations.map(x=>x.type),['CREATE_AUDIT_TAB']);
});
test('existing audit tab with exact header but blank J only proposes J1',()=>{
 const out=auditMigrationPlan(create({
  sheetNames:[GRANT_TAB,AUDIT_TAB],auditHeaders:[...AUDIT_HEADERS]
 }));
 assert.deepEqual(out.operations.map(x=>x.type),['SET_GRANT_J1']);
});
test('existing J2:J1000 data, even one cell, requires STOP without a change',()=>{
 for(const row of [2,9,1000]){
  const values=Array(1000).fill('');values[row-1]='existing-data';
  const out=auditMigrationPlan(create({jColumnValues:values}));
  assert.equal(out.ok,false);assert.equal(out.reason,'J_DATA_OCCUPIED');
  assert.deepEqual(out.operations,[]);assert.equal(out.writeAllowed,false);
 }
});
test('unexpected J1 data or renamed existing headers requires STOP',()=>{
 const j=Array(1000).fill('');j[0]='別管理の列';
 assert.equal(auditMigrationPlan(create({jColumnValues:j})).reason,'J_HEADER_OCCUPIED');
 const h=[...GRANT_HEADERS];h[2]='違う名前';
 assert.equal(auditMigrationPlan(create({grantHeaders:h})).reason,'GRANT_HEADERS_CHANGED');
});
test('existing audit tab with one mismatched heading is never overwritten',()=>{
 const bad=[...AUDIT_HEADERS];bad[4]='他のデータ';
 const out=auditMigrationPlan(create({
  sheetNames:[GRANT_TAB,AUDIT_TAB],auditHeaders:bad
 }));
 assert.equal(out.status,'STOP');assert.equal(out.reason,'AUDIT_TAB_EXISTS_UNEXPECTED');
 assert.deepEqual(out.operations,[]);
});
test('no entire J scan, wrong grid capacity or duplicate sheet names => STOP',()=>{
 assert.equal(auditMigrationPlan(create({jColumnValues:Array(9).fill('')})).reason,'J_COLUMN_NOT_FULLY_SCANNED');
 assert.equal(auditMigrationPlan(create({grantColumnCapacity:9})).reason,'GRANT_GRID_UNVERIFIED');
 assert.equal(auditMigrationPlan(create({sheetNames:[GRANT_TAB,GRANT_TAB]})).reason,'SHEET_NAMES_UNTRUSTED');
 assert.equal(auditMigrationPlan(create({sheetNames:[AUDIT_TAB]})).reason,'GRANT_TAB_MISSING');
});
test('the dry-run module contains no provider mutation primitives',()=>{
 const src=readFileSync(new URL('../tools/mio-audit-schema-migration-plan.mjs',import.meta.url),'utf8');
 for(const token of ['insertSheet(','.setValue(','.setValues(','.appendRow(','.batchUpdate(','.deleteSheet('])
  assert.equal(src.includes(token),false,'offline-only code cannot mutate');
});
test('no names, tokens, sheet IDs or past prize records are echoed',()=>{
 const secret='DoNotShowFakeParticipantName';
 const result=auditMigrationPlan(create({jColumnValues:Array(1000).fill('').map((x,i)=>i===1?secret:x)}));
 assert.equal(result.ok,false);
 assert.equal(JSON.stringify(result).includes(secret),false);
});
