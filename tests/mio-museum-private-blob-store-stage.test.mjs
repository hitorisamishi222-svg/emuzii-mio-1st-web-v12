import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {storeAndVerifyMuseumPrivateBlobStage as store} from '../museum-private-blob-write-readback-stage.mjs';

const path=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const OWNER='11111111-2222-4333-8444-555555555555';
const STORE='stagemuseumprivate001';
const TOKEN='T'.repeat(64);
const OP='0123456789abcdef0123456789abcdef';
const OP2='abcdef0123456789abcdef0123456789';
const p=op=>'museum-private/'+OWNER+'/'+op+'.webp';
const url=(pathname,id=STORE,access='private')=>'https://'+id+'.'+access+'.blob.vercel-storage.com/'+pathname;
const permission=()=>({
 ownerId:OWNER,dedicatedStoreId:STORE,ownerAuthenticated:true,
 approvedDeviceAuthenticated:true,previewBindingVerified:true,
 dedicatedPrivateStoreVerified:true,isolatedDatabaseVerified:true,
 backupRestorationVerified:true,ownerApproved:true
});
const source=async(color='#3a71b2')=>{
 const image=await sharp({create:{width:24,height:16,channels:4,background:color}})
  .webp({quality:85}).toBuffer();
 return {base64:image.toString('base64'),format:'webp',bytes:image.length,width:24,height:16};
};
function fakeStore(options={}){
 const files=new Map(),calls={gets:[],puts:[]};
 let denied=!!options.getDenied,ackLost=!!options.ackLost,corrupt=!!options.corrupt;
 const sdk={
  async get(pathname,opts){
   calls.gets.push({pathname,opts});
   if(denied)throw Error('no authorization');
   const content=files.get(pathname);
   if(!content)return null;
   const copied=Buffer.from(content);
   if(corrupt)copied[copied.length-1]^=0xff;
   const meta={url:url(pathname,options.getStoreId||STORE,
       options.publicRead?'public':'private'),
    pathname:options.wrongReadPath?'wrong/file.webp':pathname,
    contentType:options.wrongMime?'text/html':'image/webp',
    size:options.invalidSize?999999:copied.length};
   const body=options.overlongStream?Buffer.alloc(700_001):copied;
   return {statusCode:200,blob:meta,stream:new ReadableStream({
    start(controller){
     controller.enqueue(new Uint8Array(body));
     controller.close();
    }
   })};
  },
  async put(pathname,buf,opts){
   calls.puts.push({pathname,buffer:Buffer.from(buf),opts});
   if(options.rejectWrite)throw Error('temporary error');
   if(files.has(pathname))throw Error('already exists');
   files.set(pathname,Buffer.from(buf));
   if(ackLost)throw Error('connection dropped after upload');
   return {pathname,url:url(pathname,options.publicWrite?'ignored':'private'==='private'?STORE:STORE,options.publicWrite?'public':'private')};
  }
 };
 return {sdk,files,calls,setDenied:x=>{denied=x;},setAckLost:x=>{ackLost=x;},
  setCorrupt:x=>{corrupt=x;}};
}
const doSave=async(storage,details={})=>store({
 payload:details.payload||await source(),operationId:details.operationId||OP,
 verifyTrustedScope:details.verifyTrustedScope||(()=>permission()),storeId:details.storeId||STORE,
 dedicatedToken:details.dedicatedToken||TOKEN,sdk:storage.sdk
});

