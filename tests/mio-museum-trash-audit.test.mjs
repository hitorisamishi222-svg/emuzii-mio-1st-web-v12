import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import pg from 'pg';
import exhibitHandler from '../api-museum-exhibits.js';
import {createImageHandler} from '../api-museum-image.js';
import {createMuseumAssetReviewHandler} from '../api-museum-assets.js';

const host='emuzii-mio-1st-web-v12.vercel.app';
const owner='00000000-0000-4000-8000-000000000001';
const id='aabbccdd-1234-4000-8000-112233445566';
const fname='展示タイトル';
const x1='https://abc.public.blob.vercel-storage.com/mio-museum/123e4567-e89b-42d3-a456-426614174000.webp';
const x2='https://abc.public.blob.vercel-storage.com/mio-museum/223e4567-e89b-42d3-a456-426614174000.jpg';
const response=()=>({code:200,data:null,headers:{},
 setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},
 json(x){this.data=x;return this;}});
const req=(method='POST',body={},query={})=>({
 method,body,query,headers:{host,origin:'https://'+host,'content-type':'application/json'}
});
function db(query){
 return class Pool{
  async connect(){return {query,release(){}};}
  async end(){}
 };
}
const envKeys=['GALLERY_DATABASE_URL','BLOB_READ_WRITE_TOKEN',
 'MIO_MUSEUM_ARCHIVE_EDIT_ENABLED','MIO_MUSEUM_ASSET_REVIEW_ENABLED'];
