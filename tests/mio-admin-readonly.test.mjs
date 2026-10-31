import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
test('admin connection read is allowed before write release; mutations remain locked',()=>{
 const api=get('api-gacha-admin-ops.js');
 assert.match(api,/const writeEnabled=process\.env\.MIO_GACHA_ADMIN_OPS_RELEASE===RELEASE/);
 assert.match(api,/d\.action!=='read'&&!writeEnabled/);
 assert.match(api,/authorizedCode\(d\.code/);
 assert.match(api,/sessionOK\(req\)/);
 assert.match(api,/if\(d\.action!=='read'&&!writeEnabled\)[\s\S]*?return reply\(res,503/);
 assert.match(api,/json\(\{ok:true,writeEnabled,pending/);
});
test('all Web administrative mutation buttons stay disabled until release confirmed',()=>{
 const ui=get('gacha-admin-ops.js');
 assert.match(ui,/!readOnly&&!state\?\.writeEnabled/);
 assert.match(ui,/opsGrant'\)\.disabled=v\|\|!!pending\|\|!state\?\.writeEnabled/);
 assert.match(ui,/opsIntakeCreate'\)\.disabled=v\|\|!!pending\|\|!state\?\.writeEnabled/);
 assert.match(ui,/管理の書き込み|承認・回数付与はまだ停止中/);
});
test('read-only connection never changes existing draw or switch routes',()=>{
 const routes=JSON.parse(get('vercel.json')).routes;
 assert.equal(routes.find(x=>x.src==='/api/gacha')?.dest,'/api-gacha.js');
 assert.equal(routes.find(x=>x.src==='/api/gacha-web-gate')?.dest,'/api-gacha-web-gate.js');
 assert.equal(routes.find(x=>x.src==='/api/gacha-admin-ops')?.dest,'/api-gacha-admin-ops.js');
});
