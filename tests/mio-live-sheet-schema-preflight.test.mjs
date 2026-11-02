import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const live=JSON.parse(read('tests/fixtures/mio-live-sheet-schema-readonly-20261102.json'));
const candidate=read('GAS_WebAdminOps_20261030.gs');
const fullCandidate=read('GAS_Code_FULL_WEB_OPS_20261030.gs');
const api=read('api-gacha-admin-ops.js');
const gate=read('gacha-web-gate.html');

test('observed live header-only snapshot matches existing core web/login and gacha positions',()=>{
 assert.equal(live.kind,'READ_ONLY_LIVE_HEADER_SNAPSHOT');
 assert.equal(live.verifiedHeaders['emuzii_Web登録'].columns,21);
 assert.equal(live.verifiedHeaders['emuzii_Web登録'].at21,'ログインID');
 assert.equal(live.verifiedHeaders['emuzii_ガチャ'].columns,17);
 assert.equal(live.verifiedHeaders['emuzii_ガチャ'].at15,'特別付与');
 assert.equal(live.verifiedHeaders['emuzii_新規簡易登録'].at5,'管理確認');
 assert.match(fullCandidate,/LOGIN_ID_COL\s*=\s*21/);
 assert.match(candidate,/mioAdminOpsValues_\(web,21\)/);
 assert.match(candidate,/mioAdminOpsValues_\(gacha,17\)/);
});

test('write-specific audit tab and grant operation-ID header are NOT present in the live observed schema',()=>{
 assert.equal(live.tabPresence['emuzii_Web管理操作履歴'],false);
 assert.equal(live.requiredForWebAdminWrites.auditTab.observed,false);
 const grants=live.verifiedHeaders['emuzii_ガチャ付与履歴'];
 assert.equal(grants.columns,9);
 assert.equal(grants.at10,null);
 assert.equal(live.requiredForWebAdminWrites.grantOperationColumn.column,'J');
 assert.equal(live.requiredForWebAdminWrites.grantOperationColumn.expectedHeader,'Web操作ID');
 // Candidate would mutate both the audit tab and the grant sheet J header.
 assert.match(candidate,/insertSheet\('emuzii_Web管理操作履歴'\)/);
 assert.match(candidate,/getRange\(1,10\)\.setValue\('Web操作ID'\)/);
 assert.equal(live.adminWriteRelease,'BLOCKED');
});

test('the candidate Web-admin read action has no Sheet write, create, delete or setup operations',()=>{
 const begin=candidate.indexOf('function mioAdminOpsRead_(');
 const end=candidate.indexOf('function mioAdminOpsRequest_(',begin);
 assert.ok(begin>0 && end>begin);
 const functionText=candidate.slice(begin,end);
 assert.doesNotMatch(functionText,/\b(?:setValues?|insertSheet|deleteSheet|appendRow|clearContent|flush|setup)\s*\(/);
 assert.match(functionText,/mioAdminOpsSummary_\(ss,all\)/);
 assert.match(functionText,/result\.grants=/);
});

test('actual Web-admin API and unconnected preview still block all unverified management mutations',()=>{
 assert.match(api,/const writeEnabled=process\.env\.MIO_GACHA_ADMIN_OPS_RELEASE===RELEASE/);
 assert.match(api,/d\.action!=='read'&&!writeEnabled/);
 assert.match(api,/authorizedCode\(d\.code/);
 assert.match(api,/sessionOK\(req\)/);
 assert.doesNotMatch(gate,/<script[^>]+src="\/gacha-admin-ops[.]js"/);
 for(const [name,isVerified] of Object.entries(live.requiredForWebAdminWrites)){
  assert.ok(isVerified && typeof isVerified==='object' ?
   Object.values(isVerified).includes(false)||Object.values(isVerified).includes(null):
   isVerified===false,'Unreviewed write prerequisite unexpectedly approved: '+name);
 }
});
