import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('additive module does not replace the existing GAS doPost or lottery handlers',()=>{
 const module=file('GAS_WebAdminOps_20261030.gs');
 assert.match(module,/function mioAdminOps_\(/);
 assert.match(module,/function mioAdminOpsGrant_\(/);
 assert.match(module,/function mioAdminOpsRead_\(/);
 assert.doesNotMatch(module,/function doPost\(/);
 assert.doesNotMatch(module,/function gachaAction_\(/);
 assert.doesNotMatch(module,/function gachaWebGateActionInline1030_\(/);
});
test('existing full-code dispatcher installs after bridge secret and before participant auth',()=>{
 const original=file('GAS_Code_FULL_WEB_OPS_20261030.gs');
 const start=original.indexOf('function doPost(e)');
 const body=original.slice(start,original.indexOf('\nfunction ',start+3));
 const secret=body.indexOf("if(!secret||!equal_(d.secret,secret))");
 const ops=body.indexOf('if(/^webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)$/.test(d.action))');
 const auth=body.indexOf("if(!/^MIO-W-[a-f0-9]{24}$/.test(d.participantId");
 assert.ok(secret>=0&&ops>secret&&auth>ops);
});
test('Web guide says to add a script and exposes copy of two dispatch lines only',()=>{
 const html=file('gacha-web-gate.html'),js=file('gacha-admin-ops.js');
 assert.match(html,/id="opsInstallGuide" hidden/);
 assert.match(html,/WebAdminOps\.gs/);
 assert.match(html,/GAS_WebAdminOps_20261030\.gs/);
 assert.match(html,/id="opsCopyDispatch"/);
 assert.match(html,/既存 Code\.gs/);
 assert.doesNotMatch(html,/GAS_Code_FULL_WEB_OPS_20261030\.gs/);
 assert.match(js,/opsCopyDispatch/);
 assert.match(js,/clipboard\.writeText\(dispatchCode\)/);
 assert.match(js,/mioAdminOps_\(SpreadsheetApp\.openById\(SHEET_ID\),d\)/);
});
test('read-only release gate remains unchanged',()=>{
 const api=file('api-gacha-admin-ops.js');
 assert.match(api,/d\.action!=='read'&&!writeEnabled/);
 assert.match(api,/authorizedCode\(d\.code/);
 assert.match(api,/sessionOK\(req\)/);
 assert.match(api,/GAS_UPDATE_REQUIRED/);
});
