import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyMuseumGalleryOwnerStage} from '../museum-gallery-owner-stage.mjs';

const origin='https://emuzii-mio-1st-web-v12.vercel.app';
const owner='11111111-2222-4333-8444-555555555555';
const deviceId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const secret='s'.repeat(44),device='d'.repeat(44);
const request=()=>({
 method:'POST',
 headers:{host:'emuzii-mio-1st-web-v12.vercel.app',origin,
  'content-type':'application/json; charset=utf-8',
  cookie:'mio_gallery_session='+secret+'; mio_gallery_device='+device}
});
const sha=x=>createHash('sha256').update(x).digest('hex');
const fake=(rows=[{user_id:owner,role:'owner',device_id:deviceId}])=>({
 hits:[],async query(sql,args){this.hits.push({sql,args});return {rowCount:rows.length,rows}}
});
test('stage owner preflight reuses the existing gallery admin session and approved-device query',async()=>{
 const c=fake(),result=await verifyMuseumGalleryOwnerStage(c,request());
 assert.deepEqual(result,{user_id:owner,role:'owner'});
 assert.equal(Object.isFrozen(result),true);
 assert.equal(c.hits.length,1);
 assert.match(c.hits[0].sql,/JOIN gallery_admin_devices/);
 assert.match(c.hits[0].sql,/d.status='approved'/);
 assert.match(c.hits[0].sql,/s.revoked_at IS NULL/);
 assert.match(c.hits[0].sql,/s.expires_at>now\(\)/);
 assert.deepEqual(c.hits[0].args,[sha(secret),sha(device)]);
 assert.equal(JSON.stringify(result).includes(secret),false);
});
test('missing cookies and malformed sessions do not reach database',async()=>{
 for(const cookie of ['', 'mio_gallery_session='+secret,
  'mio_gallery_session=BAD; mio_gallery_device='+device]){
  const c=fake(),req=request();req.headers.cookie=cookie;
  assert.equal(await verifyMuseumGalleryOwnerStage(c,req),null);
  assert.equal(c.hits.length,0);
 }
});
test('preview hosts and cross-site origin are rejected before session lookup',async()=>{
 for(const [host,requestOrigin] of [
  ['preview.vercel.app',origin],
  ['emuzii-mio-1st-web-v12.vercel.app','https://evil.example'],
  ['emuzii-mio-1st-web-v12.vercel.app',undefined]
 ]){
  const c=fake(),req=request();req.headers.host=host;req.headers.origin=requestOrigin;
  assert.equal(await verifyMuseumGalleryOwnerStage(c,req),null);
  assert.equal(c.hits.length,0);
 }
});
test('owner preflight requires POST JSON only',async()=>{
 for(const [method,contentType] of [
  ['GET','application/json'],['PUT','application/json'],['POST','text/plain']
 ]){
  const c=fake(),req=request();req.method=method;req.headers['content-type']=contentType;
  assert.equal(await verifyMuseumGalleryOwnerStage(c,req),null);
  assert.equal(c.hits.length,0);
 }
});
test('only owner with an approved device can proceed',async()=>{
 for(const rows of [
  [],
  [{user_id:owner,role:'admin',device_id:deviceId}],
  [{user_id:owner,role:'viewer',device_id:deviceId}],
  [{user_id:'bad',role:'owner',device_id:deviceId}],
  [{user_id:owner,role:'owner',device_id:'bad'}]
 ]){
  const c=fake(rows);
  assert.equal(await verifyMuseumGalleryOwnerStage(c,request()),null);
 }
});
test('no login cookie or personal record is exposed from the stage module',()=>{
 const txt=readFileSync(new URL('../museum-gallery-owner-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(txt,/export default|process\.env|console\.log|req\.body|INSERT INTO|UPDATE gallery_live_overrides/);
 assert.equal(config.builds.some(x=>x.src==='museum-gallery-owner-stage.mjs'),false);
 assert.equal(config.routes.some(x=>x.dest==='/museum-gallery-owner-stage.mjs'),false);
});
