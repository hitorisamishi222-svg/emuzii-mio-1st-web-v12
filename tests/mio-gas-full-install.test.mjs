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
test('production guidance forbids obsolete GAS full paste and retains same existing deployment',()=>{
 const page=load('gacha-web-gate.html');
 const js=load('gacha-admin-ops.js');
 const guide=load('docs/MIO_GAS_FULL_REPLACE_SETUP.md');
 assert.match(page,/issues\/66/);
 assert.match(page,/現行のCode.gsを全文置換しないでください/);
 assert.match(page,/同じデプロイの新バージョン/);
 assert.doesNotMatch(page,/全貼り付け（部分追加なし）|統合版全文に置き換え/);
 assert.doesNotMatch(page,/opsCopyDispatch|WebAdminOps\.gs|追加コード|追加2行/);
 assert.doesNotMatch(js,/opsCopyDispatch|dispatchCode/);
 assert.match(js,/稼働GASの安全な照合手順を開く/);
 assert.match(guide,/廃止・実行禁止/);
 assert.match(guide,/19関数重複/);
 assert.match(guide,/既存の運用スプレッドシート/);
 assert.match(guide,/復元可能なバックアップ/);
 assert.match(guide,/別途オーナーの明示承認/);
});

test('the Web admin API remains read-only until explicit release',()=>{
 const s=load('api-gacha-admin-ops.js');
 assert.match(s,/d\.action!=='read'&&!writeEnabled/);
 assert.match(s,/authorizedCode\(d\.code/);
 assert.match(s,/sessionOK\(req\)/);
});