test('real JPEG/WebP-safe private pipeline writes transformed WebP, verifies readback and exposes no key',async()=>{
 const db=fakeStore(),result=await doSave(db);
 assert.equal(result.ok,true);
 assert.equal(result.privateOnly,true);
 assert.equal(result.replayed,false);
 assert.equal(typeof result.sha256,'string');
 assert.equal(result.sha256.length,64);
 assert.equal(result.bytes,db.files.get(p(OP)).length);
 assert.ok(result.bytes<=700000);
 for(const name of ['url','pathname','token','storeId','content','published','ownerId'])
  assert.equal(Object.hasOwn(result,name),false);
 assert.equal(db.calls.puts.length,1);
 assert.equal(db.calls.gets.length,2);
 const {pathname,opts,buffer}=db.calls.puts[0];
 assert.equal(pathname,p(OP));
 assert.equal(opts.access,'private');
 assert.equal(opts.storeId,STORE);
 assert.equal(opts.token,TOKEN);
 assert.equal(opts.allowOverwrite,false);
 assert.equal(opts.addRandomSuffix,false);
 assert.equal(opts.maximumSizeInBytes,700000);
 assert.equal(opts.contentType,'image/webp');
 assert.equal((await sharp(buffer).metadata()).format,'webp');
 for(const call of db.calls.gets){
  assert.equal(call.opts.access,'private');
  assert.equal(call.opts.storeId,STORE);
  assert.equal(call.opts.token,TOKEN);
  assert.equal(call.opts.useCache,false);
 }
});

test('same operation id never overwrites: identical retry is a read-only replay',async()=>{
 const s=fakeStore(),payload=await source();
 assert.equal((await doSave(s,{payload})).replayed,false);
 assert.equal((await doSave(s,{payload})).replayed,true);
 assert.equal(s.calls.puts.length,1);
 assert.equal(s.calls.gets.length,3);
});

test('same id with a different image fails closed and cannot change saved artwork',async()=>{
 const s=fakeStore(),original=await source(),other=await source('#ff5500');
 await doSave(s,{payload:original});
 const before=Buffer.from(s.files.get(p(OP)));
 await assert.rejects(doSave(s,{payload:other}),/READBACK_INTEGRITY_MISMATCH/);
 assert.ok(before.equals(s.files.get(p(OP))));
 assert.equal(s.calls.puts.length,1);
});

test('lost PUT acknowledgement is recovered by same-path readback, never by another PUT',async()=>{
 const s=fakeStore({ackLost:true});
 const result=await doSave(s);
 assert.equal(result.ok,true);
 assert.equal(result.replayed,true);
 assert.equal(s.calls.puts.length,1);
 assert.equal(s.calls.gets.length,2);
 assert.equal((await doSave(s)).replayed,true);
 assert.equal(s.calls.puts.length,1);
});

test('uncertain failed PUT without a stored item fails without auto retry',async()=>{
 const s=fakeStore({rejectWrite:true});
 await assert.rejects(doSave(s),/WRITE_UNCONFIRMED_RETRY_SAME_ID/);
 assert.equal(s.calls.puts.length,1);
 assert.equal(s.files.size,0);
});

test('corrupted bytes on readback must never be reported as confirmed',async()=>{
 const s=fakeStore({corrupt:true});
 await assert.rejects(doSave(s),/READBACK_INTEGRITY_MISMATCH/);
 assert.equal(s.calls.puts.length,1);
 s.setCorrupt(false);
 assert.equal((await doSave(s)).replayed,true);
});

test('wrong private store, public URL, MIME mismatch and untrusted pathname all fail',async()=>{
 for(const options of [
  {getStoreId:'anotherprivatestore001'},
  {publicRead:true},
  {wrongReadPath:true},
  {wrongMime:true},
  {invalidSize:true}
 ]){
  const s=fakeStore(options);
  await doSave(s);
  await assert.rejects(doSave(s),/PRIVATE_STORE_METADATA_MISMATCH/);
  assert.equal(s.calls.puts.length,1);
 }
 const publicOutput=fakeStore({publicWrite:true});
 await assert.rejects(doSave(publicOutput),/PRIVATE_STORE_METADATA_MISMATCH/);
});

test('read authorization errors are never interpreted as missing blobs and do not issue put',async()=>{
 const s=fakeStore({getDenied:true});
 await assert.rejects(doSave(s),/READ_UNCONFIRMED/);
 assert.equal(s.calls.puts.length,0);
});

test('oversized private read stream is rejected without any second write',async()=>{
 const s=fakeStore({overlongStream:true});
 await doSave(s).catch(e=>assert.match(e.message,/READ_STREAM_TOO_LARGE/));
 assert.equal(s.calls.puts.length,1);
 await assert.rejects(doSave(s),/READ_STREAM_TOO_LARGE/);
 assert.equal(s.calls.puts.length,1);
});

