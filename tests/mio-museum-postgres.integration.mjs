// Integration-only: runs against an ephemeral PostgreSQL service in CI.
// Must NEVER use GALLERY_DATABASE_URL from production/preview.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
import museumHandler from '../api-museum-exhibits.js';
import preflightHandler from '../api-museum-preflight.js';
import {createMuseumAssetReviewHandler} from '../api-museum-assets.js';
import {createImageHandler} from '../api-museum-image.js';

const {Pool}=pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const TEST_DB='museum_ci_fixture';
const TEST_IMAGE='https://abc.public.blob.vercel-storage.com/mio-museum/123e4567-e89b-42d3-a456-426614174000.webp';
const poolURL=process.env.MUSEUM_EPHEMERAL_TEST_DATABASE_URL||'';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const digest=value=>createHash('sha256').update(value).digest('hex');
const sessionToken='L'.repeat(43),deviceToken='D'.repeat(43);
const cookie='mio_gallery_session='+sessionToken+'; mio_gallery_device='+deviceToken;
const res=()=>({code:200,data:null,headers:{},
 setHeader(k,v){this.headers[k]=v;return this;},
 status(code){this.code=code;return this;},
 json(data){this.data=data;return this;}
});
const request=(method,body,query={})=>({
 method,body,query,headers:{
 host:HOST,origin:'https://'+HOST,'content-type':'application/json',cookie
 }
});
async function call(handler,method,body,query){
 const output=res();
 await handler(request(method,body,query),output);
 return output;
}
const approvedItem={
 kind:'icons',title:'CI専用の架空のアイコン',description:'一時DBでテスト中',
 credit:'自動試験',occurredOn:'2026-10-29',
 imageUrl:TEST_IMAGE,externalUrl:'',rightsConfirmed:true,privacyConfirmed:true
};
test('real ephemeral PostgreSQL: schema, owner auth, full museum state cycle and audited image references',async()=>{
 // Refuse any non-local or incorrectly named database BEFORE any SQL query.
 const url=new URL(poolURL);
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'refusing non-local DB');
 assert.equal(url.pathname,'/'+TEST_DB,'refusing unapproved DB name');
 assert.equal(process.env.GALLERY_DATABASE_URL,undefined,
  'production-like gallery connection must not be present in isolated SQL test job');
 process.env.GALLERY_DATABASE_URL=poolURL;
 process.env.MIO_MUSEUM_PREFLIGHT_ENABLED='true';
 process.env.MIO_MUSEUM_EXPECTED_DB_HOST=url.hostname;
 process.env.MIO_MUSEUM_EXPECTED_DB_NAME=TEST_DB;
 process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED='true';
 process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED='true';
 process.env.MIO_MUSEUM_ASSET_REVIEW_ENABLED='true';
 process.env.BLOB_READ_WRITE_TOKEN='LOCAL_TEST_ONLY_NO_BLOB_CALL';
 process.env.MIO_MUSEUM_IMAGE_UPLOAD_ENABLED='true';
 const pool=new Pool({connectionString:poolURL,max:2});
 try{
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,TEST_DB);
  // Apply EXACT checked-in SQL, no manually invented version of the schema.
  for(const path of [
   'db/gallery-admin-schema.sql',
   'db/gallery-admin-session-migration.sql',
   'db/gallery-live-overrides.sql'
  ])await pool.query(read(path));

  const users=await pool.query(
   "INSERT INTO gallery_admin_users(display_name,role,status) VALUES('ci-ephemeral-owner','owner','active') RETURNING id"
  );
  const ownerId=users.rows[0].id;
  const devices=await pool.query(
   "INSERT INTO gallery_admin_devices(user_id,device_public_id,status) VALUES($1,$2,'approved') RETURNING id",
   [ownerId,digest(deviceToken)]
  );
  await pool.query(
   "INSERT INTO gallery_admin_sessions(user_id,device_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
   [ownerId,devices.rows[0].id,digest(sessionToken)]
  );

  // Missing museum schema MUST fail closed before applying its migration.
  const before=await call(preflightHandler,'GET');
  assert.equal(before.code,200);
  assert.equal(before.data.schemaReady,false);
  assert.equal(before.data.allReady,false);
  assert.equal(before.data.tables.find(x=>x.table==='museum_public_exhibits').exists,false);
  await pool.query(read('db/museum-public-exhibits.sql'));
  // Re-running a create-only migration against an empty fixture should be safe.
  await pool.query(read('db/museum-public-exhibits.sql'));

  const ready=await call(preflightHandler,'GET');
  assert.equal(ready.code,200,JSON.stringify(ready.data));
  assert.equal(ready.data.schemaReady,true);
  assert.equal(ready.data.identityVerified,true);
  assert.equal(ready.data.allReady,true,'real PostgreSQL metadata did not match release gate');
  assert.equal(ready.data.assetAuditReady,true);
  assert.equal(ready.data.tables.every(t=>t.missing.length===0&&t.wrongTypes.length===0&&t.wrongNullability.length===0),true);
  assert.equal(ready.data.foreignKeys.every(f=>f.present),true);

  // Public visitor sees zero exhibits before any publication.
  let publicData=await call(museumHandler,'GET',undefined,{});
  assert.equal(publicData.code,200);
  assert.deepEqual(publicData.data.items,[]);
  const created=await call(museumHandler,'POST',{action:'create',item:approvedItem},{scope:'admin'});
  assert.equal(created.code,200,JSON.stringify(created.data));
  let {id,revision}=created.data.item;
  assert.equal(created.data.item.status,'draft');
  assert.equal(revision,0);
  publicData=await call(museumHandler,'GET');
  assert.deepEqual(publicData.data.items,[],'new draft must not leak to public');

  const publish=await call(museumHandler,'POST',{
   action:'publish',id,revision,rightsConfirmed:true,privacyConfirmed:true
  },{scope:'admin'});
  assert.equal(publish.code,200,JSON.stringify(publish.data));
  assert.equal(publish.data.item.status,'published');
  revision=publish.data.item.revision;
  publicData=await call(museumHandler,'GET');
  assert.equal(publicData.data.items.length,1);
  assert.equal(publicData.data.items[0].title,approvedItem.title);
  assert.equal('id' in publicData.data.items[0],false);
  assert.equal('status' in publicData.data.items[0],false);

  // Edits must unpublish before re-review; old revision must be rejected.
  const edit=await call(museumHandler,'POST',{action:'update',id,revision,item:{
   ...approvedItem,title:'内容を変更した下書き'
  }},{scope:'admin'});
  assert.equal(edit.code,200);
  assert.equal(edit.data.item.status,'draft');
  const stale=await call(museumHandler,'POST',{
   action:'publish',id,revision,rightsConfirmed:true,privacyConfirmed:true
  },{scope:'admin'});
  assert.equal(stale.code,409);
  assert.deepEqual((await call(museumHandler,'GET')).data.items,[]);
  revision=edit.data.item.revision;

  const republish=await call(museumHandler,'POST',{
   action:'publish',id,revision,rightsConfirmed:true,privacyConfirmed:true
  },{scope:'admin'});
  assert.equal(republish.code,200);revision=republish.data.item.revision;
  const hide=await call(museumHandler,'POST',{action:'hide',id,revision},{scope:'admin'});
  assert.equal(hide.code,200);revision=hide.data.item.revision;
  assert.deepEqual((await call(museumHandler,'GET')).data.items,[]);
  const trash=await call(museumHandler,'POST',{
   action:'trash',id,revision,confirmedTitle:'内容を変更した下書き'
  },{scope:'admin'});
  assert.equal(trash.code,200);revision=trash.data.item.revision;
  const restore=await call(museumHandler,'POST',{action:'restore',id,revision},{scope:'admin'});
  assert.equal(restore.code,200);
  assert.equal(restore.data.item.status,'draft');
  assert.deepEqual((await call(museumHandler,'GET')).data.items,[]);

  // User/owner audit exists in real SQL and is append-only through these operations.
  const audit=await pool.query(
   "SELECT action FROM gallery_admin_audit WHERE actor_id=$1 AND action LIKE 'museum_exhibit_%' ORDER BY occurred_at",
   [ownerId]
  );
  assert.equal(audit.rowCount,7);
  assert.equal(audit.rows.some(r=>r.action==='museum_exhibit_trash'),true);

  // Read-only image listing uses both actual museum and legacy gallery reference columns.
  await pool.query(
   "INSERT INTO gallery_live_overrides(item_id,thumbnail_url) VALUES('ci-ephemeral-gallery',$1)",
   [TEST_IMAGE]
  );
  const assets=createMuseumAssetReviewHandler({
   listBlob:async()=>({
    blobs:[{url:TEST_IMAGE,size:123,uploadedAt:'2026-10-29T00:00:00Z'}],
    hasMore:false
   })
  });
  const images=await call(assets,'GET');
  assert.equal(images.code,200,JSON.stringify(images.data));
  assert.equal(images.data.items[0].references.museum,1);
  assert.equal(images.data.items[0].references.gallery,1);
  assert.equal(images.data.deletionEnabled,false);

  // Exercise the REAL PostgreSQL transaction and audit tables with a fake in-memory
  // Blob adapter. Never contact the real @vercel/blob service.
  const rawWebp=Buffer.alloc(64);
  rawWebp.write('RIFF',0);rawWebp.writeUInt32LE(56,4);rawWebp.write('WEBP',8);
  const encoded={format:'webp',base64:rawWebp.toString('base64')};
  const media=new Map(),deletedMedia=[];
  let uploads=0;
  const picture=createImageHandler({
   putBlob:async(path,bytes,opts)=>{
    assert.ok(path.startsWith('mio-museum/'));
    assert.deepEqual(bytes,rawWebp);
    assert.equal(opts.access,'public');
    assert.equal(opts.contentType,'image/webp');
    const url='https://ci-only.public.blob.vercel-storage.com/'+path;
    media.set(url,Buffer.from(bytes));uploads++;
    return {url};
   },
   delBlob:async url=>{
    assert.ok(media.has(url),'only this fixture-created image may be deleted');
    deletedMedia.push(url);
    media.delete(url);
   }
  });
  const originalCount=Number((await pool.query(
   'SELECT count(*) AS count FROM museum_public_exhibits')).rows[0].count);
  const makeImage=(action,extra={})=>({action,item:{
   ...approvedItem,title:'CI用の画像下書き',imageUrl:''
  },image:encoded,...extra});
  const imCreate=await call(picture,'POST',makeImage('imageCreate'));
  assert.equal(imCreate.code,200,JSON.stringify(imCreate.data));
  const imId=imCreate.data.exhibit.id;
  let imRev=imCreate.data.exhibit.revision;
  const originalUrl=imCreate.data.exhibit.imageUrl;
  assert.equal(media.size,1);
  assert.equal((await pool.query(
   'SELECT status FROM museum_public_exhibits WHERE id=$1',[imId]
  )).rows[0].status,'draft');
  assert.deepEqual((await call(museumHandler,'GET')).data.items,[],
   'image upload must never publish the record');

  const photoPublish=await call(museumHandler,'POST',{
   action:'publish',id:imId,revision:imRev,rightsConfirmed:true,privacyConfirmed:true
  },{scope:'admin'});
  assert.equal(photoPublish.code,200);
  assert.equal(photoPublish.data.item.status,'published');
  imRev=photoPublish.data.item.revision;
  assert.equal((await call(museumHandler,'GET')).data.items.length,1);
  const replace=await call(picture,'POST',makeImage('imageUpdate',{id:imId,revision:imRev}));
  assert.equal(replace.code,200,JSON.stringify(replace.data));
  assert.equal(replace.data.exhibit.status,'draft');
  assert.notEqual(replace.data.exhibit.imageUrl,originalUrl);
  assert.ok(media.has(originalUrl),'old image kept for history and recovery');
  assert.ok(media.has(replace.data.exhibit.imageUrl));
  assert.equal(media.size,2);
  assert.deepEqual((await call(museumHandler,'GET')).data.items,[],
   'replacing a published image must immediately unpublish the exhibit');

  const beforeStale=uploads;
  const stalePicture=await call(picture,'POST',makeImage('imageUpdate',{id:imId,revision:imRev}));
  assert.equal(stalePicture.code,409,'stale image update must be refused');
  assert.equal(uploads,beforeStale,'stale revision must not upload anything');

  imRev=replace.data.exhibit.revision;
  const inTrash=await call(museumHandler,'POST',{
   action:'trash',id:imId,revision:imRev,confirmedTitle:'CI用の画像下書き'
  },{scope:'admin'});
  assert.equal(inTrash.code,200);
  const trashedPhoto=await call(picture,'POST',makeImage('imageUpdate',{
   id:imId,revision:inTrash.data.item.revision
  }));
  assert.equal(trashedPhoto.code,409);
  assert.equal(uploads,beforeStale,'trash must prevent replacement upload');

  // Force an AUDIT INSERT failure using a real PostgreSQL constraint, not
  // a stubbed query, then verify both DB rollback and new Blob cleanup.
  await pool.query(
   "ALTER TABLE gallery_admin_audit ADD CONSTRAINT ci_no_new_image_audit CHECK (action <> 'museum_image_created')"
  );
  const existingMedia=new Set(media.keys());
  const auditedBefore=Number((await pool.query(
   'SELECT count(*) AS count FROM museum_public_exhibits'
  )).rows[0].count);
  const badAudit=await call(picture,'POST',makeImage('imageCreate'));
  assert.equal(badAudit.code,503);
  assert.equal(badAudit.data.code,'MUSEUM_IMAGE_SAVE_FAILED');
  assert.equal(Number((await pool.query(
   'SELECT count(*) AS count FROM museum_public_exhibits'
  )).rows[0].count),auditedBefore,'failed audit must roll back the exhibit row');
  assert.deepEqual(new Set(media.keys()),existingMedia,
   'failed audit must clean only the newly uploaded image');
  assert.equal(deletedMedia.length,1);
  assert.equal(media.has(originalUrl),true,'old Blob must never be deleted');

  const badCookie=request('POST',makeImage('imageCreate'));
  badCookie.headers.cookie='mio_gallery_session=invalid; mio_gallery_device=invalid';
  const noOwner=res();
  const uploadsBeforeDenied=uploads;
  await picture(badCookie,noOwner);
  assert.equal(noOwner.code,401);
  assert.equal(uploads,uploadsBeforeDenied,'no image upload without a valid owner session');
  assert.equal(media.size,2);
  assert.equal(originalCount+2,auditedBefore,'only two fixture records were committed');
  const imageAudits=(await pool.query(
   "SELECT action FROM gallery_admin_audit WHERE actor_id=$1 AND action LIKE 'museum_image_%' ORDER BY occurred_at",
   [ownerId]
  )).rows.map(x=>x.action);
  assert.deepEqual(imageAudits,['museum_image_created','museum_image_replaced']);
  console.log('MUSEUM_IMAGE_POSTGRES_PASS '+JSON.stringify({
   imageAudits:imageAudits.length,blobUploads:uploads,blobCleanup:deletedMedia.length,
   originalImagePreserved:media.has(originalUrl),staleAndTrashBlocked:true,realBlobCalls:0
  }));

  console.log('MUSEUM_EPHEMERAL_POSTGRES_PASS '+JSON.stringify({
   schemaReady:ready.data.allReady,foreignKeys:ready.data.foreignKeys.length,
   auditRows:audit.rowCount,publicItemsAfterRestore:0,realBlobWrites:0
  }));
 }finally{
  await pool.end();
  for(const k of [
   'GALLERY_DATABASE_URL','MIO_MUSEUM_PREFLIGHT_ENABLED','MIO_MUSEUM_EXPECTED_DB_HOST',
   'MIO_MUSEUM_EXPECTED_DB_NAME','MIO_MUSEUM_ARCHIVE_EDIT_ENABLED',
   'MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED','MIO_MUSEUM_ASSET_REVIEW_ENABLED',
   'BLOB_READ_WRITE_TOKEN','MIO_MUSEUM_IMAGE_UPLOAD_ENABLED'
  ])delete process.env[k];
 }
});
