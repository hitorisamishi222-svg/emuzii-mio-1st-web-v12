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

test('all 21 operator module functions must exist, not only 7 actions',()=>{
 const r=check(combined);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.requiredFunctionCount,21);
});
test('missing shared helper blocks read even when every action handler exists',()=>{
 const r=check(combined.replace('function mioAdminOpsSchema_(', 'function removedSchemaForTest_('));
 assert.equal(r.ok,false);
 assert.equal(r.reason,'ADMIN_HANDLERS_INCOMPLETE_NO_AUTOPATCH');
 assert.ok(r.missingFunctions.includes('mioAdminOpsSchema_'));
});
test('duplicate shared helper blocks release',()=>{
 const r=check(combined+'\nfunction mioAdminOpsRecordGrant_(){}');
 assert.equal(r.ok,false);
 assert.equal(r.reason,'DUPLICATE_CRITICAL_FUNCTIONS');
});

test('commented-out missing helper cannot be counted as an implemented function',()=>{
 const removed=combined.replace('function mioAdminOpsSchema_(', 'function renamedSchemaForTest_(');
 const lineComment=check(removed+'\n// function mioAdminOpsSchema_(){}');
 const blockComment=check(removed+'\n/*\nfunction mioAdminOpsSchema_(){}\n*/');
 for(const result of [lineComment,blockComment]){
  assert.equal(result.ok,false);
  assert.equal(result.reason,'ADMIN_HANDLERS_INCOMPLETE_NO_AUTOPATCH');
  assert.ok(result.missingFunctions.includes('mioAdminOpsSchema_'));
  assert.equal(result.publicationAllowed,false);
 }
});
test('commented duplicate helpers are not mistaken for real duplicate definitions',()=>{
 const result=check(combined+'\n/*\nfunction mioAdminOps_(){}\n*/\n// function doPost(){}');
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.patchAllowed,false);
 assert.equal(result.publicationAllowed,false);
});
test('comment with a fake dispatcher cannot repair missing live route',()=>{
 const missing=combined.replace(dispatch,'');
 const r=check(missing+'\n/* '+dispatch+' */');
 assert.equal(r.ok,false);
 assert.equal(r.reason,'DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW');
});

test('missing October shared dependencies must stop before management read',()=>{
 const shared=['json_','equal_','safeText_','webIntegrityOk_','ensureWebDerivedRow_'];
 for(const fn of shared){
  const original='function '+fn+'(';
  assert.ok(combined.includes(original),fn+' exists in candidate');
  const r=check(combined.replace(original,'function renamedSharedForTest_('));
  assert.equal(r.ok,false,fn);
  assert.equal(r.reason,'SHARED_HELPERS_MISSING_NO_AUTOPATCH',fn);
  assert.ok(r.missingSharedFunctions.includes(fn),fn);
  assert.equal(r.publicationAllowed,false);
  assert.equal(r.patchAllowed,false);
 }
});
test('a commented shared function cannot hide a missing real definition',()=>{
 const source=combined.replace('function safeText_(', 'function renamedSharedForTest_(')+
  '\n/*\nfunction safeText_(){}\n*/';
 const r=check(source);
 assert.equal(r.reason,'SHARED_HELPERS_MISSING_NO_AUTOPATCH');
 assert.ok(r.missingSharedFunctions.includes('safeText_'));
});

test('ScriptLock must guard operator dispatch and always release',()=>{
 const good=check(combined);
 assert.equal(good.scriptLockGuardDetected,true);
 const cases=[
  ['missing lock',combined.replace('LockService.getScriptLock()', 'LockService.getUserLock()')],
  ['missing lock acquisition',combined.replace('lock.tryLock(10000)', 'lock.fakeTryLock(10000)')],
  ['missing release in finally',combined.replace('lock.releaseLock();', 'lock.fakeReleaseLock();')],
 ];
 for(const [label,source] of cases){
  assert.notEqual(source,combined,label+' fixture changes source');
  const r=check(source);
  assert.equal(r.ok,false,label);
  assert.equal(r.reason,'SCRIPT_LOCK_GUARD_MISSING_OR_MISPLACED',label);
  assert.equal(r.publicationAllowed,false);
  assert.equal(r.patchAllowed,false);
 }
});


// MIO_INLINE_COMMENT_AND_QUOTED_ROUTE_GUARD_20261109
test('quoted fake admin dispatcher cannot replace executable route',()=>{
 const decoy=combined.replace(dispatch,'    var unusedRoute='+JSON.stringify(dispatch.trim())+';');
 assert.notEqual(decoy,combined);
 const report=check(decoy);
 assert.equal(report.ok,false);
 assert.equal(report.reason,'DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW');
 assert.equal(report.publicationAllowed,false);
 assert.equal(report.patchAllowed,false);
});

test('inline comment with a fake dispatcher cannot repair a missing route',()=>{
 const decoy=combined.replace(dispatch,'    var untouched=0; // '+dispatch.trim());
 assert.notEqual(decoy,combined);
 const report=check(decoy);
 assert.equal(report.ok,false);
 assert.equal(report.reason,'DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW');
 assert.equal(report.publicationAllowed,false);
 assert.equal(report.patchAllowed,false);
});

test('real dispatcher remains valid alongside ordinary strings and comments',()=>{
 const expanded=combined.replace(dispatch,
  "    var sampleLabel='https://example.invalid/'; // unrelated inline comment\n"+dispatch);
 assert.notEqual(expanded,combined);
 const report=check(expanded);
 assert.equal(report.ok,true,JSON.stringify(report));
 assert.equal(report.publicationAllowed,false);
 assert.equal(report.patchAllowed,false);
});


test('historical Approved-before-Member action order stays valid but incomplete lists do not',()=>{
 const historical=readFileSync(new URL('../GAS_Code_FULL_WEB_OPS_20261030.gs',import.meta.url),'utf8');
 const route='Read|Approve|Member|Grant|Review|Create|Intake';
 assert.ok(historical.includes(route));
 const accepted=check(historical);
 assert.equal(accepted.ok,true,JSON.stringify(accepted));
 assert.equal(accepted.publicationAllowed,false);
 const partial=historical.replace(route,'Read|Approve|Grant|Review|Create|Intake');
 const denied=check(partial);
 assert.equal(denied.ok,false);
 assert.equal(denied.reason,'DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW');
 assert.equal(denied.patchAllowed,false);
});


test('quoted multiline fake function declarations never satisfy live helper requirements',()=>{
 const missing=combined.replace('function mioAdminOpsSchema_(', 'function renamedSchemaForTest_(');
 assert.notEqual(missing,combined);
 const decoy=missing+'\nconst fakeSource = `\nfunction mioAdminOpsSchema_(){}\n`;\n';
 const result=check(decoy);
 assert.equal(result.ok,false);
 assert.equal(result.reason,'ADMIN_HANDLERS_INCOMPLETE_NO_AUTOPATCH');
 assert.ok(result.missingFunctions.includes('mioAdminOpsSchema_'));
 assert.equal(result.publicationAllowed,false);
 assert.equal(result.patchAllowed,false);
});

test('multiline quoted fake duplicates do not invalidate real GAS declarations',()=>{
 const source=combined+'\nconst fakeSource = `\nfunction doPost(){}\nfunction mioAdminOpsGrant_(){}\n`;\n';
 const result=check(source);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.publicationAllowed,false);
 assert.equal(result.patchAllowed,false);
});
