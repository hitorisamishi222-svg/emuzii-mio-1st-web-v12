import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
test('old GAS is diagnosed only for authenticated Web admin read',()=>{
 const s=load('api-gacha-admin-ops.js');
 assert.match(s,/authorizedCode\(d\.code/);
 assert.match(s,/sessionOK\(req\)/);
 assert.match(s,/d\.action==='read'&&\/invalid identity/);
 assert.match(s,/code:'GAS_UPDATE_REQUIRED'/);
 assert.match(s,/d\.action!=='read'&&!writeEnabled/);
});
test('safe guidance stays accessible but no unauthorized admin or GAS changes are available',()=>{
 const html=load('gacha-web-gate.html'),js=load('gacha-admin-ops.js');
 const panel=html.split('<!-- MIO_ADMIN_PREVIEW_START -->')[1]?.split('<!-- MIO_ADMIN_PREVIEW_END -->')[0];
 assert.ok(panel,'Dedicated pending admin UI must exist');
 assert.match(panel,/管理者データとの接続停止中・書き込み停止中/);
 assert.match(panel,/既存GASを壊さない接続手順/);
 assert.match(panel,/MIO_GAS_SAFE_EXISTING_DEPLOYMENT_20261102[.]md/);
 for(const id of ['opsReload','opsGrant','opsIntakeCreate']){
  assert.match(panel,new RegExp('<button[^>]+id="'+id+'"[^>]+\\bdisabled\\b'));
 }
 assert.doesNotMatch(html,/<script[^>]+src="\/gacha-admin-ops[.]js"/,'do not start management writes');
 assert.doesNotMatch(panel,/Code[.]gs全貼り付け手順を開く|全貼り付け（部分追加なし）/);
 assert.match(js,/error\.code=json\.code/,'admin future error classification remains wired in archived module');
});
test('original gacha switch remains wired; write gate remains closed',()=>{
 const config=JSON.parse(load('vercel.json'));
 assert.equal(config.routes.find(x=>x.src==='/api/gacha')?.dest,'/api-gacha.js');
 assert.equal(config.routes.find(x=>x.src==='/api/gacha-web-gate')?.dest,'/api-gacha-web-gate.js');
 assert.match(load('gacha-web-gate.html'),/id="normal"/);
 assert.match(load('gacha-web-gate.html'),/id="fest"/);
});

test('unauthenticated safe guide cannot expose keys, load admin writes or modify operational APIs',()=>{
 const html=load('gacha-web-gate.html');
 const guide=load('docs/MIO_GAS_SAFE_EXISTING_DEPLOYMENT_20261102.md');
 const deprecated=load('docs/MIO_GAS_FULL_REPLACE_SETUP.md');
 assert.match(html,/既存GASを壊さない接続手順/);
 assert.match(guide,/バックアップ/);
 assert.match(guide,/同名19関数/);
 assert.match(guide,/既存デプロイ/);
 assert.match(guide,/書き込みを伴う作業は明示承認なしに実施しない/);
 assert.match(deprecated,/廃止・実行禁止/);
 assert.doesNotMatch(deprecated,/先頭から末尾まで全文コピー|全選択 → 全文貼り替え/);
 assert.doesNotMatch(html,/MIO_GACHA_WEB_KEY_SHA256\s*=|APPS_SCRIPT_SECRET\s*=/);
 const api=load('api-gacha-admin-ops.js');
 assert.match(api,/authorizedCode\(d\.code/);
 assert.match(api,/sessionOK\(req\)/);
 assert.match(api,/d\.action!=='read'&&!writeEnabled/);
});

