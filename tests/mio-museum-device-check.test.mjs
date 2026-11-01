import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('museum-device-check.html');
const js=read('museum-device-check.js');
const routes=JSON.parse(read('vercel.json'));
test('local device check remains separate, non-indexed and accessible from curation',()=>{
 assert.match(html,/<meta name="robots" content="noindex,nofollow,noarchive">/);
 assert.match(html,/<meta name="referrer" content="no-referrer">/);
 assert.match(html,/写真や結果は外部へ送信せず/);
 assert.match(read('museum-curate.html'),/href="\/museum-device-check\.html"/);
 assert.match(read('robots.txt'),/Disallow: \/museum-device-check\.html/);
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
