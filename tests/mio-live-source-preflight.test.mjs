import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditGas} from '../tools/mio-gas-live-source-audit.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const full=read('GAS_Code_FULL_WEB_OPS_20261030.gs');
const moduleOnly=read('GAS_WebAdminOps_20261030.gs');
const marker='function mioAdminOps_(ss,d){';
const dispatchLine="if(/^webAdminOps(?:Read|Approve|Member|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));";
const oldCandidate=full.slice(0,full.indexOf(marker)).replace(dispatchLine,'');
test('read-only source audit recognizes matched integrated candidate as a connection-test candidate',()=>{
 const out=auditGas([full],moduleOnly);
 assert.equal(out.status,'READ_ONLY_CONNECTION_TEST_NEXT');
 assert.equal(out.presentOpsCount,21);
 assert.equal(out.doPostCount,1);
 assert.equal(out.canSafelyPatch,false);
 assert.deepEqual(out.duplicates,[]);
});
test('legacy source can be reviewed but cannot authorize patch without published proof',()=>{
 const out=auditGas([oldCandidate],moduleOnly);
 assert.equal(out.status,'MINIMAL_PATCH_CAN_BE_REVIEWED');
 assert.equal(out.presentOpsCount,0);
 assert.equal(out.canSafelyPatch,false);
 assert.match(out.issues.join('\n'),/実デプロイのバージョン照合/);
});
test('source audit stops partial migration, duplicate module and missing secrets',()=>{
 const missingModule=auditGas([full.slice(0,full.indexOf(marker))],moduleOnly);
 assert.equal(missingModule.status,'STOP');
 const twice=auditGas([full,moduleOnly],moduleOnly);
 assert.equal(twice.status,'STOP');
 assert.ok(twice.duplicates.length>=21);
 const noSecret=auditGas([oldCandidate.replace('equal_(d.secret,secret)','true')],moduleOnly);
 assert.equal(noSecret.status,'STOP');
 const missingAll=auditGas([],moduleOnly);
 assert.equal(missingAll.status,'STOP');
});
test('source audit permits distinct production GAS files only when global functions are unique',()=>{
 const idx=full.indexOf(marker);
 const script=full.slice(0,idx),ops=full.slice(idx);
 const out=auditGas([script,ops],moduleOnly);
 assert.equal(out.status,'READ_ONLY_CONNECTION_TEST_NEXT');
});

test('source audit blocks deployment when required existing integrity helpers are absent',()=>{
 for(const helper of ['json_','equal_','safeText_','webIntegrityOk_','ensureWebDerivedRow_']){
  const original='function '+helper+'(';
  assert.ok(full.includes(original),helper+' appears in candidate');
  const code=full.replace(original,'function TEST_REMOVED_'+helper+'(');
  const out=auditGas([code],moduleOnly);
  assert.equal(out.status,'STOP',helper+' is required for safe admin operation');
  assert.ok(out.missingHelpers.includes(helper),helper+' must appear in missing helper report');
 }
});


test('source with missing equal_ authentication helper cannot pass even if secret comparison call remains',()=>{
 const assertDefinition='function equal_(';
 assert.ok(full.includes(assertDefinition));
 const broken=full.replace(assertDefinition,'function equal_Fake_(');
 const out=auditGas([broken],moduleOnly);
 assert.equal(out.status,'STOP');
 assert.ok(out.missingHelpers.includes('equal_'));
 assert.equal(out.canSafelyPatch,false);
});

test('source-only audit never allows a patch when running published version is unknown',()=>{
 for(const source of [oldCandidate, full, full.slice(0,full.indexOf(marker))]){
  const out=auditGas([source],moduleOnly);
  assert.equal(out.canSafelyPatch,false);
 }
});


test('older source audit cannot treat a quoted dispatcher as executable',()=>{
 assert.ok(full.includes(dispatchLine),'legacy GAS route fixture exists');
 const quoted=full.replace(dispatchLine,'var inertDispatch='+JSON.stringify(dispatchLine)+';');
 assert.notEqual(quoted,full);
 const r=auditGas([quoted],moduleOnly);
 assert.equal(r.status,'STOP');
 assert.equal(r.canSafelyPatch,false);
 assert.match(r.issues.join('\n'),/DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW/);
});

test('older source audit cannot treat a commented dispatcher as executable',()=>{
 assert.ok(full.includes(dispatchLine));
 const commented=full.replace(dispatchLine,'// '+dispatchLine);
 const r=auditGas([commented],moduleOnly);
 assert.equal(r.status,'STOP');
 assert.equal(r.canSafelyPatch,false);
 assert.match(r.issues.join('\n'),/DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW/);
});

test('older source audit refuses an otherwise intact admin route without ScriptLock release',()=>{
 assert.ok(full.includes('lock.releaseLock();'));
 const broken=full.replace('lock.releaseLock();','lock.neverReleaseLock();');
 const r=auditGas([broken],moduleOnly);
 assert.equal(r.status,'STOP');
 assert.equal(r.canSafelyPatch,false);
 assert.match(r.issues.join('\n'),/SCRIPT_LOCK_GUARD_MISSING_OR_MISPLACED/);
});

test('older source audit rejects a dispatcher that omits a required admin action',()=>{
 const missingMember=full.replace(dispatchLine,dispatchLine.replace('Approve|Member|Grant','Approve|Grant'));
 assert.notEqual(missingMember,full);
 const r=auditGas([missingMember],moduleOnly);
 assert.equal(r.status,'STOP');
 assert.equal(r.canSafelyPatch,false);
 assert.match(r.issues.join('\n'),/DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW/);
});
