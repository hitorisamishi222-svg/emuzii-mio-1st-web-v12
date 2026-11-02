import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('museum-device-check.html');
const js=read('museum-device-check.js');
const routes=JSON.parse(read('vercel.json'));
test('local device check stays non-indexed and accessible from static museum preview',()=>{
 assert.match(html,/<meta name="robots" content="noindex,nofollow">/);
 assert.match(html,/<meta name="referrer" content="no-referrer">/);
 assert.match(html,/写真や結果は外部へ送信せず/);
 assert.match(read('museum.html'),/href="\/museum-device-check\.html"/);
 assert.match(html,/大型アップデート用/);
 assert.ok(routes.builds.some(x=>x.src==='museum-device-check.html'&&x.use==='@vercel/static'));
 assert.ok(routes.builds.some(x=>x.src==='museum-device-check.js'&&x.use==='@vercel/static'));
 assert.ok(routes.routes.some(x=>x.src==='/museum-device-check.html'));
 assert.ok(routes.routes.some(x=>x.src==='/museum-device-check.js'));
});
test('readiness UI has large controls, screen size detection and an optional photo tester',()=>{
 for(const id of ['runAuto','autoStatus','autoDetails','localPhoto','tryPhoto','photoStatus','photoPreview','clearPhoto','saveReport','reportStatus']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/button\{[^}]*min-height:50px/);
 assert.match(html,/input\[type=file\]\{[^}]*font-size:16px/);
 assert.match(html,/@media\(max-width:450px\)/);
 assert.match(js,/document\.documentElement\.scrollWidth/);
 assert.match(js,/window\.MioMuseumImage\.encode/);
 assert.match(js,/URL\.revokeObjectURL/);
 assert.doesNotThrow(()=>new Script(js));
});
test('photo check does not call public or administrative APIs',()=>{
 assert.doesNotMatch(js,/\bfetch\s*\(|\bXMLHttpRequest\b|sendBeacon|WebSocket|EventSource|\/api\//);
 assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB|document\.cookie/);
 assert.doesNotMatch(html,/<form\b|action="https?:|src="https?:/i);
 assert.match(js,/new File\(\[blob\]/);
 assert.match(js,/new Blob\(\[bytes\]/);
});
test('downloaded report excludes photo contents and persistent client identity',()=>{
 assert.match(js,/schema:'mio-museum-device-check-v1'/);
 assert.match(js,/browserTestOnly:true,serverUploadTested:false,realAdminLoginTested:false/);
 assert.match(js,/screen:report\.screen,synthetic:report\.synthetic,photo:report\.photo/);
 assert.doesNotMatch(js,/JSON\.stringify\((?:file|encoded|bytes|image|canvas)/);
 assert.doesNotMatch(js,/userAgent|fingerprint|deviceId|phoneNumber|email/);
 assert.match(js,/a\.download='mio-museum-device-check\.json'/);
});

test('privacy guard exports only fixed failure codes, never arbitrary browser errors or local filenames',()=>{
 const injected=js.replace(' const explain=e=>',
  ' window.__testSafeReason=safeReason;\\n const explain=e=>'.replace('\\n',String.fromCharCode(10)));
 assert.notEqual(injected,js,'test must execute the real privacy normalizer');
 const context={
  document:{getElementById(){return {files:[],addEventListener(){},disabled:false}}},
  window:{addEventListener(){}},
 };
 runInNewContext(injected,context);
 const safe=context.window.__testSafeReason;
 assert.equal(typeof safe,'function');
 assert.equal(safe(new Error('SOURCE_IMAGE_TOO_LARGE')),'SOURCE_IMAGE_TOO_LARGE');
 assert.equal(safe(new Error('/private/photo/IMG-12345.HEIC')),'UNKNOWN');
 assert.equal(safe(new Error('device key or auth token leaked')),'UNKNOWN');
 assert.equal(safe({message:'constructor'}),'UNKNOWN');
 assert.equal(safe(null),'UNKNOWN');
 assert.equal(js.split('reason:safeReason(e)').length-1,2);
 assert.equal(js.includes('reason:e?.message'),false);
});

test('preview Chrome screenshots for approved museum and archive are retained by active CI',()=>{
 const runner=read('tests/mio-staging-mobile-chromium.mjs');
 const action=read('.github/workflows/registration-tests.yml');
 for(const name of ['mio-museum-approved-gallery-390.png','mio-museum-archive-390.png']){
  assert.ok(runner.includes(name),'missing browser screenshot capture: '+name);
 }
 assert.ok(action.includes('artifacts/mio-museum-*.png'),'CI would drop museum screenshot evidence');
 assert.ok(action.includes('artifacts/mio-offline-mobile-*.png'),'CI would drop phone diagnostic evidence');
 assert.ok(action.includes("github.head_ref == 'feature/mio-v2-integration-mainbaseline-20261102'"),
  'browser fixture must remain scoped to staging branch');
});
