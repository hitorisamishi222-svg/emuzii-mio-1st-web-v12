import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pages=['museum.html','mio-profile.html','museum-archive.html'];
test('museum, profile and archive are navigable from the existing upgrade copy',()=>{
 const home=read('next-preview.html');
 assert.match(home,/href="\/museum\.html"/);
 assert.match(read('museum.html'),/href="\/mio-profile\.html"/);
 assert.match(read('museum.html'),/href="\/museum-archive\.html/);
 assert.match(read('museum-archive.html'),/href="\/museum\.html"/);
});
test('all museum preview pages are visibly identified as offline, non-indexable demos',()=>{
 for(const p of pages){
  const html=read(p);
  assert.match(html,/<meta name="robots" content="noindex,nofollow">/,p);
  assert.match(html,/大型アップデート用の画面見本/,p);
  assert.doesNotMatch(html,/<link rel="canonical"/,p);
  assert.doesNotMatch(html,/property="og:url"/,p);
  assert.doesNotMatch(html,/href="\/gallery\.html"|href="\/announcements\.html"/,p);
 }
});
test('copy museum scripts cannot access production API, cookies or persist visitor state',()=>{
 for(const path of ['museum-archive.js','museum-news.js']){
  const js=read(path);
  assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage|sessionStorage|navigator\.serviceWorker/,path);
  assert.doesNotMatch(js,/\/api\//,path);
  assert.doesNotMatch(js,/innerHTML\s*=/,path);
 }
 assert.match(read('museum-archive.js'),/render\(\);/);
});
test('current replica build is static and excludes production participant and draw APIs',()=>{
 const build=read('build-preview.sh');
 const cfg=JSON.parse(read('vercel.json'));
 assert.equal(cfg.buildCommand,'bash ./build-preview.sh');
 assert.equal(cfg.outputDirectory,'public');
 assert.match(build,/! -name 'api-\*\.js'/);
 assert.match(build,/! -name 'bridge\.js'/);
 assert.match(build,/test ! -e public\/gacha\.html/);
 assert.match(build,/test ! -e public\/index\.html/);
 assert.match(build,/test ! -e public\/bridge\.js/);
 for(const p of pages)assert.ok(/\.html$/.test(p));
});
