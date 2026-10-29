import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const passkey=read('api-gallery-passkey.js');
const manager=read('museum-curate.html');
const admin=read('api-museum-exhibits.js');
const publicJS=read('museum-archive.js');
const deployment=JSON.parse(read('vercel.json'));

test('museum admin uses existing Secure HttpOnly gallery-scoped authentication, not an invented session',()=>{
 assert.match(passkey,/const COOKIE_OPTS='HttpOnly; Secure; SameSite=Strict; Path=\/api\/gallery'/);
 assert.match(admin,/cookie\(req,'mio_gallery_session'\)/);
 assert.match(admin,/cookie\(req,'mio_gallery_device'\)/);
 assert.match(admin,/u\.status='active'/);
 assert.match(admin,/d\.status='approved'/);
 assert.match(admin,/u\.role IN \('owner','admin'\)/);
 assert.match(admin,/if\(admin\.role!=='owner'\)/);
});
test('every owner-only API endpoint is under the gallery cookie path',()=>{
 const pair={
  '/api/gallery/museum/exhibits':'/api-museum-exhibits.js',
  '/api/gallery/museum/image':'/api-museum-image.js',
  '/api/gallery/museum/assets':'/api-museum-assets.js'
 };
 for(const [route,filename] of Object.entries(pair)){
  assert.ok(route.startsWith('/api/gallery/'));
  const matched=deployment.routes.filter(r=>r.src===route);
  assert.equal(matched.length,1,'missing or duplicate alias '+route);
  assert.equal(matched[0].dest,filename);
 }
 assert.match(manager,/fetch\('\/api\/gallery\/museum\/exhibits\?scope=admin'/);
 assert.match(manager,/let endpoint='\/api\/gallery\/museum\/exhibits'/);
 assert.match(manager,/endpoint='\/api\/gallery\/museum\/image'/);
 assert.match(manager,/const url='\/api\/gallery\/museum\/assets'/);
 assert.doesNotMatch(manager,/['"]\/api\/museum\/(?:image|assets|exhibits\?scope=admin)/);
});
test('public museum still uses cookie-free published-only API without owner privileges',()=>{
 assert.match(publicJS,/fetch\('\/api\/museum\/exhibits',\{credentials:'omit'/);
 const publicRoute=deployment.routes.find(r=>r.src==='/api/museum/exhibits');
 assert.equal(publicRoute.dest,'/api-museum-exhibits.js');
 assert.match(admin,/FROM museum_public_exhibits WHERE status='published'/);
 assert.match(admin,/if\(scope==='public'&&req\.method==='GET'&&!publishedOn\(\)\)/);
});
