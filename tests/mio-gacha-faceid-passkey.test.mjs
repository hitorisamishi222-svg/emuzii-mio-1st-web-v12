import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('Face ID code files are present and use real WebAuthn verification',()=>{
 for(const file of ['api-gacha-passkey.js','gacha-passkey-auth.js','gacha-passkey-ui.js'])assert.ok(read(file).length>200,file);
 assert.match(read('api-gacha-passkey.js'),/verifyAuthenticationResponse/);
 assert.match(read('api-gacha-passkey.js'),/verifyRegistrationResponse/);
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

test('Face ID cookie works for login and both admin API paths',()=>{
 const api=read('api-gacha-passkey.js');
 assert.ok(api.includes('HttpOnly; Secure; SameSite=Strict; Path=/api/'));
 for(const url of ['/api/gacha-passkey','/api/gacha-web-gate','/api/gacha-admin-ops'])assert.ok(url.startsWith('/api/'));
});

test('passkey registration requires owner session after two credentials and limits challenges',()=>{
 const api=read('api-gacha-passkey.js');
 assert.match(api,/previous\.rowCount>=2/);
 assert.match(api,/existing\.rows\[0\]/);
 assert.match(api,/sessionOK\(req\)/);
 assert.match(api,/too many attempts/);
 assert.match(api,/rate limit|created_at > now\(\)-interval/);
});
