import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {saveMuseumPreviewOwnerPrivateMediaStage as save}
 from '../museum-owner-private-media-composition-stage.mjs';

const HOST='emuzii-mio-1st-web-v12-4yagt5o6p-gtgz8867jh-3139.vercel.app';
const PROJECT='prj_ExampleOriginal123',SHA='a'.repeat(40);
const OWNER='11111111-2222-4333-8444-555555555555';
const DEVICE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const STORE='dedicatedprivate01';
const TOKEN='vercel_blob_rw_'+STORE+'_'+'S'.repeat(64);
const OP='0123456789abcdef0123456789abcdef';
const COOKIE='mio_gallery_session='+'s'.repeat(44)+'; mio_gallery_device='+'d'.repeat(44);
const url=name=>'https://'+STORE+'.private.blob.vercel-storage.com/'+name;
const validProof=()=>({
 providerStoreId:STORE,privateAccessVerified:true,previewOnlyVerified:true,
 isolatedFromExistingGallery:true,restorationDrillVerified:true,ownerApproved:true
});
const deployment=()=>({deployment:{hostname:HOST,projectId:PROJECT,gitSha:SHA,
 target:'preview',gitBranch:'feature/mio-v2-integration-mainbaseline-20261102'},
 expected:{hostname:HOST,projectId:PROJECT,gitSha:SHA}});
const req=()=>({method:'POST',headers:{host:HOST,origin:'https://'+HOST,
 'content-type':'application/json','sec-fetch-site':'same-origin',
 cookie:COOKIE}});
const image=async()=>{
 const data=await sharp({create:{width:18,height:12,channels:3,background:'#1b7fc9'}}).webp().toBuffer();
 return {base64:data.toString('base64'),bytes:data.length,width:18,height:12,format:'webp'};
};
const goodBinding=()=>({identityVerified:true,schemaReady:true,
 sourceReady:true,layoutReady:true,previewEnvScopeVerified:true,
 backupVerified:true,ownerApproved:true});
function fakeDB({role='owner',revokedAt=Infinity,failBinding=false,unexpectedRows=false}={}){
 const logs={connect:0,query:[],releases:[]};
 const pool={async connect(){
  logs.connect++;
  return {
   async query(sql,args){
    logs.query.push({sql,args});
    if(revokedAt<logs.query.length)return {rows:[],rowCount:0};
    return {rows:unexpectedRows?[]:[{user_id:OWNER,device_id:DEVICE,role}],rowCount:1};
   },release(error){logs.releases.push(error??null);}
  };
 }};
 const verifyBinding=async()=>failBinding?{...goodBinding(),backupVerified:false}:goodBinding();
 return {pool,verifyBinding,logs};
}
function fakePrivate(){
 const files=new Map(),logs={gets:[],puts:[]};
 const sdk={
  async get(pathname,options){
   logs.gets.push({pathname,options});
   const bytes=files.get(pathname);
   if(!bytes)return null;
   return {statusCode:200,
    blob:{pathname,url:url(pathname),contentType:'image/webp',size:bytes.length},
    stream:new ReadableStream({start(controller){
     controller.enqueue(new Uint8Array(bytes));controller.close();
    }})};
  },
  async put(pathname,bytes,options){
   logs.puts.push({pathname,options});
   if(files.has(pathname))throw Error('no overwrite');
   files.set(pathname,Buffer.from(bytes));
   return {pathname,url:url(pathname)};
  }
 };
 return {sdk,logs,files};
}
function setup(db=fakeDB(),priv=fakePrivate(),extra={}){
 return {payload:extra.payload,operationId:OP,
  request:extra.request||req(),storeId:extra.storeId||STORE,
  dedicatedToken:extra.dedicatedToken||TOKEN,
  verifyBinding:extra.verifyBinding||db.verifyBinding,
  getTrustedDeployment:extra.getTrustedDeployment||deployment,
  verifyDedicatedPrivateStore:extra.verifyDedicatedPrivateStore||validProof,
  pool:db.pool,sdk:priv.sdk};
}
// The composition takes (checked-out DB pool, server-only options), not a request body.
const run=({pool,...options})=>save(pool,options);

