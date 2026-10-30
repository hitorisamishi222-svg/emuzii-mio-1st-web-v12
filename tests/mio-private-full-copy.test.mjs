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
