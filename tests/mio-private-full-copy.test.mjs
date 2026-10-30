import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const from=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const path='private-docs/MIO_Code_FULL_COPY_WEB_ADMIN_20261030.html';
test('private HTML copying source is exactly the same as the full-paste GAS file',()=>{
 const html=from(path);
 const source=from('GAS_Code_FULL_WEB_OPS_20261030.gs');
 const match=html.match(/<textarea id="source"[^>]*>([\s\S]*?)<\/textarea>/);
 assert.ok(match,'textarea source is missing');
 const decoded=match[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 assert.equal(decoded,source);
 assert.equal(decoded.split('function doPost(').length-1,1);
 assert.equal(decoded.split('function mioAdminOpsGrant_(').length-1,1);
 assert.doesNotMatch(html,/id="code"/);
 assert.match(html,/clipboard\.writeText\(raw\)/);
 assert.match(html,/部分追加はしません/);
});
test('private clipboard helper must not be publicly deployed by Vercel',()=>{
 const cfg=JSON.parse(from('vercel.json'));
 assert.equal(cfg.builds.some(x=>x.src===path),false);
 assert.equal(cfg.routes.some(x=>String(x.src).includes('MIO_Code_FULL_COPY_WEB_ADMIN_20261030.html')),false);
});

test('Vercel public build allowlist cannot expose GAS source, private copy helper or backups',()=>{
 const cfg=JSON.parse(from('vercel.json'));
 const unsafe=/(?:^|\/)(?:private-docs|backups)(?:\/|$)|\.gs$|GAS_Code_FULL_WEB_OPS_20261030|MIO_Code_FULL_COPY_WEB_ADMIN_20261030/;
 for(const build of cfg.builds){
  assert.doesNotMatch(build.src,unsafe,'private source is not a public build: '+build.src);
  assert.doesNotMatch(build.src,/[?*{}]/,'glob builds could include GAS sources: '+build.src);
 }
 for(const route of cfg.routes){
  assert.doesNotMatch(route.dest||'',unsafe,'private file is not a deployed route: '+route.dest);
 }
 assert.ok(cfg.builds.some(b=>b.src==='gacha-web-gate.html'),'existing management screen remains published');
 assert.ok(cfg.builds.some(b=>b.src==='api-gacha-admin-ops.js'),'existing management API remains present');
});
test('admin mutations stay disabled unless deliberately released after GAS rollout',()=>{
 const api=from('api-gacha-admin-ops.js');
 assert.match(api,/const writeEnabled=process\.env\.MIO_GACHA_ADMIN_OPS_RELEASE===RELEASE/);
 assert.match(api,/d\.action!=='read'&&!writeEnabled/);
});