test('real pixel conversion + existing owner/approved device query + private Blob mock succeeds',async()=>{
 const db=fakeDB(),blob=fakePrivate();
 const result=await run({...setup(db,blob),payload:await image()});
 assert.equal(result.ok,true);assert.equal(result.privateOnly,true);
 assert.equal(result.replayed,false);
 assert.match(result.sha256,/^[a-f0-9]{64}$/);
 assert.equal(blob.logs.puts.length,1);
 assert.equal(blob.logs.gets.length,2);
 assert.equal(db.logs.connect,3,'auth must be rechecked after decode and before PUT');
 assert.equal(db.logs.query.length,3);
 assert.equal(db.logs.releases.length,3);
 assert.ok(db.logs.releases.every(x=>x===null));
 for(const line of db.logs.query){
  assert.match(line.sql,/JOIN gallery_admin_devices/);
  assert.match(line.sql,/s.revoked_at IS NULL/);
  assert.match(line.sql,/s.expires_at>now\(\)/);
  assert.match(line.sql,/d.status='approved'/);
  assert.deepEqual(line.args,[
   createHash('sha256').update('s'.repeat(44)).digest('hex'),
   createHash('sha256').update('d'.repeat(44)).digest('hex')
  ]);
 }
 assert.equal(blob.logs.puts[0].options.access,'private');
 assert.equal(blob.logs.puts[0].options.allowOverwrite,false);
 assert.equal(blob.logs.puts[0].options.token,TOKEN);
 assert.equal(blob.files.size,1);
 assert.ok([...blob.files.keys()][0].startsWith('museum-private/'+OWNER+'/'+OP));
 for(const secret of ['token','content','ownerId','pathname','url','deviceId'])
  assert.equal(Object.hasOwn(result,secret),false);
});
test('replaying same operation ID is read-only; SQL owner session verified again',async()=>{
 const db=fakeDB(),blob=fakePrivate(),payload=await image(),config=setup(db,blob);
 const first=await run({...config,payload});
 const replay=await run({...config,payload});
 assert.equal(first.replayed,false);assert.equal(replay.replayed,true);
 assert.equal(blob.logs.puts.length,1);
 assert.equal(blob.logs.gets.length,3);
 assert.equal(db.logs.query.length,5);
});
test('Preview owner session is required; production and third-party Origin cannot write',async()=>{
 for(const change of [
  r=>{r.headers.host='emuzii-mio-1st-web-v12.vercel.app'},
  r=>{r.headers.origin='https://evil.example'},
  r=>{r.headers.origin='https://emuzii-mio-1st-web-v12.vercel.app'},
  r=>{r.method='GET'},
  r=>{r.headers.cookie=''},
  r=>{r.headers['sec-fetch-site']='cross-site'}
 ]){
  const db=fakeDB(),blob=fakePrivate(),request=req();change(request);
  await assert.rejects(run({...setup(db,blob,{request}),payload:await image()}),
   /TRUSTED_SCOPE_UNVERIFIED/);
  assert.equal(blob.logs.puts.length,0);
  assert.equal(blob.logs.gets.length,0);
  assert.equal(db.logs.query.length,0);
 }
});
test('wrong branch, SHA and project fail even if cookie looks valid',async()=>{
 for(const modifier of [
  x=>{x.deployment.target='production'},
  x=>{x.deployment.gitBranch='main'},
  x=>{x.deployment.gitSha='b'.repeat(40)},
  x=>{x.expected.projectId='prj_Fake123'},
  x=>{x.expected.hostname='emuzii-mio-1st-web-v12-evil.vercel.app'}
 ]){
  const db=fakeDB(),blob=fakePrivate();
  await assert.rejects(run({...setup(db,blob,{getTrustedDeployment:()=>{const x=deployment();modifier(x);return x;}}),
   payload:await image()}),/TRUSTED_SCOPE_UNVERIFIED/);
  assert.equal(blob.logs.puts.length,0);
  assert.equal(db.logs.query.length,0);
 }
});
test('non-owner and revoked device sessions block both read and put',async()=>{
 for(const db of [fakeDB({role:'admin'}),fakeDB({revokedAt:0}),fakeDB({unexpectedRows:true})]){
  const blob=fakePrivate();
  await assert.rejects(run({...setup(db,blob),payload:await image()}),
   /TRUSTED_SCOPE_UNVERIFIED/);
  assert.equal(blob.logs.puts.length,0);
  assert.equal(blob.logs.gets.length,0);
 }
});
test('owner/device revoked while image decoding or before first PUT: no write',async()=>{
 for(const revokedAt of [1,2]){
  const db=fakeDB({revokedAt}),blob=fakePrivate();
  await assert.rejects(run({...setup(db,blob),payload:await image()}),
   /TRUSTED_SCOPE_UNVERIFIED/);
  assert.equal(blob.logs.puts.length,0);
  assert.equal(blob.logs.gets.length,revokedAt===1?0:1);
 }
});
test('isolated DB backup/schema not verified: no authentication query or Blob call',async()=>{
 const db=fakeDB({failBinding:true}),blob=fakePrivate();
 await assert.rejects(run({...setup(db,blob),payload:await image()}),
  /TRUSTED_SCOPE_UNVERIFIED/);
 assert.equal(db.logs.query.length,0);
 assert.equal(blob.logs.puts.length,0);
 assert.equal(blob.logs.gets.length,0);
});
test('private provider proof missing one protection: no Blob read/write',async()=>{
 const keys=['privateAccessVerified','previewOnlyVerified','isolatedFromExistingGallery',
  'restorationDrillVerified','ownerApproved'];
 for(const key of keys){
  const db=fakeDB(),blob=fakePrivate();
  await assert.rejects(run({...setup(db,blob,{verifyDedicatedPrivateStore:()=>({...validProof(),[key]:false})}),
   payload:await image()}),/TRUSTED_SCOPE_UNVERIFIED/);
  assert.equal(db.logs.query.length,1);
  assert.equal(blob.logs.puts.length+blob.logs.gets.length,0);
 }
});
test('token-embedded store ID must agree even when owner and provider are apparently verified',async()=>{
 const db=fakeDB(),blob=fakePrivate();
 await assert.rejects(run({...setup(db,blob,{dedicatedToken:'vercel_blob_rw_otherstore001_'+'T'.repeat(64)}),
  payload:await image()}),/DEDICATED_TOKEN_STORE_MISMATCH/);
 assert.equal(db.logs.connect,0);
 assert.equal(blob.logs.puts.length+blob.logs.gets.length,0);
});
test('server-only callback dependencies required, no arbitrary body-supplied approved flags',async()=>{
 const db=fakeDB(),blob=fakePrivate(),payload=await image();
 for(const omit of ['verifyBinding','getTrustedDeployment','verifyDedicatedPrivateStore']){
  const config=setup(db,blob);config[omit]=undefined;
  await assert.rejects(run({...config,payload}),/SERVER_DEPENDENCIES_REQUIRED/);
 }
 assert.equal(db.logs.connect,0);
 assert.equal(blob.logs.puts.length,0);
});
test('unrouted source keeps production Origin and shared DB URL untouched',()=>{
 const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
 const code=read('museum-owner-private-media-composition-stage.mjs');
 const preview=read('museum-preview-owner-session-stage.mjs');
 const old=read('gallery-auth-shared.js');
 const vercel=JSON.parse(read('vercel.json'));
 assert.equal(vercel.builds.some(x=>x.src==='museum-owner-private-media-composition-stage.mjs'),false);
 assert.equal(vercel.routes.some(x=>x.src?.includes('museum-owner-private-media')),false);
 assert.match(old,/req\.headers\.host === 'emuzii-mio-1st-web-v12\.vercel\.app'/);
 assert.match(code,/verifyMuseumPreviewOwnerSessionStage/);
 assert.match(code,/withDedicatedMuseumStageClient/);
 assert.match(code,/storeAndVerifyMuseumPrivateBlobStage/);
 assert.match(preview,/verifyGalleryAdmin/);
 assert.doesNotMatch(code,/process\.env|new Pool|\/api\/|export default|process\\.env\\.BLOB_READ_WRITE_TOKEN|GAS|UPDATE |INSERT INTO |DELETE FROM /);
});
