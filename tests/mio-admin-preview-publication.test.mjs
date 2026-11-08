import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const html=readFileSync(new URL('../gacha-admin-preview.html',import.meta.url),'utf8');

test('admin offline preview is explicitly built as a static file',()=>{
 const matches=config.builds.filter(x=>x.src==='gacha-admin-preview.html');
 assert.deepEqual(matches,[{src:'gacha-admin-preview.html',use:'@vercel/static'}]);
});

test('admin offline preview route exists once before catch-all route',()=>{
 const routes=config.routes.filter(x=>x.src==='/gacha-admin-preview.html');
 assert.deepEqual(routes,[{src:'/gacha-admin-preview.html',dest:'/gacha-admin-preview.html'}]);
 const preview=config.routes.findIndex(x=>x.src==='/gacha-admin-preview.html');
 const catchall=config.routes.findIndex(x=>x.src==='/(.*)');
 assert.ok(preview>=0&&catchall>preview,'preview must not be hidden by catchall');
});

test('existing live registration, gacha and web gate destinations stay intact',()=>{
 for(const [src,dest] of [
  ['/api/register','/api-register.js'],
  ['/api/checkin','/api-checkin.js'],
  ['/api/gacha','/api-gacha.js'],
  ['/api/gacha-admin-ops','/api-gacha-admin-ops.js'],
  ['/gacha-web-gate.html','/gacha-web-gate.html'],
  ['/','/index.html'],
 ]){
  assert.equal(config.routes.filter(r=>r.src===src&&r.dest===dest).length,1,src);
 }
 for(const src of ['index.html','gacha.html','gacha-web-gate.html','gacha-admin-ops.js'])
  assert.equal(config.builds.filter(b=>b.src===src).length,1,src);
});

test('preview remains synthetic, read-only, noindex and no outgoing connections',()=>{
 assert.match(html,/<meta name="robots" content="noindex,nofollow">/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/form-action 'none'/);
 assert.match(html,/架空データ/);
 assert.match(html,/外部通信なし/);
 assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket\s*\(|EventSource\s*\(/);
 assert.doesNotMatch(html,/<script\b[^>]*\bsrc=/);
 const actionButtons=[...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)]
   .filter(m=>/\bclass="action"/.test(m[1]));
 assert.ok(actionButtons.length>=3);
 assert.ok(actionButtons.every(m=>/\bdisabled\b/.test(m[1])));
});
