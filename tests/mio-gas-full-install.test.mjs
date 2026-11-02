import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('single-file GAS contains all operational entrypoints and no duplicate doPost',()=>{
 const code=load('GAS_Code_FULL_WEB_OPS_20261030.gs');
 assert.equal((code.match(/function doPost\(/g)||[]).length,1);
 for(const name of ['mioAdminOps_','mioAdminOpsGrant_','mioAdminOpsRead_','gachaWebGateActionInline1030_','gachaAction_']){
  assert.equal(code.split('function '+name+'(').length-1,1,name);
 }
 assert.match(code,/LOGIN_ID_COL\s*=\s*21/);
});
test('current GAS deployment guidance requires live backup and incremental compatibility, never unverified full paste',()=>{
 const page=load('gacha-web-gate.html');
 const js=load('gacha-admin-ops.js');
 const guide=load('docs/MIO_GAS_SAFE_EXISTING_DEPLOYMENT_20261102.md');
 const legacy=load('docs/MIO_GAS_FULL_REPLACE_SETUP.md');
 assert.match(page,/MIO_GAS_SAFE_EXISTING_DEPLOYMENT_20261102[.]md/);
 assert.match(page,/既存Apps Scriptは、新規作成も全文置換も行いません/);
 assert.match(guide,/現在稼働している全ファイル/);
 assert.match(guide,/既存同一プロジェクト/);
 assert.match(guide,/既存デプロイ/);
 assert.match(guide,/同名19関数/);
 assert.match(guide,/既存.*doPost/);
 assert.match(guide,/書き込みを伴う作業は明示承認なしに実施しない/);
 assert.match(legacy,/廃止・実行禁止/);
 assert.match(legacy,/同一プロジェクト・同一デプロイ・同一URL/);
 assert.doesNotMatch(page,/統合版全文に置き換え|Code[.]gs全貼り付け手順を開く|全貼り付け（部分追加なし）/);
 assert.doesNotMatch(js,/opsCopyDispatch|dispatchCode/);
 assert.doesNotMatch(page,/<script[^>]+src="\/gacha-admin-ops[.]js"/);
});
test('the Web admin API remains read-only until explicit release',()=>{
 const s=load('api-gacha-admin-ops.js');
 assert.match(s,/d\.action!=='read'&&!writeEnabled/);
 assert.match(s,/authorizedCode\(d\.code/);
 assert.match(s,/sessionOK\(req\)/);
});
