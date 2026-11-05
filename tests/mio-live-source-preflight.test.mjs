import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditGas} from '../tools/mio-gas-live-source-audit.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const full=read('GAS_Code_FULL_WEB_OPS_20261030.gs');
const moduleOnly=read('GAS_WebAdminOps_20261030.gs');
const marker='function mioAdminOps_(ss,d){';
const dispatchLine="if(/^webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));";
const oldCandidate=full.slice(0,full.indexOf(marker)).replace(dispatchLine,'');
test('read-only source audit recognizes matched integrated candidate as a connection-test candidate',()=>{
 const out=auditGas([full],moduleOnly);
 assert.equal(out.status,'READ_ONLY_CONNECTION_TEST_NEXT');
 assert.equal(out.presentOpsCount,19);
 assert.equal(out.doPostCount,1);
 assert.equal(out.canSafelyPatch,false);
 assert.deepEqual(out.duplicates,[]);
});
test('source audit allows human review of minimal patch only for a clean legacy dispatcher',()=>{
 const out=auditGas([oldCandidate],moduleOnly);
 assert.equal(out.status,'MINIMAL_PATCH_CAN_BE_REVIEWED');
 assert.equal(out.presentOpsCount,0);
 assert.equal(out.canSafelyPatch,true);
 assert.match(out.issues.join('\n'),/実デプロイのバージョン照合/);
});
test('source audit stops partial migration, duplicate module and missing secrets',()=>{
 const missingModule=auditGas([full.slice(0,full.indexOf(marker))],moduleOnly);
 assert.equal(missingModule.status,'STOP');
 const twice=auditGas([full,moduleOnly],moduleOnly);
 assert.equal(twice.status,'STOP');
 assert.ok(twice.duplicates.length>=19);
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
 for(const helper of ['json_','safeText_','webIntegrityOk_','ensureWebDerivedRow_']){
  const pattern=new RegExp('^\\\\s*function\\\\s+'+helper+'\\\\s*\\\\(','m');
  const code=full.replace(pattern,'function TEST_REMOVED_'+helper+'(');
  const out=auditGas([code],moduleOnly);
  assert.equal(out.status,'STOP',helper+' is required for safe admin operation');
  assert.ok(out.missingHelpers.includes(helper),helper+' must appear in missing helper report');
 }
});
