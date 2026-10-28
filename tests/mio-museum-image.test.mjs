import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {inspectDraftImage,createImageHandler} from '../api-museum-image.js';

const HOST='emuzii-mio-1st-web-v12.vercel.app';
const UID='00000000-0000-4000-8000-000000000001';
const ID='aabbccdd-1234-4000-8000-112233445566';
const webp=Buffer.alloc(64,0);
webp.write('RIFF',0);webp.writeUInt32LE(webp.length-8,4);webp.write('WEBP',8);
const sample={
 kind:'icons',title:'翠央のアイコン',description:'記念',credit:'制作者',
 occurredOn:'2026-10-27',imageUrl:'',externalUrl:'',
 rightsConfirmed:true,privacyConfirmed:true
};
const image={format:'webp',base64:webp.toString('base64')};
const request=(body,other={})=>({method:'POST',body,headers:{
 host:HOST,origin:'https://'+HOST,'content-type':'application/json',...other
}});
const response=()=>({
 code:200,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},
 status(n){this.code=n;return this;},json(x){this.data=x;return this;}
});
const blobUrl=(path)=>'https://abc.public.blob.vercel-storage.com/'+path;
function fakePool(query){
 return class FakePool{
  constructor(){this.ended=false;}
  async connect(){return {query,release(){}};}
  async end(){this.ended=true;}
 };
}
function withEnv(run){
 const keys=['GALLERY_DATABASE_URL','BLOB_READ_WRITE_TOKEN','MIO_MUSEUM_ARCHIVE_EDIT_ENABLED','MIO_MUSEUM_IMAGE_UPLOAD_ENABLED'];
 const saved=Object.fromEntries(keys.map(x=>[x,process.env[x]]));
 process.env.GALLERY_DATABASE_URL='postgres://example.invalid/museum';
 process.env.BLOB_READ_WRITE_TOKEN='dummy-token-for-mock';
 process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED='true';
 process.env.MIO_MUSEUM_IMAGE_UPLOAD_ENABLED='true';
 return Promise.resolve().then(run).finally(()=>{
  for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
 });
}
const bytes=inspectDraftImage(image);
test('accept known WebP header, reject mismatched type and oversized input',()=>{
 assert.equal(bytes.ext,'webp');
 assert.deepEqual(bytes.bytes,webp);
 assert.equal(inspectDraftImage({...image,format:'jpeg'}),null);
 const changed=Buffer.from(webp);changed.writeUInt32LE(1,4);
 assert.equal(inspectDraftImage({format:'webp',base64:changed.toString('base64')}),null);
 assert.equal(inspectDraftImage({format:'webp',base64:'A'.repeat(1_100_100)}),null);
});
test('feature is disabled by default and cannot access storage',async()=>{
 const old=process.env.MIO_MUSEUM_IMAGE_UPLOAD_ENABLED;
 delete process.env.MIO_MUSEUM_IMAGE_UPLOAD_ENABLED;
 try{
  const handler=createImageHandler({PoolClass:fakePool(()=>{throw Error('DB touched');}),
   putBlob:async()=>{throw Error('Blob touched');}});
  const out=response();await handler(request({action:'imageCreate',item:sample,image}),out);
  assert.equal(out.code,503);assert.equal(out.data.code,'IMAGE_UPLOAD_CLOSED');
 }finally{if(old===undefined)delete process.env.MIO_MUSEUM_IMAGE_UPLOAD_ENABLED;else process.env.MIO_MUSEUM_IMAGE_UPLOAD_ENABLED=old;}
});
test('origin and image format are checked before storage and authentication',async()=>{
 await withEnv(async()=>{
  const handler=createImageHandler({PoolClass:fakePool(()=>{throw Error('No access');})});
  const badOrigin=response();await handler(request({action:'imageCreate',item:sample,image},{origin:'https://evil.test'}),badOrigin);
  assert.equal(badOrigin.code,403);
  const bad=response();await handler(request({action:'imageCreate',item:sample,image:{format:'webp',base64:'AAA'}}),bad);
  assert.equal(bad.code,400);
 });
});
test('unauthenticated and non-owner sessions never upload images',async()=>{
 await withEnv(async()=>{
  let uploadCount=0;
  const putBlob=async()=>{uploadCount++;throw Error('unexpected upload');};
  for(const identity of [null,{id:UID,role:'admin'}]){
   const handler=createImageHandler({
    PoolClass:fakePool(()=>{throw Error('Unexpected SQL');}),
    verifyAdmin:async()=>identity,putBlob
   });
   const out=response();await handler(request({action:'imageCreate',item:sample,image}),out);
   assert.equal(out.code,identity?403:401);
  }
  assert.equal(uploadCount,0);
 });
});
test('photo and new exhibit draft commit once, including audit',async()=>{
 await withEnv(async()=>{
  const queries=[];let pathname='';
  const handler=createImageHandler({
   PoolClass:fakePool(async(sql,args)=>{
    queries.push(sql);
    if(sql.startsWith('INSERT INTO museum_public_exhibits')){
     assert.match(sql,/'draft'/);
     assert.ok(args[5].startsWith('https://abc.public.blob.vercel-storage.com/mio-museum/'));
     return {rowCount:1,rows:[{id:ID,status:'draft',revision:0}]};
    }
    if(sql.includes('INSERT INTO gallery_admin_audit')){
     assert.deepEqual(args,[UID,'museum_image_created',ID]);
    }
    return {rowCount:1,rows:[]};
   }),
   verifyAdmin:async()=>({id:UID,role:'owner'}),
   putBlob:async(path,buffer,options)=>{
    pathname=path;assert.deepEqual(buffer,webp);
    assert.equal(options.contentType,'image/webp');assert.equal(options.access,'public');
    return {url:blobUrl(path)};
   },
   delBlob:async()=>{throw Error('no cleanup after success');}
  });
  const out=response();await handler(request({action:'imageCreate',item:sample,image}),out);
  assert.equal(out.code,200);assert.equal(out.data.exhibit.status,'draft');
  assert.equal(out.data.exhibit.imageUrl,blobUrl(pathname));
  assert.equal(queries.filter(x=>x==='BEGIN').length,1);
  assert.equal(queries.filter(x=>x==='COMMIT').length,1);
 });
});
test('stale revision never uploads and rolls back',async()=>{
 await withEnv(async()=>{
  let blobCalls=0;const calls=[];
  const handler=createImageHandler({
   PoolClass:fakePool(async sql=>{
    calls.push(sql);
    if(sql.startsWith('SELECT revision FROM museum_public_exhibits'))return {rowCount:1,rows:[{revision:5}]};
    return {rowCount:1,rows:[]};
   }),verifyAdmin:async()=>({id:UID,role:'owner'}),
   putBlob:async()=>{blobCalls++;throw Error('Unexpected upload');}
  });
  const out=response();await handler(request({action:'imageUpdate',id:ID,revision:4,item:sample,image}),out);
  assert.equal(out.code,409);assert.equal(out.data.code,'EXHIBIT_CHANGED_RELOAD');
  assert.equal(blobCalls,0);assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.includes('COMMIT'));
 });
});
test('audit failure rolls back DB and deletes only newly uploaded Blob',async()=>{
 await withEnv(async()=>{
  const actions=[],removed=[];
  const handler=createImageHandler({
   PoolClass:fakePool(async sql=>{
    actions.push(sql);
    if(sql.startsWith('INSERT INTO museum_public_exhibits'))return {rowCount:1,rows:[{id:ID,status:'draft',revision:0}]};
    if(sql.includes('INSERT INTO gallery_admin_audit'))throw Error('audit unavailable');
    return {rowCount:1,rows:[]};
   }),verifyAdmin:async()=>({id:UID,role:'owner'}),
   putBlob:async path=>({url:blobUrl(path)}),delBlob:async url=>{removed.push(url);}
  });
  const out=response();await handler(request({action:'imageCreate',item:sample,image}),out);
  assert.equal(out.code,503);assert.equal(out.data.code,'MUSEUM_IMAGE_SAVE_FAILED');
  assert.ok(actions.includes('ROLLBACK'));assert.ok(!actions.includes('COMMIT'));
  assert.equal(removed.length,1);
  assert.match(removed[0],/\/mio-museum\//);
 });
});
test('photo replacement returns exhibit to draft and keeps old Blob for recovery',async()=>{
 await withEnv(async()=>{
  const calls=[],removed=[];
  const handler=createImageHandler({
   PoolClass:fakePool(async(sql,args)=>{
    calls.push(sql);
    if(sql.startsWith('SELECT revision FROM museum_public_exhibits'))
     return {rowCount:1,rows:[{revision:3}]};
    if(sql.startsWith('UPDATE museum_public_exhibits')){
     assert.match(sql,/status='draft'/);
     assert.equal(args.at(-1),3);
     return {rowCount:1,rows:[{id:ID,status:'draft',revision:4}]};
    }
    return {rowCount:1,rows:[]};
   }),verifyAdmin:async()=>({id:UID,role:'owner'}),
   putBlob:async path=>({url:blobUrl(path)}),
   delBlob:async url=>removed.push(url)
  });
  const out=response();await handler(request({action:'imageUpdate',id:ID,revision:3,item:sample,image}),out);
  assert.equal(out.code,200);assert.equal(out.data.exhibit.revision,4);
  assert.ok(calls.includes('COMMIT'));assert.deepEqual(removed,[]);
 });
});
test('frontend has visible privacy warning, preview, and a two-stage publish flow',()=>{
 const root=new URL('../',import.meta.url);
 const page=readFileSync(new URL('museum-curate.html',root),'utf8');
 const js=readFileSync(new URL('museum-image-client.js',root),'utf8');
 const routes=JSON.parse(readFileSync(new URL('vercel.json',root),'utf8'));
 assert.match(page,/id="uploadImage"/);
 assert.match(page,/id="imagePreviewImg"/);
 assert.match(page,/下書きの段階でも/);
 assert.match(page,/新しい写真を選んでいます。先に画像付きの下書きを保存/);
 assert.match(page,/\/api\/museum\/image/);
 assert.match(page,/imageUploadEnabled/);
 assert.match(page,/if\(imageRequestStarted\)saveNeedsReview=true/);
 assert.match(page,/saveNeedsReview=false/);
 assert.match(js,/canvas\.toBlob/);
 assert.match(js,/MAX_OUTPUT=700_000/);
 assert.doesNotThrow(()=>new Script(js));
 const inlineStart=page.indexOf('<script>');
 const inlineEnd=page.indexOf('</script>',inlineStart);
 assert.ok(inlineStart>=0&&inlineEnd>inlineStart);
 assert.doesNotThrow(()=>new Script(page.slice(inlineStart+'<script>'.length,inlineEnd)));
 assert.ok(routes.builds.some(x=>x.src==='api-museum-image.js'));
 assert.ok(routes.routes.some(x=>x.src==='/api/museum/image'));
 assert.ok(routes.builds.some(x=>x.src==='gacha-deluxe-v21.js'));
});

test('ambiguous COMMIT result keeps newly uploaded image for reconciliation',async()=>{
 await withEnv(async()=>{
  const deleted=[];const commands=[];
  const handler=createImageHandler({
   PoolClass:fakePool(async sql=>{
    commands.push(sql);
    if(sql.startsWith('INSERT INTO museum_public_exhibits'))
     return {rowCount:1,rows:[{id:ID,status:'draft',revision:0}]};
    if(sql==='COMMIT')throw Error('network failed after commit request');
    return {rowCount:1,rows:[]};
   }),verifyAdmin:async()=>({id:UID,role:'owner'}),
   putBlob:async path=>({url:blobUrl(path)}),
   delBlob:async url=>deleted.push(url)
  });
  const out=response();await handler(request({action:'imageCreate',item:sample,image}),out);
  assert.equal(out.code,503);
  assert.ok(commands.includes('COMMIT'));
  assert.deepEqual(deleted,[]);
 });
});
