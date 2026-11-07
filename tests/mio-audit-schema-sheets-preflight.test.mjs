import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditLiveSheetRead} from '../tools/mio-audit-schema-sheets-preflight.mjs';
import {GRANT_HEADERS,GRANT_TAB,AUDIT_TAB,AUDIT_HEADERS} from '../tools/mio-audit-schema-migration-plan.mjs';
const range="'"+GRANT_TAB+"'!J1:J1000";
const fixture=overrides=>({
 sheetNames:[GRANT_TAB,'emuzii_参加者','emuzii_Web登録'],
 grantHeaders:[...GRANT_HEADERS],
 rowCapacity:1000,columnCapacity:26,
 displayedRead:{range,values:[]},formulaRead:{range,values:[]},
 ...overrides
});
test('Google trimmed all-empty J1:J1000 response is verified only with exact range, both modes',()=>{
 const result=auditLiveSheetRead(fixture());
 assert.equal(result.ok,true);
 assert.equal(result.status,'AWAITING_EXPLICIT_SCHEMA_APPROVAL');
 assert.equal(result.writeAllowed,false);
 assert.deepEqual(result.verifiedReadModes,['display','formula']);
 assert.equal(result.fullyReadRequestedRows,1000);
 assert.deepEqual(result.operations.map(v=>v.type),['CREATE_AUDIT_TAB','SET_GRANT_J1']);
});
test('sparse blank responses and blank-array rows are supported without claiming an edit occurred',()=>{
 const rows=[[],[''],[],['']];
 const result=auditLiveSheetRead(fixture({
   displayedRead:{range,values:rows},
   formulaRead:{range,values:rows}
 }));
 assert.equal(result.ok,true);assert.equal(result.writeAllowed,false);
});
test('a formula that displays an empty string is detected in FORMULA mode',()=>{
 const formula='=IF(1=1,"","!")';
 const result=auditLiveSheetRead(fixture({formulaRead:{range,values:[[],[formula]]}}));
 assert.equal(result.status,'STOP');
 assert.equal(result.reason,'J_COLUMN_VALUE_OR_FORMULA_OCCUPIED');
 assert.equal(JSON.stringify(result).includes(formula),false);
});
test('a value hidden in the last allocated row blocks migration',()=>{
 const values=Array.from({length:1000},()=>[]);
 values[999]=['existing'];
 const result=auditLiveSheetRead(fixture({displayedRead:{range,values}}));
 assert.equal(result.reason,'J_COLUMN_VALUE_OR_FORMULA_OCCUPIED');
 assert.deepEqual(result.operations,[]);
});
test('display range and formula range must both match the exact allocated bounds',()=>{
 for(const prop of ['displayedRead','formulaRead']){
  for(const wrong of [
   'J1:J1000', "'"+GRANT_TAB+"'!J1:J999",
   "'"+GRANT_TAB+"'!J2:J1000", "'other'!J1:J1000"
  ]){
   const result=auditLiveSheetRead(fixture({[prop]:{range:wrong,values:[]}}));
   assert.equal(result.status,'STOP');
   assert.equal(result.writeAllowed,false);
   assert.deepEqual(result.operations,[]);
  }
 }
});
test('missing, truncated, malformed, or oversized provider responses fail closed',()=>{
 for(const bad of [
  null, {}, {range}, {range,values:null}, {range,values:[['x','y']]},
  {range,values:[{}]}, {range,values:[123]},
  {range,values:Array(1001).fill([])}
 ]){
  const result=auditLiveSheetRead(fixture({formulaRead:bad}));
  assert.equal(result.status,'STOP');
  assert.deepEqual(result.operations,[]);
 }
});
test('renamed grant header, missing audit tab status, and wrong grid sizing all stop',()=>{
 const wrong=[...GRANT_HEADERS];wrong[0]='wrong';
 assert.equal(auditLiveSheetRead(fixture({grantHeaders:wrong})).reason,'GRANT_HEADERS_CHANGED');
 assert.equal(auditLiveSheetRead(fixture({columnCapacity:9})).reason,'GRANT_GRID_UNVERIFIED');
 assert.equal(auditLiveSheetRead(fixture({sheetNames:[AUDIT_TAB]})).reason,'GRANT_TAB_MISSING');
 assert.equal(auditLiveSheetRead(fixture({
   sheetNames:[GRANT_TAB,AUDIT_TAB],auditHeaders:['wrong',...AUDIT_HEADERS.slice(1)]
 })).reason,'AUDIT_TAB_EXISTS_UNEXPECTED');
});
test('already prepared audit/J1 requires empty J2 onwards; header-only not a conflict',()=>{
 const v=[['Web操作ID']];
 const result=auditLiveSheetRead(fixture({
  sheetNames:[GRANT_TAB,AUDIT_TAB],auditHeaders:[...AUDIT_HEADERS],
  displayedRead:{range,values:v},formulaRead:{range,values:v}
 }));
 // The adapter is for pre-migration blank J only, so an installed header
 // must be checked through the migration planner, never silently dropped.
 assert.equal(result.status,'STOP');
 assert.equal(result.reason,'J_COLUMN_VALUE_OR_FORMULA_OCCUPIED');
});
test('module contains no live API requests or write actions',()=>{
 const src=readFileSync(new URL('../tools/mio-audit-schema-sheets-preflight.mjs',import.meta.url),'utf8');
 for(const disallowed of ['fetch(', 'insertSheet(','.setValue(','.setValues(','.appendRow(','DriveApp.', 'SpreadsheetApp.'])
   assert.equal(src.includes(disallowed),false,disallowed);
});
