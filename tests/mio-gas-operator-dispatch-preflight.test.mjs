import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preflightOperatorDispatch} from '../tools/mio-gas-operator-dispatch-preflight.mjs';

const combined=readFileSync(new URL('../GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs',import.meta.url),'utf8');
const files=source=>[{type:'SERVER_JS',name:'Code',source}];
const check=source=>preflightOperatorDispatch(files(source));
const dispatch="    if(/^webAdminOps(?:Read|Member|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));";
test('candidate dispatcher has secret before operator route before participant identity guard',()=>{
 const r=check(combined);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.dispatcherDetected,true);
 assert.equal(r.dispatcherBeforeParticipant,true);
 assert.equal(r.secretGuardDetected,true);
 assert.equal(r.publicationAllowed,false);
 assert.equal(r.patchAllowed,false);
});
test('missing dispatcher is a STOP, not an automatic insertion',()=>{
 const r=check(combined.replace(dispatch,''));
 assert.equal(r.ok,false);assert.equal(r.reason,'DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW');
 assert.equal(r.patchAllowed,false);
});
test('incomplete handler set is STOP',()=>{
 const r=check(combined.replace('function mioAdminOpsRead_(', 'function removedForTest_('));
 assert.equal(r.ok,false);assert.equal(r.reason,'ADMIN_HANDLERS_INCOMPLETE_NO_AUTOPATCH');
 assert.ok(r.missingFunctions.includes('mioAdminOpsRead_'));
});
test('duplicate admin handlers are STOP',()=>{
 const r=check(combined+'\nfunction mioAdminOps_(){}');
 assert.equal(r.reason,'DUPLICATE_CRITICAL_FUNCTIONS');
});
test('duplicate doPost is STOP',()=>{
 const r=check(combined+'\nfunction doPost(){}');
 assert.equal(r.reason,'DUPLICATE_CRITICAL_FUNCTIONS');
});
test('missing source, wrong source shape and missing doPost fail closed',()=>{
 assert.equal(preflightOperatorDispatch(null).reason,'SOURCE_FILES_MISSING');
 assert.equal(preflightOperatorDispatch(files('function dummy(){}')).reason,'DOPOST_MISSING_OR_MULTIPLE');
 assert.equal(preflightOperatorDispatch([{type:'HTML',name:'Index',source:'hello'}]).reason,'NO_SERVER_JS');
});
test('candidate cannot pass without participant identity guard',()=>{
 const r=check(combined.replace("error:'invalid identity'","error:'identity disabled'"));
 assert.equal(r.reason,'UNRECOGNIZED_AUTH_OR_PARTICIPANT_GUARD');
});
test('candidate cannot pass without BRIDGE_SECRET guard',()=>{
 const r=check(combined.replaceAll('BRIDGE_SECRET','OTHER_PROPERTY'));
 assert.equal(r.reason,'UNRECOGNIZED_AUTH_OR_PARTICIPANT_GUARD');
});
test('does not expose source in returned results',()=>{
 const r=check(combined);
 assert.equal(JSON.stringify(r).includes('SHEET_ID'),false);
 assert.equal(JSON.stringify(r).includes('SpreadsheetApp'),false);
});

test('route mentioned only in a comment never counts as an executable dispatch',()=>{
 const comment='// '+dispatch.trim();
 const r=check(combined.replace(dispatch,comment));
 assert.equal(r.ok,false);
 assert.equal(r.reason,'DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW');
});
test('route placed before bridge authentication fails closed',()=>{
 const moved=combined.replace(dispatch,'').replace(
  '    if(!secret||!equal_(d.secret,secret))',
  dispatch+'\n    if(!secret||!equal_(d.secret,secret))');
 const r=check(moved);
 assert.equal(r.ok,false);
 assert.equal(r.reason,'DISPATCHER_BEFORE_SECRET_GUARD');
});
test('route placed after participant identity guard fails closed',()=>{
 const marker="    if(!/^MIO-W-[a-f0-9]{24}$/.test(d.participantId||'')||! /^[a-f0-9]{64}$/.test(d.tokenHash||''))return json_({ok:false,error:'invalid identity'});";
 assert.ok(combined.includes(marker));
 const moved=combined.replace(dispatch,'').replace(marker,marker+'\\n'+dispatch);
 const r=check(moved);
 assert.equal(r.ok,false);
 assert.equal(r.reason,'DISPATCHER_AFTER_PARTICIPANT_GUARD');
});
