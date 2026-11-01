// Upgrade gate: old participant features must remain routable and protected.
// This runs in the error-fix branch, never contacts live GAS/DB or performs draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const config=JSON.parse(read('vercel.json'));
const route=src=>config.routes.find(x=>x.src===src);
const build=src=>config.builds.find(x=>x.src===src);
const matrix=[
 ['/api/gacha','api-gacha.js'],
 ['/api/status','api-status.js'],
 ['/api/checkin','api-checkin.js'],
 ['/api/activate-attendance','api-activate-attendance.js'],
 ['/api/gallery/items','api-gallery-items.js'],
 ['/api/gallery/session','api-gallery-session.js'],
 ['/api/gallery/manage','api-gallery-manage.js'],
 ['/api/gallery/moderate','api-gallery-moderate.js'],
 ['/api/gallery/publish','api-gallery-publish.js'],
 ['/api/gallery/thumbnail','api-gallery-thumbnail.js'],
 ['/api/gallery/passkey','api-gallery-passkey.js'],
 ['/api/gallery/capabilities','api-gallery-capabilities.js'],
 ['/api/gacha-web-gate','api-gacha-web-gate.js'],
 ['/api/gacha-admin-ops','api-gacha-admin-ops.js']
];
test('upgrade candidate retains existing attendance, gacha, gallery and admin endpoints',()=>{
 const paths=config.routes.map(x=>x.src);
 assert.equal(new Set(paths).size,paths.length,'duplicate routes can mask older features');
 for(const [url,file] of matrix){
  assert.equal(route(url)?.dest,'/'+file,url);
  assert.equal(build(file)?.use,'@vercel/node',file);
 }
});
test('all routed APIs keep explicitly declared server builds, avoiding silent 404 fallthrough',()=>{
 for(const entry of config.routes.filter(x=>x.src.startsWith('/api/'))){
  const target=entry.dest.slice(1);
  assert.equal(build(target)?.use,'@vercel/node',entry.src+' -> '+target);
 }
});
test('existing pages and gallery assets continue to be routed in upgrade candidate',()=>{
 for(const page of ['gacha.html','gallery.html','gacha-web-gate.html']){
  assert.equal(route('/'+page)?.dest,'/'+page);
  assert.equal(build(page)?.use,'@vercel/static');
 }
 for(const asset of ['gacha-deluxe-v21.js','gacha-deluxe-v21.css',
   'gacha-prize-demo-catalog.json','assets/mio-undersea-palace-stage.svg']){
  assert.equal(build(asset)?.use,'@vercel/static',asset);
 }
});
test('attendance is still tied to signed participant session and GAS ID',()=>{
 const code=read('api-checkin.js');
 assert.match(code,/readSession\(req.headers.cookie,cfg.secret\)/);
 assert.match(code,/if\(!s\)return res.status\(401\)/);
 assert.match(code,/bridge\('checkin',\{participantId:s.id,tokenHash:hash\(s.token\)/);
 assert.match(code,/if\(d.participantId!==s.id\)throw/);
 assert.doesNotMatch(code,/MIO_EVENT_EMAIL|mio_event_passes|inviteCode/);
});
test('light registration cannot activate real attendance from a name or email alone',()=>{
 const code=read('api-activate-attendance.js');
 assert.match(code,/MIO_ATTENDANCE_ACTIVATION/);
 assert.match(code,/verifyAttendanceIntegration\(/);
 assert.match(code,/bridge\('status',\{participantId:session.id,tokenHash\}/);
 assert.doesNotMatch(code,/MIO_EVENT_EMAIL|mio_event_passes/);
});
test('fan-art gallery page remains public read-only; admin links require backend authorization',()=>{
 const html=read('gallery.html');
 const items=read('api-gallery-items.js');
 assert.match(html,/\/api\/gallery\/items/);
 assert.match(html,/\/api\/gallery\/moderate/);
 assert.match(html,/authorizedDevice===true/);
 assert.match(items,/GALLERY_DATABASE_URL/);
 assert.match(items,/no-store/);
});
test('gallery write requires a distinct authorized owner and approved device',()=>{
 const manage=read('api-gallery-manage.js');
 const session=read('api-gallery-session.js');
 assert.match(manage,/verifyGalleryAdmin/);
 assert.match(manage,/checkOrigin/);
 assert.match(session,/mio_gallery_device/);
 assert.match(session,/mio_gallery_session/);
 assert.match(session,/SameSite=Strict/);
});
test('gallery publish endpoint explicitly refuses unfinished publishing instead of granting anonymous upload',()=>{
 const publish=read('api-gallery-publish.js');
 assert.match(publish,/GALLERY_ADMIN_NOT_CONFIGURED/);
 assert.match(publish,/return res.status\(503\)/);
 assert.doesNotMatch(publish,/MailApp|mio_event_passes|mio_session/);
});
test('existing gallery moderation still uses admin credentials not participant email token',()=>{
 const mod=read('api-gallery-moderate.js');
 assert.match(mod,/mio_gallery_session/);
 assert.match(mod,/mio_gallery_device/);
 assert.doesNotMatch(mod,/__Host-mio_event_email|MIO_EVENT_EMAIL_SESSION_SECRET/);
});
