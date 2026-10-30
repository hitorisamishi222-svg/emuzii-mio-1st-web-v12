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
test('guide stays hidden until old GAS response, does not leak user data',()=>{
 const html=load('gacha-web-gate.html'),js=load('gacha-admin-ops.js');
 assert.match(html,/id="opsInstallGuide" hidden/);
 assert.match(html,/blob\/main\/GAS_Code_FULL_WEB_OPS_20261030\.gs/);
 assert.match(html,/デプロイを管理/);
 assert.match(js,/e\.code!=='GAS_UPDATE_REQUIRED'/);
 assert.match(js,/error\.code=json\.code/);
});
test('original gacha switch remains wired; write gate remains closed',()=>{
 const config=JSON.parse(load('vercel.json'));
 assert.equal(config.routes.find(x=>x.src==='/api/gacha')?.dest,'/api-gacha.js');
 assert.equal(config.routes.find(x=>x.src==='/api/gacha-web-gate')?.dest,'/api-gacha-web-gate.js');
 assert.match(load('gacha-web-gate.html'),/id="normal"/);
 assert.match(load('gacha-web-gate.html'),/id="fest"/);
});