test('preconditions must be independently verified before any image or Blob side effect',async()=>{
 const base=await source();
 for(const invalid of [
  {...permission(),ownerApproved:false},
  {...permission(),backupRestorationVerified:false},
  {...permission(),previewBindingVerified:false},
  {...permission(),approvedDeviceAuthenticated:false},
  {...permission(),isolatedDatabaseVerified:false},
  {...permission(),dedicatedPrivateStoreVerified:false},
  {...permission(),ownerAuthenticated:false},
  {...permission(),ownerId:'forged'},
  {...permission(),dedicatedStoreId:'wrongstore001'},
  null
 ]){
  const s=fakeStore();
  await assert.rejects(doSave(s,{payload:base,verifyTrustedScope:()=>invalid}),
   /TRUSTED_SCOPE_UNVERIFIED/);
  assert.equal(s.calls.puts.length,0);
  assert.equal(s.calls.gets.length,0);
 }
 const s=fakeStore();
 await assert.rejects(store({payload:base,operationId:OP,storeId:STORE,
  dedicatedToken:TOKEN,sdk:s.sdk}),/TRUSTED_SCOPE_VERIFIER_REQUIRED/);
 assert.equal(s.calls.gets.length,0);
});

test('missing, malformed operation id and absent dedicated store/token fail without network',async()=>{
 const src=await source();
 const blank=fakeStore();
 for(const operationId of [null,'',OP.toUpperCase(),'z'.repeat(32),'0'.repeat(31)]){
  await assert.rejects(store({payload:src,operationId,
   verifyTrustedScope:()=>permission(),storeId:STORE,
   dedicatedToken:TOKEN,sdk:blank.sdk}),/OPERATION_ID_INVALID/);
 }
 for(const config of [
  {storeId:'wrong/store'},
  {dedicatedToken:'short'}
 ]){
  await assert.rejects(store({payload:src,operationId:OP,
   verifyTrustedScope:()=>permission(),
   storeId:config.storeId??STORE,
   dedicatedToken:config.dedicatedToken??TOKEN,sdk:blank.sdk}),
   /STORE_ID_INVALID|DEDICATED_TOKEN_REQUIRED/);
 }
 assert.equal(blank.calls.puts.length+blank.calls.gets.length,0);
});

test('different ids create distinct private objects, never a shared or public key',async()=>{
 const s=fakeStore(),a=await source();
 await doSave(s,{payload:a,operationId:OP});
 await doSave(s,{payload:a,operationId:OP2});
 assert.equal(s.files.size,2);
 assert.ok([...s.files.keys()].every(k=>k.startsWith('museum-private/'+OWNER+'/')));
 assert.equal(s.calls.puts.length,2);
});

test('invalid/EXIF metadata image does not write even after a trusted stage scope',async()=>{
 const s=fakeStore();
 const jpg=await sharp({create:{width:24,height:16,channels:3,background:'#abcfff'}})
  .jpeg().toBuffer();
 const exif=Buffer.from([255,225,0,8,69,120,105,102,0,0]);
 const marked=Buffer.concat([jpg.subarray(0,2),exif,jpg.subarray(2)]);
 const payload={base64:marked.toString('base64'),format:'jpeg',
  bytes:marked.length,width:24,height:16};
 await assert.rejects(doSave(s,{payload}),/JPEG_METADATA_NOT_ALLOWED/);
 assert.equal(s.calls.puts.length+s.calls.gets.length,0);
});

test('module is intentionally un-routed; project and production Blob token are never read here',()=>{
 const src=path('museum-private-blob-write-readback-stage.mjs');
 const conf=JSON.parse(path('vercel.json'));
 assert.equal(conf.routes.some(x=>x.src?.includes('museum-private-blob-write-readback')),false);
 assert.equal(conf.builds.some(x=>x.src==='museum-private-blob-write-readback-stage.mjs'),false);
 assert.match(src,/access:'private'/);
 assert.match(src,/allowOverwrite:false/);
 assert.match(src,/useCache:false/);
 assert.doesNotMatch(src,/process\.env|app\.post|createServer|handler\s*=|blob\.del|signedUrl|setCookie|BLOB_STORE_ID\s*=|BLOB_READ_WRITE_TOKEN\s*=/);
});
