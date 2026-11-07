import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {verifyMuseumPreviewOwnerSessionStage as verify} from '../museum-preview-owner-session-stage.mjs';

const HOST='emuzii-mio-1st-web-v12-4yagt5o6p-gtgz8867jh-3139.vercel.app';
const SHA='a'.repeat(40),PROJECT='prj_aBc123ZZ';
const USER='11111111-2222-4333-8444-555555555555';
const DEVICE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SESSION='s'.repeat(44),DEVICE_COOKIE='d'.repeat(44);
const metadata=()=>({
 deployment:{hostname:HOST,target:'preview',gitBranch:'feature/mio-v2-integration-mainbaseline-20261102',
  gitSha:SHA,projectId:PROJECT},
 expected:{hostname:HOST,gitSha:SHA,projectId:PROJECT}
});
const request=()=>({method:'POST',headers:{
 host:HOST,origin:'https://'+HOST,'content-type':'application/json; charset=utf-8',
 'sec-fetch-site':'same-origin','sec-fetch-mode':'cors',
 cookie:'mio_gallery_session='+SESSION+'; mio_gallery_device='+DEVICE_COOKIE
}});
const hash=x=>createHash('sha256').update(x).digest('hex');
const client=(rows=[{user_id:USER,role:'owner',device_id:DEVICE}],throws=false)=>({
 calls:[],async query(sql,args){
  this.calls.push({sql,args});
  if(throws)throw Error('isolated DB unavailable');
  return {rowCount:rows.length,rows};
 }});

test('same-origin exact Preview deployment can authenticate approved owner+device via existing session query',async()=>{
 const db=client(),res=await verify(db,request(),metadata());
 assert.equal(db.calls.length,1,'approved preview owner should reach exactly one legacy session query');
 assert.deepEqual(res,{ownerId:USER,deviceId:DEVICE,role:'owner'});
 assert.ok(Object.isFrozen(res));
 assert.equal(db.calls.length,1);
 assert.deepEqual(db.calls[0].args,[hash(SESSION),hash(DEVICE_COOKIE)]);
 assert.match(db.calls[0].sql,/JOIN gallery_admin_devices/);
 assert.match(db.calls[0].sql,/s\.revoked_at IS NULL/);
 assert.match(db.calls[0].sql,/s\.expires_at>now\(\)/);
 assert.match(db.calls[0].sql,/d\.status='approved'/);
 assert.match(db.calls[0].sql,/u\.status='active'/);
 assert.doesNotMatch(JSON.stringify(res),new RegExp(SESSION));
});
test('production and unrelated preview hosts fail before DB lookup',async()=>{
 for(const [hostname,origin] of [
  ['emuzii-mio-1st-web-v12.vercel.app','https://emuzii-mio-1st-web-v12.vercel.app'],
  ['evil-preview.vercel.app','https://evil-preview.vercel.app'],
  ['local.test','http://local.test'],
  ['emuzii-mio-1st-web-v12-evil.vercel.app','https://emuzii-mio-1st-web-v12-evil.vercel.app']
 ]){
  const db=client(),req=request();
  req.headers.host=hostname;req.headers.origin=origin;
  assert.equal(await verify(db,req,metadata()),null);
  assert.equal(db.calls.length,0);
 }
});
test('wrong Provider project/branch/SHA/target cannot use an approved owner cookie',async()=>{
 const cases=[
  o=>{o.deployment.target='production'},
  o=>{o.deployment.gitBranch='main'},
  o=>{o.deployment.projectId='prj_other'},
  o=>{o.expected.projectId='prj_fake'},
  o=>{o.deployment.gitSha='b'.repeat(40)},
  o=>{o.expected.gitSha='b'.repeat(40)},
  o=>{o.deployment.hostname='emuzii-mio-1st-web-v12-something.vercel.app'},
  o=>{o.expected.hostname='emuzii-mio-1st-web-v12-something.vercel.app'},
  o=>{o.deployment.hostname='emuzii-mio-1st-web-v12.vercel.app'}
 ];
 for(const mutate of cases){
  const d=metadata(),db=client();mutate(d);
  assert.equal(await verify(db,request(),d),null);
  assert.equal(db.calls.length,0);
 }
});
test('Host, Origin, forwarded host, method and fetch headers must be exactly same-origin POST JSON',async()=>{
 const bad=[
  r=>{r.method='GET'},
  r=>{r.method='PUT'},
  r=>{r.headers.origin='https://evil.example'},
  r=>{r.headers.origin='http://'+HOST},
  r=>{r.headers.origin='https://'+HOST+'/'},
  r=>{r.headers['x-forwarded-host']='evil.example'},
  r=>{r.headers['sec-fetch-site']='cross-site'},
  r=>{r.headers['sec-fetch-mode']='navigate'},
  r=>{r.headers['content-type']='text/plain'},
  r=>{r.headers['content-type']='multipart/form-data'},
  r=>{r.headers.host=[''+HOST]},
  r=>{r.headers.origin=null}
 ];
 for(const mutate of bad){
  const req=request(),db=client();mutate(req);
  assert.equal(await verify(db,req,metadata()),null);
  assert.equal(db.calls.length,0);
 }
});
test('missing host-local cookie or malformed device/session cannot reach DB',async()=>{
 const cookies=['','mio_gallery_session='+SESSION,
 'mio_gallery_session=foo; mio_gallery_device='+DEVICE_COOKIE,
 'mio_gallery_session='+SESSION+'; mio_gallery_device=bad',
 'mio_gallery_session='+SESSION+'; mio_gallery_device='+DEVICE_COOKIE+'X'.repeat(50)];
 for(const cookie of cookies){
  const req=request(),db=client();req.headers.cookie=cookie;
  assert.equal(await verify(db,req,metadata()),null);
  assert.equal(db.calls.length,0);
 }
});
test('revoked/expired session, unapproved device, and non-owner fail closed even with same origin',async()=>{
 for(const rows of [
  [],[{user_id:USER,role:'admin',device_id:DEVICE}],
  [{user_id:USER,role:'viewer',device_id:DEVICE}],
  [{user_id:'forged',role:'owner',device_id:DEVICE}],
  [{user_id:USER,role:'owner',device_id:'invalid-device'}]
 ]){
  assert.equal(await verify(client(rows),request(),metadata()),null);
 }
 const offline=client([],true);
 assert.equal(await verify(offline,request(),metadata()),null);
});
test('no production Origin override, credential echo or Vercel HTTP route introduced',()=>{
 const source=readFileSync(new URL('../museum-preview-owner-session-stage.mjs',import.meta.url),'utf8');
 const legacy=readFileSync(new URL('../gallery-auth-shared.js',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.match(legacy,/req\.headers\.host === 'emuzii-mio-1st-web-v12\.vercel\.app'/);
 assert.match(source,/verifyGalleryAdmin/);
 assert.doesNotMatch(source,/process\.env|console\.log|INSERT INTO|UPDATE |DELETE FROM|new Pool|export default|BLOB_READ_WRITE_TOKEN/);
 assert.equal(config.builds.some(x=>x.src==='museum-preview-owner-session-stage.mjs'),false);
 assert.equal(config.routes.some(x=>x.src?.includes('museum-preview-owner-session-stage')),false);
});
test('client or request missing; do not query database',async()=>{
 assert.equal(await verify(null,request(),metadata()),null);
 assert.equal(await verify({},request(),metadata()),null);
 const db=client();
 assert.equal(await verify(db,null,metadata()),null);
 assert.equal(await verify(db,request(),{}),null);
 assert.equal(db.calls.length,0);
});
