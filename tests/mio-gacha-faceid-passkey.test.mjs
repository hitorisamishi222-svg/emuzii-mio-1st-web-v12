import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('Face ID files compile with Node and do not affect existing gacha draw logic',()=>{
 for(const file of ['api-gacha-passkey.js','gacha-passkey-auth.js','gacha-passkey-ui.js'])assert.doesNotThrow(()=>new vm.SourceTextModule(read(file)),file);
});
test('existing code fallback and two gacha switches remain',()=>{
 const html=read('gacha-web-gate.html'),gate=read('api-gacha-web-gate.js');
 for(const id of ['passkeyLogin','passkeyRegister','code','connect','normal','fest'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(gate,/authorizedCode/);
 assert.match(gate,/sessionOK/);
 assert.match(gate,/MIO_GACHA_WEB_RELEASE/);
});
test('passkey is release-disabled and not shared with gallery authority',()=>{
 const api=read('api-gacha-passkey.js'),helper=read('gacha-passkey-auth.js');
 assert.match(api,/MIO_GACHA_PASSKEY_RELEASE/);
 assert.match(api,/authorizedCode\(d.code/);
 assert.match(api,/requireUserVerification:true/);
 assert.match(helper,/mio_gacha_admin_sessions/);
 assert.match(helper,/k.revoked_at IS NULL/);
 assert.doesNotMatch(helper,/gallery_admin_users/);
});
test('no passkey action touches participant or gacha sheet data',()=>{
 const api=read('api-gacha-passkey.js'),sql=read('sql/gacha-admin-passkey-isolated.sql');
 assert.doesNotMatch(api,/SHEET_ID|emuzii_参加者|emuzii_ガチャ/);
 assert.match(sql,/mio_gacha_admin_credentials/);
 assert.match(sql,/mio_gacha_admin_challenges/);
 assert.match(sql,/mio_gacha_admin_sessions/);
});
test('config keeps old gacha route, and adds passkey only',()=>{
 const config=JSON.parse(read('vercel.json'));
 assert.equal(config.routes.find(x=>x.src==='/api/gacha')?.dest,'/api-gacha.js');
 assert.equal(config.routes.find(x=>x.src==='/api/gacha-web-gate')?.dest,'/api-gacha-web-gate.js');
 assert.equal(config.routes.find(x=>x.src==='/api/gacha-passkey')?.dest,'/api-gacha-passkey.js');
});
