import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadMuseumModeratedCatalogStage} from '../museum-gallery-source-stage.mjs';
import {planMuseumCuration} from '../museum-curation-plan.mjs';
import {projectPublishedMuseumGallery} from '../museum-gallery-published-core.mjs';
import {approvedGalleryItems} from '../gallery-items.js';
import {captureMuseumReviewHashes,selectCurrentlyReviewedMuseumIds} from '../museum-gallery-review-hashes-stage.mjs';

const ID='a4ad9cb3-153d-4fc4-aaea-1342965d14c2';
const DRAFT_ID='102ecf25-1c7c-4a0c-92fb-01b8e394d673';
const NEW='museum-'+ID;
const DRAFT='museum-'+DRAFT_ID;
const SRC=()=>[
 {id:ID,kind:'icons',title:'公開済みの架空イラスト',description:'展示説明',
  credit:'権利確認済',image_url:'/assets/gallery-emuzii-mio-cover.svg',external_url:'',
  status:'published',revision:1,updated_at:new Date('2026-11-01T01:00:00Z'),
  rights_checked_at:new Date('2026-11-01T00:00:00Z'),
  privacy_checked_at:new Date('2026-11-01T00:00:00Z'),
  reviewed_by:'11111111-2222-4333-8444-555555555555',
  published_at:new Date('2026-11-01T00:00:00Z')},
 {id:DRAFT_ID,kind:'moments',title:'未承認の思い出画像',description:'非公開',
  credit:'非公開の作成者',image_url:'/assets/gallery-emuzii-mio-cover.svg',external_url:'',
  status:'draft',revision:0,updated_at:new Date('2026-11-01T01:00:00Z'),
  rights_checked_at:null,privacy_checked_at:null,
  reviewed_by:null}
];
const success=(rows)=>({command:'SELECT',rowCount:rows.length,rows});
function fake({overrides=[],exhibits=SRC(),errorAt=null}={}){
 return {queries:[],async query(sql,args){
  this.queries.push({sql,args});
  if(this.queries.length===errorAt)throw Error('unavailable museum database');
  if(sql.includes('gallery_live_overrides'))return success(overrides);
  if(sql.includes('museum_public_exhibits'))return success(exhibits);
  throw Error('Unexpected SQL');
 }};
}
const deny=(run,code)=>assert.rejects(run,new RegExp('MUSEUM_SOURCE_'+code));
test('published museum exhibits join reviewed legacy works without altering legacy entries',async()=>{
 const before=structuredClone(approvedGalleryItems);
 const db=fake(),result=await loadMuseumModeratedCatalogStage(db);
 assert.equal(result.sourceVerified,true);
 assert.equal(db.queries.length,2);
 assert.equal(db.queries[0].sql.includes('FOR SHARE'),false,'public read must not lock rows');
 assert.equal(db.queries[0].args[0].length,2);
 assert.ok(result.verifiedApprovedIds.includes(NEW));
 assert.ok(!result.verifiedApprovedIds.includes(DRAFT));
 assert.equal(result.catalog.length,4);
 assert.equal(result.catalog.find(x=>x.id===DRAFT).hidden,true);
 assert.equal(result.catalog.find(x=>x.id===DRAFT).room,'moments');
 assert.equal(result.catalog.find(x=>x.id===NEW).hidden,false);
 assert.equal(result.catalog.find(x=>x.id===NEW).room,'icons');
 assert.equal(result.catalog.find(x=>x.id==='mio-awakening-song').room,'gallery');
 assert.deepEqual(approvedGalleryItems,before);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.catalog),true);
 assert.equal(Object.keys(result.currentReviewHashes).length,3);
 assert.equal(result.currentReviewHashes[NEW].length,64);
 assert.equal(result.currentReviewHashes[DRAFT],undefined);
});
test('authoritative source and public projection keep private drafts invisible after museum publication',async()=>{
 const source=await loadMuseumModeratedCatalogStage(fake());
 const publishedLayout={
  revision:2,order:[NEW,...approvedGalleryItems.map(x=>x.id),DRAFT],
  visibleIds:[NEW],featuredId:NEW
 };
 const visible=projectPublishedMuseumGallery({
  authoritativeCatalog:source.catalog,verifiedApprovedIds:source.verifiedApprovedIds,
  sourceVerified:source.sourceVerified,publishedLayout
 });
 assert.deepEqual(visible.items.map(x=>x.id),[NEW]);
 assert.equal(JSON.stringify(visible).includes('未承認の思い出画像'),false);
 const exhibits=SRC();exhibits[0].status='hidden';
 const after=await loadMuseumModeratedCatalogStage(fake({exhibits}));
 const removed=projectPublishedMuseumGallery({
  authoritativeCatalog:after.catalog,verifiedApprovedIds:after.verifiedApprovedIds,
  sourceVerified:after.sourceVerified,publishedLayout
 });
 assert.deepEqual(removed.items,[]);
 assert.equal(removed.revision,2);
});
test('a serializable management transaction may request FOR SHARE on moderation rows',async()=>{
 const db=fake();
 await loadMuseumModeratedCatalogStage(db,{lockModeration:true});
 assert.ok(db.queries[0].sql.endsWith('FOR SHARE'));
 assert.equal(db.queries[0].args[0].length,2);
 assert.equal(db.queries[1].sql.includes('FOR SHARE'),false);
});
test('invalid locking options are rejected before touching a database',async()=>{
 const db=fake();
 await deny(()=>loadMuseumModeratedCatalogStage(db,{lockModeration:'yes'}),'LOCK_MODE_INVALID');
 assert.equal(db.queries.length,0);
});
test('moderator takedown on an existing song wins over its checked-in allowlist',async()=>{
 const id='mio-awakening-song',db=fake({
  overrides:[{item_id:id,hidden:true,deleted:false,
   title:null,creator:null,description:null,category:null,
   external_url:null,thumbnail_url:null}]
 });
 const result=await loadMuseumModeratedCatalogStage(db);
 assert.equal(result.catalog.find(i=>i.id===id).hidden,true);
 const proposal={
  expectedRevision:0,order:result.catalog.map(i=>i.id),
  visibleIds:[id],featuredId:id
 };
 assert.throws(()=>planMuseumCuration({
  catalog:result.catalog,verifiedApprovedIds:result.verifiedApprovedIds,
  currentRevision:0,proposal
 }),/MUSEUM_PLAN_VISIBILITY_UNAPPROVED/);
});
test('unapproved museum metadata stays private even in the intermediate server-side catalog',async()=>{
 const exhibits=SRC();
 const secret='PRIVATE_NOT_FOR_VISITORS_4863';
 exhibits[1].title=secret;
 exhibits[1].description=secret;
 exhibits[1].credit=secret;
 exhibits[1].external_url='https://example.com/'+secret;
 const original=structuredClone(exhibits);
 const result=await loadMuseumModeratedCatalogStage(fake({exhibits}));
 const privateItem=result.catalog.find(x=>x.id===DRAFT);
 assert.equal(privateItem.hidden,true);
 assert.equal(privateItem.title,'非公開の展示');
 assert.equal(privateItem.creator,'翠央記念館');
 assert.equal(privateItem.url,'');
 assert.equal(privateItem.thumbnail,'');
 assert.equal(privateItem.description,'');
 assert.equal(JSON.stringify(result).includes(secret),false);
 assert.deepEqual(exhibits,original,'redaction must not mutate or delete the saved original');
});
test('a hidden legacy override cannot leak a staged private title or URL',async()=>{
 const secret='PRIVATE_LEGACY_OVERRIDE_7639';
 const result=await loadMuseumModeratedCatalogStage(fake({overrides:[{
  item_id:'mio-awakening-video',hidden:true,deleted:false,
  title:secret,creator:secret,description:secret,category:null,
  external_url:'https://example.com/'+secret,thumbnail_url:null
 }]}));
 const item=result.catalog.find(x=>x.id==='mio-awakening-video');
 assert.equal(item.hidden,true);
 assert.equal(item.title,'非公開の展示');
 assert.equal(item.url,'');
 assert.equal(item.description,'');
 assert.equal(JSON.stringify(result).includes(secret),false);
});
test('an approved future fan-art exhibit may be assigned to the primary gallery room',async()=>{
 const exhibits=SRC();
 exhibits[0].kind='gallery';
 const report=await loadMuseumModeratedCatalogStage(fake({exhibits}));
 const art=report.catalog.find(x=>x.id===NEW);
 assert.equal(art.room,'gallery');
 assert.equal(art.category,'ギャラリー');
 assert.equal(art.hidden,false);
 assert.ok(report.verifiedApprovedIds.includes(NEW));
 const projection=projectPublishedMuseumGallery({
  authoritativeCatalog:report.catalog,
  verifiedApprovedIds:report.verifiedApprovedIds,
  sourceVerified:report.sourceVerified,
  publishedLayout:{revision:2,order:[NEW],visibleIds:[NEW],featuredId:NEW}
 });
 assert.equal(projection.items[0].room,'gallery');
});
test('hidden exhibit metadata is still redacted when room allocation is retained',async()=>{
 const result=await loadMuseumModeratedCatalogStage(fake());
 const hidden=result.catalog.find(x=>x.id===DRAFT);
 assert.equal(hidden.room,'moments');
 assert.equal(hidden.title,'非公開の展示');
 assert.equal(hidden.url,'');
 assert.equal(hidden.thumbnail,'');
 assert.ok(!result.verifiedApprovedIds.includes(DRAFT));
});
test('legacy gallery hide and later reapproval cannot reuse the old publication proof',async()=>{
 const id='mio-awakening-song';
 const makeOverride=(when,hidden)=>({
  item_id:id,title:null,creator:null,description:null,category:null,
  external_url:null,thumbnail_url:null,hidden,deleted:false,
  revision:when.includes('11-03')?3:when.includes('11-02')?2:1,
  updated_at:new Date(when)
 });
 const first=await loadMuseumModeratedCatalogStage(fake({
  overrides:[makeOverride('2026-11-01T00:00:00Z',false)]
 }));
 const approved=captureMuseumReviewHashes({
  visibleIds:[id],currentReviewHashes:first.currentReviewHashes
 });
 const hidden=await loadMuseumModeratedCatalogStage(fake({
  overrides:[makeOverride('2026-11-02T00:00:00Z',true)]
 }));
 assert.equal(hidden.currentReviewHashes[id],undefined);
 assert.deepEqual(selectCurrentlyReviewedMuseumIds({
  visibleIds:[id],publishedReviewHashes:approved,
  currentReviewHashes:hidden.currentReviewHashes
 }),[]);
 const newApproval=await loadMuseumModeratedCatalogStage(fake({
  overrides:[makeOverride('2026-11-03T00:00:00Z',false)]
 }));
 assert.notEqual(newApproval.currentReviewHashes[id],first.currentReviewHashes[id]);
 assert.deepEqual(selectCurrentlyReviewedMuseumIds({
  visibleIds:[id],publishedReviewHashes:approved,
  currentReviewHashes:newApproval.currentReviewHashes
 }),[]);
 const newSnapshot=captureMuseumReviewHashes({
  visibleIds:[id],currentReviewHashes:newApproval.currentReviewHashes
 });
 assert.deepEqual(selectCurrentlyReviewedMuseumIds({
  visibleIds:[id],publishedReviewHashes:newSnapshot,
  currentReviewHashes:newApproval.currentReviewHashes
 }),[id]);
});
test('published museum exhibit re-review creates a new approval proof, not a historical grant',async()=>{
 const first=await loadMuseumModeratedCatalogStage(fake());
 const edited=SRC();
 edited[0].revision++;
 edited[0].updated_at=new Date('2026-11-03T09:00:00Z');
 const next=await loadMuseumModeratedCatalogStage(fake({exhibits:edited}));
 assert.notEqual(first.currentReviewHashes[NEW],next.currentReviewHashes[NEW]);
 const snapshot=captureMuseumReviewHashes({
  visibleIds:[NEW],currentReviewHashes:first.currentReviewHashes
 });
 assert.deepEqual(selectCurrentlyReviewedMuseumIds({
  visibleIds:[NEW],publishedReviewHashes:snapshot,
  currentReviewHashes:next.currentReviewHashes
 }),[]);
});
test('historical trash and drafts remain non-public but retain stable catalog IDs',async()=>{
 const exhibits=SRC();exhibits[1].status='trash';
 const result=await loadMuseumModeratedCatalogStage(fake({exhibits}));
 assert.equal(result.catalog.find(i=>i.id===DRAFT).deleted,true);
 assert.equal(result.catalog.find(i=>i.id===DRAFT).hidden,true);
 assert.equal(result.verifiedApprovedIds.includes(DRAFT),false);
});
test('reviewed-by UUID and both rights checks are mandatory for a published exhibit',async()=>{
 for(const key of ['rights_checked_at','privacy_checked_at','reviewed_by','published_at']){
  const rows=SRC();rows[0][key]=null;
  await deny(()=>loadMuseumModeratedCatalogStage(fake({exhibits:rows})),'EXHIBIT_REVIEW_UNVERIFIED');
 }
});
test('invalid hidden/deleted data does not silently become a visible work',async()=>{
 for(const invalid of [null,'false',undefined,1]){
  const overrides=[{item_id:'mio-awakening-song',hidden:invalid,deleted:false}];
  await deny(()=>loadMuseumModeratedCatalogStage(fake({overrides})),'OVERRIDE_INVALID');
 }
});
test('unknown override IDs and duplicate museum IDs are refused',async()=>{
 await deny(()=>loadMuseumModeratedCatalogStage(fake({
  overrides:[{item_id:'unknown-gallery-entry',hidden:false,deleted:false}]
 })),'OVERRIDE_INVALID');
 const e=SRC();e[1].id=e[0].id;
 await deny(()=>loadMuseumModeratedCatalogStage(fake({exhibits:e})),'EXHIBIT_DUPLICATE');
});
test('database query faults never fall back to unverified static content',async()=>{
 for(const errorAt of [1,2]){
  await assert.rejects(()=>loadMuseumModeratedCatalogStage(fake({errorAt})),
   /unavailable museum database/);
 }
 const bad=fake();
 bad.query=async()=>({command:'SELECT',rowCount:2,rows:[]});
 await deny(()=>loadMuseumModeratedCatalogStage(bad),'READ_UNVERIFIED');
});
test('inconsistent museum exhibit schema is rejected, never coerced to approval',async()=>{
 for(const patch of [
  {status:'unexpected'}, {kind:'private'}, {id:'bad'},
  {image_url:'\u0000bad'}, {title:''}, {description:null}
 ]){
  const rows=SRC();Object.assign(rows[0],patch);
  await deny(()=>loadMuseumModeratedCatalogStage(fake({exhibits:rows})),'EXHIBIT_INVALID');
 }
});
test('server-only catalog bridge never sends cookies or performs writes',()=>{
 const text=readFileSync(new URL('../museum-gallery-source-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(text,/INSERT INTO|UPDATE gallery_|DELETE FROM|DROP TABLE|TRUNCATE|process\.env|document\.cookie|fetch\s*\(/);
 assert.equal(config.builds.some(x=>x.src==='museum-gallery-source-stage.mjs'),false);
 assert.equal(config.routes.some(x=>x.dest==='/museum-gallery-source-stage.mjs'),false);
});