async function env(fn){
 const old=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 process.env.GALLERY_DATABASE_URL='postgres://unused/test';
 process.env.BLOB_READ_WRITE_TOKEN='mock';
 process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED='true';
 process.env.MIO_MUSEUM_ASSET_REVIEW_ENABLED='true';
 try{await fn();}finally{
  for(const k of envKeys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
 }
}
async function exhibitDB(query,fn){
 const connect=mock.method(pg.Pool.prototype,'connect',async()=>({query,release(){}}));
 const end=mock.method(pg.Pool.prototype,'end',async()=>{});
 try{await fn();}finally{connect.mock.restore();end.mock.restore();}
}
const identityQuery=(sql)=>{
 if(sql.includes('FROM gallery_admin_sessions'))
  return {rows:[{id:owner,role:'owner'}],rowCount:1};
 return null;
};
test('soft trash requires typed title and never commits without it',async()=>{
 await env(async()=>{
  const calls=[];
  await exhibitDB(async(sql)=>{
   calls.push(sql);
   const a=identityQuery(sql);if(a)return a;
   return {rows:[],rowCount:1};
  },async()=>{
   const out=response();await exhibitHandler(req('POST',{action:'trash',id,revision:0}),out);
   assert.equal(out.code,400);assert.equal(out.data.code,'TRASH_CONFIRMATION_REQUIRED');
  });
  assert.ok(calls.includes('ROLLBACK'));
  assert.equal(calls.includes('COMMIT'),false);
  assert.equal(calls.some(x=>x.includes('gallery_admin_audit')),false);
 });
});
test('trash action is versioned, title matched, audited and reversible',async()=>{
 await env(async()=>{
  const statements=[];
  await exhibitDB(async(sql,args)=>{
   statements.push(sql);
   const a=identityQuery(sql);if(a)return a;
   if(sql.startsWith('UPDATE museum_public_exhibits')){
    assert.match(sql,/status='trash',trashed_at=now\(\)/);
    assert.match(sql,/title=\$4/);
    assert.match(sql,/status IN \('draft','published','hidden'\)/);
    assert.deepEqual(args,[owner,id,5,fname]);
    return {rows:[{id,status:'trash',revision:6}],rowCount:1};
   }
   if(sql.includes('gallery_admin_audit'))assert.deepEqual(args,[owner,'museum_exhibit_trash',id]);
   return {rows:[],rowCount:1};
  },async()=>{
   const out=response();await exhibitHandler(req('POST',{action:'trash',id,revision:5,confirmedTitle:fname}),out);
   assert.equal(out.code,200);assert.equal(out.data.item.status,'trash');
   assert.equal(out.data.item.revision,6);
  });
  assert.ok(statements.includes('BEGIN')&&statements.includes('COMMIT'));
  assert.equal(statements.some(x=>/delete\s+from|from\s+'@vercel\/blob'/i.test(x)),false);
 });
});
test('restored exhibit returns to DRAFT and is never automatically re-published',async()=>{
 await env(async()=>{
  const statements=[];
  await exhibitDB(async(sql,args)=>{
   statements.push(sql);
   const a=identityQuery(sql);if(a)return a;
   if(sql.startsWith('UPDATE museum_public_exhibits')){
    assert.match(sql,/status='draft',trashed_at=NULL/);
    assert.match(sql,/status='trash'/);
    assert.match(sql,/published_at=NULL/);
    return {rows:[{id,status:'draft',revision:7}],rowCount:1};
   }
   return {rows:[],rowCount:1};
  },async()=>{
   const out=response();await exhibitHandler(req('POST',{action:'restore',id,revision:6}),out);
   assert.equal(out.code,200);assert.equal(out.data.item.status,'draft');
  });
  assert.ok(statements.includes('COMMIT'));
 });
});
test('revision conflict rolls back trash and does not write audit',async()=>{
 await env(async()=>{
  const statements=[];
  await exhibitDB(async(sql)=>{
   statements.push(sql);
   const a=identityQuery(sql);if(a)return a;
   if(sql.startsWith('UPDATE museum_public_exhibits'))return {rows:[],rowCount:0};
   return {rows:[],rowCount:1};
  },async()=>{
   const out=response();await exhibitHandler(req('POST',{action:'trash',id,revision:2,confirmedTitle:fname}),out);
   assert.equal(out.code,409);
  });
  assert.ok(statements.includes('ROLLBACK'));
  assert.ok(!statements.includes('COMMIT'));
  assert.ok(!statements.some(x=>x.includes('gallery_admin_audit')));
 });
});
test('image upload/replacement cannot revive an exhibit already in trash',async()=>{
 await env(async()=>{
  const buf=Buffer.alloc(64,0);buf.write('RIFF',0);buf.writeUInt32LE(56,4);buf.write('WEBP',8);
  const item={kind:'icons',title:fname,description:'memory',credit:'',occurredOn:'',imageUrl:'',externalUrl:'',rightsConfirmed:true,privacyConfirmed:true};
  let puts=0;
  const fn=createImageHandler({
   PoolClass:db(async sql=>{
    if(sql.startsWith('SELECT revision,status FROM museum_public_exhibits'))
     return {rowCount:1,rows:[{revision:4,status:'trash'}]};
    return {rowCount:1,rows:[]};
   }),
   verifyAdmin:async()=>({id:owner,role:'owner'}),
   putBlob:async()=>{puts++;throw Error('unexpected put');}
  });
  const out=response();
  await fn(req('POST',{action:'imageUpdate',id,revision:4,item,image:{format:'webp',base64:buf.toString('base64')}}),out);
  assert.equal(out.code,409);assert.equal(puts,0);
 });
});
test('asset audit is OFF by default, before listing images or querying the DB',async()=>{
 const prev=process.env.MIO_MUSEUM_ASSET_REVIEW_ENABLED;
 delete process.env.MIO_MUSEUM_ASSET_REVIEW_ENABLED;
 try{
  const fn=createMuseumAssetReviewHandler({PoolClass:db(()=>{throw Error('unexpected db');}),
   listBlob:async()=>{throw Error('unexpected list');}});
  const out=response();await fn(req('GET'),out);
  assert.equal(out.code,503);assert.equal(out.data.code,'ASSET_REVIEW_CLOSED');
 }finally{if(prev===undefined)delete process.env.MIO_MUSEUM_ASSET_REVIEW_ENABLED;else process.env.MIO_MUSEUM_ASSET_REVIEW_ENABLED=prev;}
});
test('asset audit blocks unauthenticated and non-owner clients without listing',async()=>{
 await env(async()=>{
  let called=0;
  for(const identity of [null,{id:owner,role:'admin'}]){
   const fn=createMuseumAssetReviewHandler({
    PoolClass:db(()=>{throw Error('unexpected query');}),
    verifyAdmin:async()=>identity,
    listBlob:async()=>{called++;throw Error('unexpected list');}
   });
   const out=response();await fn(req('GET'),out);
   assert.equal(out.code,identity?403:401);
  }
  assert.equal(called,0);
 });
});
test('asset review reports referenced and potential orphan files, never deletion approval',async()=>{
 await env(async()=>{
  const listed=[];
  const fn=createMuseumAssetReviewHandler({
   PoolClass:db(async(sql,args)=>{
    assert.match(sql,/FROM museum_public_exhibits/);
    assert.match(sql,/FROM gallery_live_overrides/);
    assert.deepEqual(args,[[x1,x2]]);
    return {rows:[{url:x1,source:'museum'},{url:x1,source:'gallery'}],rowCount:2};
   }),
   verifyAdmin:async()=>({id:owner,role:'owner'}),
   listBlob:async opts=>{
    listed.push(opts);
    return {blobs:[
     {url:x1,size:123,uploadedAt:'2026-10-28T01:00:00Z'},
     {url:x2,size:456,uploadedAt:'2026-10-28T02:00:00Z'},
     {url:'https://outside.test/bad.jpg',size:33}
    ],hasMore:true,cursor:'next-abc'};
   }
  });
  const out=response();await fn(req('GET',undefined,{cursor:'earlier-abc'}),out);
  assert.equal(out.code,200);assert.equal(out.data.items.length,2);
  assert.equal(out.data.items[0].reviewStatus,'referenced');
  assert.deepEqual(out.data.items[0].references,{museum:1,gallery:1});
  assert.equal(out.data.items[1].reviewStatus,'manual_review_required');
  assert.equal(out.data.deletionEnabled,false);
  assert.equal(out.data.cursor,'next-abc');
  assert.deepEqual(listed,[{prefix:'mio-museum/',limit:50,cursor:'earlier-abc'}]);
 });
});
test('failed reference lookup never labels images as unused or eligible for deletion',async()=>{
 await env(async()=>{
  const fn=createMuseumAssetReviewHandler({
   PoolClass:db(async()=>{throw Error('schema or reference lookup unavailable');}),
   verifyAdmin:async()=>({id:owner,role:'owner'}),
   listBlob:async()=>({blobs:[{url:x1}],hasMore:false})
  });
  const out=response();await fn(req('GET'),out);
  assert.equal(out.code,503);assert.equal(out.data.code,'ASSET_REVIEW_UNAVAILABLE');
  assert.equal('items' in out.data,false);
 });
});
test('screen has trash/restore, owner audit and no destructive Blob delete button',()=>{
 const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
 const page=read('museum-curate.html'),api=read('api-museum-assets.js');
 const schema=read('db/museum-public-exhibits.sql');
 const routes=JSON.parse(read('vercel.json'));
 assert.match(page,/id="trash"/);assert.match(page,/id="restore"/);
 assert.match(page,/タイトルをそのまま入力してください/);
 assert.match(page,/id="assetRefresh"/);
 assert.match(page,/削除してよいとは限りません/);
 assert.match(schema,/status IN \('draft','published','hidden','trash'\)/);
 assert.match(schema,/trashed_at timestamptz/);
 assert.match(api,/deletionEnabled:false/);
 assert.doesNotMatch(api,/await del\(/);
 assert.ok(routes.builds.some(x=>x.src==='api-museum-assets.js'&&x.use==='@vercel/node'));
 assert.ok(routes.routes.some(x=>x.src==='/api/museum/assets'));
 const begin=page.indexOf('<script>'),end=page.indexOf('</script>',begin);
 assert.ok(begin>=0&&end>begin);
 assert.doesNotThrow(()=>new Script(page.slice(begin+8,end)));
});
