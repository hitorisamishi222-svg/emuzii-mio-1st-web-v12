import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const marker='// -- みお Web運営管理 (2026-10-30)';
const route='    if(/^webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));\n';

test('full-paste GAS preserves pre-Web-admin functions without rewriting existing core',()=>{
 const full=load('GAS_Code_FULL_WEB_OPS_20261030.gs');
 const baseline=load('backups/MIO_Code_PRE_WEB_ADMIN_reconstructed_20261030.gs');
 assert.equal(full.includes(marker),true);
 const end=full.indexOf(marker);
 assert.ok(end>30000);
 const prefix=full.slice(0,end);
 assert.equal(prefix.split(route).length,2,'dispatch must exist exactly once');
 assert.equal(prefix.replace(route,''),baseline,'existing core changed; compare backup and release');
 assert.ok(full.includes('function mioAdminOpsGrant_('));
 assert.ok(full.includes('function mioAdminOpsApprove_('));
 assert.equal(baseline.includes('function mioAdminOpsGrant_('),false);
 for(const fn of ['doPost','checkinAction_','gachaAction_','mioAdminVerifiedTwoBrowserFromCode_','gachaWebGateActionInline1030_']){
  assert.equal(baseline.split('function '+fn+'(').length-1,1,fn);
  assert.equal(full.split('function '+fn+'(').length-1,1,fn);
 }
});
