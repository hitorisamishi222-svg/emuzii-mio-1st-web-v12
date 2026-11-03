import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readPublishedMuseumGalleryStage} from '../museum-gallery-public-read-stage.mjs';

const museumId='e4b063d0-a393-4d15-b653-c2243e38c6a8';
const id='museum-'+museumId;
const validLayout=()=>({
 published_revision:'3',published_from_draft_revision:'2',
 published_order:[id,'mio-awakening-video','mio-awakening-song'],
 published_visible_ids:[id,'mio-awakening-video','mio-awakening-song'],
 published_featured_id:id,
 published_by:'11111111-2222-4333-8444-555555555555',
 published_at:new Date('2026-11-03T08:00:00Z')
});
const exhibit=()=>({
 id:museumId,kind:'icons',title:'承認済みイラスト',
 description:'ミュージアム展示',credit:'公認クリエイター',
 image_url:'/assets/gallery-emuzii-mio-cover.svg',
 external_url:'',status:'published',
 rights_checked_at:new Date('2026-11-02T08:00:00Z'),
 privacy_checked_at:new Date('2026-11-02T09:00:00Z'),
 published_at:new Date('2026-11-03T08:00:00Z'),
 reviewed_by:'11111111-2222-4333-8444-555555555555'
});
const rows=entries=>({command:'SELECT',rowCount:entries.length,rows:entries});
class FakeClient{
 constructor({layout=validLayout(),overrides=[],exhibits=[exhibit()],missingMuseum=false}={}){
  this.layout=layout;this.overrides=overrides;this.exhibits=exhibits;
  this.missingMuseum=missingMuseum;this.calls=[];this.rollbacks=0;
 }
 async query(sql,args=[]){
  this.calls.push({sql,args});
  if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')return {command:'BEGIN'};
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
test('no published layout never falls back to static gallery',async()=>{
 for(const layout of [null,{
  published_revision:null,published_from_draft_revision:null,
  published_order:null,published_visible_ids:null,published_featured_id:null,
  published_by:null,published_at:null
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
