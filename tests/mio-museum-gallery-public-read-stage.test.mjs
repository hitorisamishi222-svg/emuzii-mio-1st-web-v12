import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readPublishedMuseumGalleryStage} from '../museum-gallery-public-read-stage.mjs';
import {loadMuseumModeratedCatalogStage} from '../museum-gallery-source-stage.mjs';

const museumId='e4b063d0-a393-4d15-b653-c2243e38c6a8';
const id='museum-'+museumId;
const validLayout=()=>({
 published_revision:'3',published_from_draft_revision:'2',
 published_order:[id,'mio-awakening-video','mio-awakening-song'],
 published_visible_ids:[id,'mio-awakening-video','mio-awakening-song'],
 published_featured_id:id,
 published_review_hashes:Object.fromEntries([id,'mio-awakening-video','mio-awakening-song'].map(key=>[key,baselineHashes[key]])),
 published_by:'11111111-2222-4333-8444-555555555555',
 published_at:new Date('2026-11-03T08:00:00Z')
});
const exhibit=()=>({
 id:museumId,kind:'icons',category:'イラスト',title:'承認済みイラスト',
 description:'ミュージアム展示',credit:'公認クリエイター',
 image_url:'/assets/gallery-emuzii-mio-cover.svg',
 external_url:'',status:'published',revision:2,
 updated_at:new Date('2026-11-03T09:00:00Z'),
 rights_checked_at:new Date('2026-11-02T08:00:00Z'),
 privacy_checked_at:new Date('2026-11-02T09:00:00Z'),
 published_at:new Date('2026-11-03T08:00:00Z'),
 reviewed_by:'11111111-2222-4333-8444-555555555555'
});
const rows=entries=>({command:'SELECT',rowCount:entries.length,rows:entries});
const baselineHashes=(await loadMuseumModeratedCatalogStage({async query(sql){
 return rows(sql.includes('gallery_live_overrides')?[]:[exhibit()]);
}})).currentReviewHashes;
class FakeClient{
 constructor({layout=validLayout(),overrides=[],exhibits=[exhibit()],missingMuseum=false}={}){
  this.layout=layout;this.overrides=overrides;this.exhibits=exhibits;
  this.missingMuseum=missingMuseum;this.calls=[];this.rollbacks=0;
 }
 async query(sql,args=[]){
  this.calls.push({sql,args});
  if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'){
   this.readOnly=true;return {command:'BEGIN'};
  }
  if(this.readOnly&&/FOR\s+(?:UPDATE|SHARE)\b/i.test(sql))
   throw Error('cannot execute SELECT FOR SHARE in a read-only transaction');
  if(sql==='COMMIT')return {command:'COMMIT'};
  if(sql==='ROLLBACK'){this.rollbacks++;return {command:'ROLLBACK'}}
  if(sql.includes('FROM museum_gallery_layout_stage')){
   return rows(this.layout===null?[]:[this.layout]);
  }
  if(sql.includes('FROM gallery_live_overrides'))return rows(this.overrides);
  if(sql.includes('FROM museum_public_exhibits')){
   if(this.missingMuseum)throw Error('relation museum_public_exhibits does not exist');
   return rows(this.exhibits);
  }
  throw Error('Unexpected SQL '+sql);
 }
}
const rejection=(fn,code)=>assert.rejects(fn,new RegExp('MUSEUM_READ_'+code));
test('public reader exposes only confirmed published layout and current approved gallery items',async()=>{
 const db=new FakeClient(),result=await readPublishedMuseumGalleryStage(db);
 assert.equal(result.published,true);assert.equal(result.revision,3);
 assert.deepEqual(result.items.map(x=>x.id),[id,'mio-awakening-video','mio-awakening-song']);
 assert.equal(result.items[0].featured,true);
 assert.equal(db.calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal(db.calls.at(-1).sql,'COMMIT');
 assert.equal(db.calls.length,5);
 assert.equal(db.rollbacks,0);
});
test('public reader never tries SELECT FOR SHARE or UPDATE inside a read-only transaction',async()=>{
 const db=new FakeClient();
 await readPublishedMuseumGalleryStage(db);
 const queries=db.calls.map(x=>x.sql);
 assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.ok(queries.some(q=>q.includes('gallery_live_overrides')));
 assert.equal(queries.some(q=>/FOR\s+(?:SHARE|UPDATE)\b/i.test(q)),false);
});
test('no published layout never falls back to static gallery',async()=>{
 for(const layout of [null,{
  published_revision:null,published_from_draft_revision:null,
  published_order:null,published_visible_ids:null,published_featured_id:null,
  published_review_hashes:null,published_by:null,published_at:null
 }]){
  const db=new FakeClient({layout});
  const result=await readPublishedMuseumGalleryStage(db);
  assert.deepEqual(result.items,[]);
  assert.equal(result.published,false);
  assert.equal(db.calls.length,3);
  assert.equal(db.calls.some(x=>x.sql.includes('museum_public_exhibits')),false);
 }
});
test('moderation takedown removes a formerly featured legacy work',async()=>{
 const db=new FakeClient({
  overrides:[{item_id:'mio-awakening-song',title:null,creator:null,description:null,
   category:null,external_url:null,thumbnail_url:null,hidden:true,deleted:false}]
 });
 const result=await readPublishedMuseumGalleryStage(db);
 assert.equal(result.items.some(x=>x.id==='mio-awakening-song'),false);
 assert.equal(result.items.length,2);
});
test('revoked museum item stays unpublished even when a previous published snapshot listed it',async()=>{
 const closed=exhibit();closed.status='hidden';
 const db=new FakeClient({exhibits:[closed]});
 const result=await readPublishedMuseumGalleryStage(db);
 assert.deepEqual(result.items.map(x=>x.id),['mio-awakening-video','mio-awakening-song']);
 assert.equal(result.items.some(x=>x.featured),false);
});
test('previously published museum item cannot reappear after a newer confirmed review',async()=>{
 const renewed=exhibit();renewed.revision=3;
 renewed.updated_at=new Date('2026-11-03T10:00:00Z');
 const db=new FakeClient({exhibits:[renewed]});
 const result=await readPublishedMuseumGalleryStage(db);
 assert.equal(result.items.some(item=>item.id===id),false,
  'old approval fingerprint may not authorize content after a new review');
 assert.deepEqual(result.items.map(item=>item.id),['mio-awakening-video','mio-awakening-song']);
 assert.equal(result.items.some(item=>item.featured),false);
});
test('missing or tampered publication approval proof cannot display any partial gallery',async()=>{
 for(const published_review_hashes of [null,{}, {[id]:'bad'},{
  [id]:'f'.repeat(64),
  'mio-awakening-video':'f'.repeat(64),
  'mio-awakening-song':'f'.repeat(64),
  'extra-public':'f'.repeat(64)
 }]){
  const db=new FakeClient({layout:{...validLayout(),published_review_hashes}});
  await assert.rejects(()=>readPublishedMuseumGalleryStage(db),
   /MUSEUM_REVIEW_(HASHES_INVALID|SNAPSHOT_INCOMPLETE)/);
  assert.equal(db.rollbacks,1);
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 }
});
test('invalid published metadata blocks response before reading private exhibits',async()=>{
 for(const patch of [
  {published_revision:undefined},
  {published_from_draft_revision:0},
  {published_order:'not-an-array'},
  {published_visible_ids:null},
  {published_by:null},
  {published_by:'malformed-owner-id'},
  {published_at:null},
  {published_at:new Date(NaN)},
  {published_at:'yesterday'}
 ]){
  const db=new FakeClient({layout:{...validLayout(),...patch}});
  await assert.rejects(()=>readPublishedMuseumGalleryStage(db));
  assert.equal(db.calls.some(x=>x.sql.includes('museum_public_exhibits')),false);
  assert.equal(db.rollbacks,1);
 }
});
test('an interrupted or absent museum table fails closed, never shows a partial gallery',async()=>{
 const db=new FakeClient({missingMuseum:true});
 await assert.rejects(()=>readPublishedMuseumGalleryStage(db),/does not exist/);
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 assert.equal(db.rollbacks,1);
});
test('moderation errors remain failures even if a published layout row is valid',async()=>{
 const db=new FakeClient();
 db.query=async function(sql,args=[]){
  this.calls.push({sql,args});
  if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')return {command:'BEGIN'};
  if(sql==='ROLLBACK'){this.rollbacks++;return {command:'ROLLBACK'}}
  if(sql.includes('museum_gallery_layout_stage'))return rows([validLayout()]);
  if(sql.includes('gallery_live_overrides'))return null;
  throw Error('Unexpected call');
 };
 await assert.rejects(()=>readPublishedMuseumGalleryStage(db),/MUSEUM_SOURCE_READ_UNVERIFIED/);
 assert.equal(db.rollbacks,1);
});
test('reader is an unexposed, read-only stage component without secrets or API routes',()=>{
 const src=readFileSync(new URL('../museum-gallery-public-read-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(src,/export default|process\.env|INSERT INTO|UPDATE museum|DELETE FROM|@vercel\/blob/);
 assert.equal(config.builds.some(x=>x.src==='museum-gallery-public-read-stage.mjs'),false);
 assert.equal(config.routes.some(x=>x.dest==='/museum-gallery-public-read-stage.mjs'),false);
});
