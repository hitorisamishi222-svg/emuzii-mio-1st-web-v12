import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishMuseumGalleryStage,rollbackMuseumGalleryStage} from '../museum-gallery-publication-stage.mjs';

const owner='11111111-2222-4333-8444-555555555555';
const OP1='11111111111111111111111111111111';
const OP2='22222222222222222222222222222222';
const OP3='33333333333333333333333333333333';
const song={id:'mio-awakening-song',title:'記念曲',category:'音声・楽曲',
 thumbnail:'',hidden:false,deleted:false};
const video={id:'mio-awakening-video',title:'応援動画',category:'動画',
 thumbnail:'/assets/gallery-emuzii-mio-cover.svg',hidden:false,deleted:false};
const hidden={id:'mio-private-work',title:'非公開の絵',category:'イラスト',
 thumbnail:'',hidden:true,deleted:false};
const authoritative=()=>({sourceVerified:true,
 catalog:[{...video},{...song},{...hidden}],
 verifiedApprovedIds:[video.id,song.id]});
const ok=(rows,command='SELECT')=>({command,rowCount:rows.length,rows});
class Mock {
 constructor({failHistory=false,failAudit=false,commitLost=false}={}){
  this.error={failHistory,failAudit,commitLost};
  this.persist={draft_revision:2,draft_order:[video.id,song.id,hidden.id],
   draft_visible_ids:[video.id,song.id],draft_featured_id:video.id,
   published_revision:null,published_from_draft_revision:null,
   published_order:null,published_visible_ids:null,published_featured_id:null,
   history:[],audit:{},legacyGachaData:'protected'};
  this.tx=null;this.calls=[];this.commits=0;this.rollbacks=0;
 }
 async query(sql,args=[]){
  this.calls.push({sql,args});
  if(sql==='BEGIN ISOLATION LEVEL SERIALIZABLE'){if(this.tx)throw Error('already started');this.tx=structuredClone(this.persist);return {command:'BEGIN'}}
  if(!this.tx)throw Error('query outside transaction');
  if(sql==='ROLLBACK'){this.tx=null;this.rollbacks++;return {command:'ROLLBACK'}}
  if(sql==='COMMIT'){
   this.persist=this.tx;this.tx=null;this.commits++;
   if(this.error.commitLost){this.error.commitLost=false;throw Error('lost response after commit')}
   return {command:'COMMIT'};
  }
  if(sql.startsWith('SELECT draft_revision,draft_order,draft_visible_ids,draft_featured_id,')){
   return ok([this.tx]);
  }
  if(sql.startsWith('SELECT actor_id,action,payload_hash,new_revision FROM')){
   const record=this.tx.audit[args[0]];
   return ok(record?[record]:[]);
  }
  if(sql.startsWith('SELECT published_revision FROM museum_gallery_layout_history_stage')){
   const hit=this.tx.history.find(x=>x.published_revision===args[0]);
   return ok(hit?[{published_revision:hit.published_revision}]:[]);
  }
  if(sql.startsWith('SELECT published_revision,source_draft_revision,snapshot_order,')){
   const hit=this.tx.history.find(x=>x.published_revision===args[0]);
   return ok(hit?[hit]:[]);
  }
  if(sql.startsWith('UPDATE museum_gallery_layout_stage SET published_revision=')){
   if(this.tx.draft_revision!==args[6]||(this.tx.published_revision??0)!==args[7])
    return ok([], 'UPDATE');
   Object.assign(this.tx,{published_revision:args[0],published_from_draft_revision:args[1],
    published_order:JSON.parse(args[2]),published_visible_ids:JSON.parse(args[3]),
    published_featured_id:args[4]});
   return ok([{published_revision:String(args[0])}],'UPDATE');
  }
  if(sql.startsWith('INSERT INTO museum_gallery_layout_history_stage')){
   if(this.error.failHistory)throw Error('history insert rejected');
   const row={published_revision:args[0],source_draft_revision:args[1],
    snapshot_order:JSON.parse(args[2]),snapshot_visible_ids:JSON.parse(args[3]),
    snapshot_featured_id:args[4]};
   this.tx.history.push(row);return ok([{published_revision:String(args[0])}],'INSERT');
  }
  if(sql.startsWith('INSERT INTO museum_gallery_layout_audit_stage')){
   if(this.error.failAudit)throw Error('audit insert rejected');
   if(this.tx.audit[args[0]])throw Error('duplicate receipt');
   this.tx.audit[args[0]]={actor_id:args[2],action:args[3],
    payload_hash:args[1],new_revision:String(args[5])};
   return ok([{operation_id:args[0]}],'INSERT');
  }
  throw Error('Unrecognised database call '+sql);
 }
}
const publish=(db,overrides={})=>publishMuseumGalleryStage(db,{
 operationId:OP1,expectedDraftRevision:2,expectedPublishedRevision:0,
 confirmation:'PUBLISH_MIO_GALLERY',
 verifyAdmin:async()=>({user_id:owner,role:'owner'}),
 loadModeratedCatalog:async()=>authoritative(),
 ...overrides
});
const rollback=(db,overrides={})=>rollbackMuseumGalleryStage(db,{
 operationId:OP3,expectedPublishedRevision:2,targetRevision:1,
 confirmation:'RESTORE_MIO_GALLERY',
 verifyAdmin:async()=>({user_id:owner,role:'owner'}),
 loadModeratedCatalog:async()=>authoritative(),
 ...overrides
});
const denied=(fn,code)=>assert.rejects(fn,new RegExp('MUSEUM_STAGE_'+code));
const publishedTwice=async()=>{
 const db=new Mock();
 await publish(db);
 db.persist.draft_revision=3;
 db.persist.draft_order=[song.id,video.id,hidden.id];
 db.persist.draft_visible_ids=[song.id];
 db.persist.draft_featured_id=song.id;
 await publish(db,{operationId:OP2,expectedDraftRevision:3,expectedPublishedRevision:1});
 return db;
};
test('owner can promote approved draft to stage-only publication with versioned snapshot and audit',async()=>{
 const db=new Mock(),result=await publish(db);
 assert.deepEqual(result,{ok:true,replayed:false,revision:1,active:true,publishedToStageOnly:true});
 assert.equal(db.persist.published_revision,1);
 assert.equal(db.persist.published_from_draft_revision,2);
 assert.deepEqual(db.persist.published_visible_ids,[video.id,song.id]);
 assert.equal(db.persist.history.length,1);
 assert.equal(Object.keys(db.persist.audit).length,1);
 assert.equal(db.persist.audit[OP1].payload_hash.length,64);
 assert.equal(db.persist.legacyGachaData,'protected');
 assert.equal(db.commits,1);
 assert.equal(db.calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE');
});
test('stage publish does not overwrite a newer private draft and does not grant external release',async()=>{
 const db=new Mock();
 await denied(()=>publish(db,{expectedDraftRevision:1}),'DRAFT_REVISION_CONFLICT');
 assert.equal(db.persist.published_revision,null);
 assert.deepEqual(db.persist.draft_order,[video.id,song.id,hidden.id]);
 assert.equal(db.rollbacks,1);
});
test('owner must explicitly confirm publication, not just provide an admin session',async()=>{
 const db=new Mock();
 await denied(()=>publish(db,{confirmation:undefined}),'CONFIRMATION_REQUIRED');
 await denied(()=>publish(db,{confirmation:'PUBLISH'}),'CONFIRMATION_REQUIRED');
 assert.equal(db.calls.length,0);
});
test('regular admin, viewer and missing login are rejected before publication',async()=>{
 for(const admin of [null,{user_id:owner,role:'admin'},
  {user_id:owner,role:'viewer'},{user_id:'bad',role:'owner'}]){
  const db=new Mock();
  await denied(()=>publish(db,{verifyAdmin:async()=>admin}),'OWNER_AUTH_REQUIRED');
  assert.equal(db.persist.history.length,0);
  assert.equal(db.persist.published_revision,null);
 }
});
test('saving new layout never silently overwrites a newer published snapshot',async()=>{
 const db=new Mock();await publish(db);
 await denied(()=>publish(db,{operationId:OP2,expectedPublishedRevision:0}),'PUBLISHED_REVISION_CONFLICT');
 assert.equal(db.persist.published_revision,1);
});
test('the same operation ID and owner can resolve an uncertain commit without a second history entry',async()=>{
 const db=new Mock({commitLost:true});
 await denied(()=>publish(db),'COMMIT_UNCONFIRMED');
 assert.equal(db.persist.history.length,1);
 assert.equal(db.persist.published_revision,1);
 const replay=await publish(db);
 assert.deepEqual(replay,{ok:true,replayed:true,revision:1,active:true,publishedToStageOnly:true});
 assert.equal(db.persist.history.length,1);
 assert.equal(Object.keys(db.persist.audit).length,1);
});
test('replay after a later publication acknowledges the old receipt but never calls it active',async()=>{
 const db=await publishedTwice();
 assert.equal(db.persist.published_revision,2);
 const replay=await publish(db);
 assert.deepEqual(replay,{ok:true,replayed:true,revision:1,active:false,publishedToStageOnly:true});
});
test('reuse of operation ID with changed payload or actor is rejected',async()=>{
 const db=new Mock();await publish(db);
 await denied(()=>publish(db,{expectedDraftRevision:4}),'OPERATION_CONFLICT');
 await denied(()=>publish(db,{verifyAdmin:async()=>({
  user_id:'99999999-9999-4999-8999-999999999999',role:'owner'
 })}),'OPERATION_CONFLICT');
 assert.equal(db.persist.history.length,1);
});
test('later hidden or deleted status blocks publication even if a saved draft previously listed it',async()=>{
 for(const edited of [{...video,hidden:true},{...song,deleted:true}]){
  const db=new Mock();
  const data=authoritative();data.catalog=data.catalog.map(x=>x.id===edited.id?edited:x);
  await assert.rejects(()=>publish(db,{loadModeratedCatalog:async()=>data}),
   /MUSEUM_PLAN_VISIBILITY_UNAPPROVED/);
  assert.equal(db.persist.history.length,0);
  assert.equal(db.persist.published_revision,null);
 }
});
test('source metadata must be server-confirmed for publish and rollback',async()=>{
 const db=await publishedTwice();
 await denied(()=>rollback(db,{loadModeratedCatalog:async()=>({
  ...authoritative(),sourceVerified:false
 })}),'MODERATION_SOURCE_UNVERIFIED');
 assert.equal(db.persist.published_revision,2);
});
test('a later draft revision can be published, retaining the earlier snapshot in history',async()=>{
 const db=await publishedTwice();
 assert.equal(db.persist.published_revision,2);
 assert.deepEqual(db.persist.history.map(x=>x.snapshot_featured_id),[video.id,song.id]);
 assert.equal(db.persist.draft_revision,3);
 assert.equal(db.persist.history[0].source_draft_revision,2);
 assert.equal(db.persist.history[1].source_draft_revision,3);
});
test('a rollback restores a historical snapshot as a NEW publication revision',async()=>{
 const db=await publishedTwice();
 const result=await rollback(db);
 assert.deepEqual(result,{ok:true,replayed:false,revision:3,active:true,publishedToStageOnly:true});
 assert.equal(db.persist.published_revision,3);
 assert.deepEqual(db.persist.published_order,[video.id,song.id,hidden.id]);
 assert.deepEqual(db.persist.published_visible_ids,[video.id,song.id]);
 assert.equal(db.persist.published_featured_id,video.id);
 assert.equal(db.persist.history.length,3);
 assert.equal(db.persist.history[2].source_draft_revision,2);
 assert.equal(db.persist.audit[OP3].action,'rollback');
 assert.equal(db.persist.draft_revision,3,'restoring public snapshot must not change drafts');
});
test('rollback does not restore a work whose rights were revoked',async()=>{
 const db=await publishedTwice(),source=authoritative();
 source.catalog=source.catalog.map(x=>x.id===video.id?{...x,deleted:true}:x);
 await assert.rejects(()=>rollback(db,{loadModeratedCatalog:async()=>source}),
  /MUSEUM_PLAN_VISIBILITY_UNAPPROVED/);
 assert.equal(db.persist.published_revision,2);
 assert.equal(db.persist.history.length,2);
});
test('rollback cannot target a missing, current or future version',async()=>{
 const db=await publishedTwice();
 await denied(()=>rollback(db,{targetRevision:2}),'HISTORY_REVISION_INVALID');
 await denied(()=>rollback(db,{targetRevision:3}),'HISTORY_REVISION_INVALID');
 await denied(()=>rollback(db,{targetRevision:0}),'HISTORY_REVISION_INVALID');
 assert.equal(db.persist.history.length,2);
});
test('rollback rejects outdated expected version even with an existing history entry',async()=>{
 const db=await publishedTwice();
 await denied(()=>rollback(db,{expectedPublishedRevision:1}),'PUBLISHED_REVISION_CONFLICT');
 assert.equal(db.persist.published_revision,2);
});
test('history write failure aborts the published pointer and leaves the private draft unchanged',async()=>{
 const db=new Mock({failHistory:true});
 await assert.rejects(()=>publish(db),/history insert rejected/);
 assert.equal(db.persist.published_revision,null);
 assert.equal(db.persist.history.length,0);
 assert.equal(db.persist.audit[OP1],undefined);
 assert.equal(db.persist.draft_revision,2);
 assert.equal(db.rollbacks,1);
});
test('audit write failure rolls back both public snapshot and history',async()=>{
 const db=new Mock({failAudit:true});
 await assert.rejects(()=>publish(db),/audit insert rejected/);
 assert.equal(db.persist.published_revision,null);
 assert.equal(db.persist.history.length,0);
 assert.equal(db.persist.audit[OP1],undefined);
 assert.equal(db.rollbacks,1);
});
test('same rollback operation ID is replayed at most once',async()=>{
 const db=await publishedTwice();await rollback(db);
 const repeat=await rollback(db);
 assert.equal(repeat.replayed,true);
 assert.equal(repeat.active,true);
 assert.equal(repeat.revision,3);
 assert.equal(db.persist.history.length,3);
});
test('failing login cannot cause a history update or even reach a staged snapshot query',async()=>{
 const db=new Mock();
 await denied(()=>publish(db,{verifyAdmin:async()=>null}),'OWNER_AUTH_REQUIRED');
 assert.equal(db.calls.some(c=>c.sql.includes('museum_gallery_layout_stage WHERE')),false);
 assert.equal(db.persist.history.length,0);
});
test('unpublished stage module cannot be used as a public HTTP route',()=>{
 const source=readFileSync(new URL('../museum-gallery-publication-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(source,/export default|process\.env|@vercel\/blob|GALLERY_DATABASE_URL|fetch\s*\(/);
 assert.equal(config.routes.some(x=>x.src==='/api/museum/publish'),false);
 assert.equal(config.routes.some(x=>x.dest==='/museum-gallery-publication-stage.mjs'),false);
 assert.equal(config.builds.some(x=>x.src==='museum-gallery-publication-stage.mjs'),false);
});
