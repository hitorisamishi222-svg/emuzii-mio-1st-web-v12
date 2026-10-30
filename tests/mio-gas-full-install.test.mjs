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
test('production guidance says full paste only and preserves existing GAS deployment',()=>{
 const page=load('gacha-web-gate.html');
 const js=load('gacha-admin-ops.js');
 const guide=load('docs/MIO_GAS_FULL_REPLACE_SETUP.md');
 assert.match(page,/GAS_Code_FULL_WEB_OPS_20261030\.gs/);
 assert.match(page,/全貼り付け（部分追加なし）/);
 assert.match(page,/統合版全文に置き換え/);
 assert.match(page,/新バージョン/);
 assert.doesNotMatch(page,/opsCopyDispatch|WebAdminOps\.gs|追加コード|追加2行/);
 assert.doesNotMatch(js,/opsCopyDispatch|dispatchCode/);
 assert.match(js,/Code\.gs全貼り付け手順を開く/);
 assert.match(guide,/全選択/);
 assert.match(guide,/既存Webアプリ/);
 assert.match(guide,/新規作成|新しいデプロイ/);
});
test('the Web admin API remains read-only until explicit release',()=>{
 const s=load('api-gacha-admin-ops.js');
 assert.match(s,/d\.action!=='read'&&!writeEnabled/);
 assert.match(s,/authorizedCode\(d\.code/);
 assert.match(s,/sessionOK\(req\)/);
});
