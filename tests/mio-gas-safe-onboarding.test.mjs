import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('gacha-web-gate.html');
const guide=read('docs/MIO_GAS_SAFE_EXISTING_DEPLOYMENT_20261102.md');
const panel=html.split('<!-- MIO_ADMIN_PREVIEW_START -->')[1]?.split('<!-- MIO_ADMIN_PREVIEW_END -->')[0];
test('previewed admin center has clear STOP state and safe read-only setup guidance',()=>{
 assert.ok(panel,'new admin panel must be explicitly bounded');
 assert.match(panel,/書き込み停止中/);
 assert.match(panel,/稼働版をバックアップ/);
 assert.match(panel,/既存GASを壊さない接続手順/);
 assert.match(panel,/MIO_GAS_SAFE_EXISTING_DEPLOYMENT_20261102[.]md/);
 assert.doesNotMatch(panel,/全貼り付け（部分追加なし）|Code[.]gs全貼り付け手順を開く|統合版全文に置き換え/);
});
test('safe guide requires real GAS backup, collision checks and original deployment before write',()=>{
 for(const phrase of ['バックアップ','doPost','19関数','既存デプロイ','新規GASプロジェクト','MIO_GACHA_ADMIN_OPS_RELEASE','稼働版','STOP']){
  assert.ok(guide.includes(phrase),'Missing protective instruction: '+phrase);
 }
 assert.match(guide,/書き込みを伴う作業は明示承認なしに実施しない/);
 assert.match(guide,/既存同一プロジェクト/);
});
test('staging does not load admin mutation script or expose tokens to unauthenticated visitors',()=>{
 assert.doesNotMatch(html,/<script[^>]+src="\/gacha-admin-ops[.]js"/);
 assert.doesNotMatch(panel,/APPS_SCRIPT_SECRET\s*=|MIO_GACHA_WEB_KEY_SHA256\s*=/);
 assert.doesNotMatch(panel,/<form|on[a-z]+\s*=/);
 for(const id of ['opsGrant','opsIntakeCreate']){
  assert.match(panel,new RegExp('<button[^>]*id="'+id+'"[^>]*\\bdisabled\\b'));
 }
});
