import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saveMuseumGalleryDraft} from '../museum-gallery-draft-store.mjs';

const ID='11111111-2222-4333-8444-555555555555';
const OP='0123456789abcdef0123456789abcdef';
const otherOp='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const song={id:'mio-awakening-song',title:'記念曲',creator:'えむじー',category:'音声・楽曲',
 description:'掲載承認済み',url:'/mio-awakening.mp3',thumbnail:'',hidden:false,deleted:false};
const video={id:'mio-awakening-video',title:'動画',creator:'えむじー',category:'動画',
 description:'',url:'https://vt.tiktok.com/ZSgFvmy7Q/',
 thumbnail:'/assets/gallery-emuzii-mio-cover.svg',hidden:false,deleted:false};
const hidden={id:'mio-hidden-work',title:'停止作品',creator:'管理者',category:'イラスト',
 description:'',url:'https://example.com/',thumbnail:'',hidden:true,deleted:false};
const proposed=(revision=0)=>({
 expectedRevision:revision,order:[video.id,song.id,hidden.id],
 visibleIds:[video.id,song.id],featuredId:video.id
});
const source=()=>({catalog:[{...song},{...video},{...hidden}],
 verifiedApprovedIds:[song.id,video.id]});
const admin=()=>({user_id:ID,role:'owner'});
const success=(rows,command='SELECT')=>({command,rowCount:rows.length,rows});
class MockClient {
 constructor(options={}){
  this.options={...options};this.persist={initialized:false,revision:0,order:[],visibleIds:[],
   featuredId:null,audit:{},publishedMarker:'legacy-live-layout-unchanged'};
  this.tx=null;this.calls=[];this.commitCount=0;this.rollbackCount=0;
 }
 async query(sql,args=[]){
  this.calls.push({sql,args});
  if(sql==='BEGIN'){
   if(this.tx)throw Error('already in tx');
   this.tx=structuredClone(this.persist);
   return {command:'BEGIN'};
  }
  if(!this.tx)throw Error('query outside dedicated transaction');
  if(sql==='ROLLBACK'){
   this.tx=null;this.rollbackCount++;
   return {command:'ROLLBACK'};
  }
  if(sql==='COMMIT'){
   this.persist=this.tx;this.tx=null;this.commitCount++;
   if(this.options.commitAckLost){
    this.options.commitAckLost=false;throw Error('connection lost after commit');
   }
   return {command:'COMMIT'};
  }
  if(sql.startsWith('INSERT INTO museum_gallery_layout_stage(layout_key)')){
   const existed=this.tx.initialized;this.tx.initialized=true;
   return {command:'INSERT',rowCount:existed?0:1};
  }
  if(sql.includes('SELECT draft_revision FROM museum_gallery_layout_stage')){
   return success([{draft_revision:String(this.tx.revision)}]);
  }
  if(sql.includes('SELECT actor_id,action,payload_hash,new_revision')){
   const item=this.tx.audit[args[0]];
   return success(item?[{...item}]:[]);
  }
  if(sql.startsWith('UPDATE museum_gallery_layout_stage SET draft_revision=')){
   if(this.options.failUpdate)throw Error('mock update failed');
   if(this.tx.revision!==args[5])return success([], 'UPDATE');
   this.tx.revision=args[0];
   this.tx.order=JSON.parse(args[1]);this.tx.visibleIds=JSON.parse(args[2]);
   this.tx.featuredId=args[3];
   return success([{draft_revision:String(args[0])}],'UPDATE');
  }
  if(sql.startsWith('INSERT INTO museum_gallery_layout_audit_stage')){
   if(this.options.failAudit)throw Error('mock audit failed');
   if(this.tx.audit[args[0]])throw Error('duplicate operation');
   this.tx.audit[args[0]]={actor_id:args[2],action:'draft',
    payload_hash:args[1],new_revision:String(args[4])};
   return success([{operation_id:args[0]}],'INSERT');
  }
  throw Error('Unknown or unsafe SQL: '+sql);
 }
}
const ctx=(db,{operationId=OP,proposal=proposed(),verifyAdmin=async()=>admin(),
 loadModeratedCatalog=async()=>source(),request={headers:{}}}={})=>
 saveMuseumGalleryDraft(db,{operationId,proposal,verifyAdmin,loadModeratedCatalog,request});
const rejected=async(run,code)=>assert.rejects(run,new RegExp('MUSEUM_DRAFT_'+code));

test('a verified operator can store a private draft, with audit, without changing the published snapshot',async()=>{
 const db=new MockClient();
 const result=await ctx(db);
 assert.deepEqual(result,{ok:true,replayed:false,revision:1,published:false});
 assert.deepEqual(db.persist.order,[video.id,song.id,hidden.id]);
 assert.deepEqual(db.persist.visibleIds,[video.id,song.id]);
 assert.equal(db.persist.featuredId,video.id);
 assert.equal(db.persist.publishedMarker,'legacy-live-layout-unchanged');
 assert.equal(Object.keys(db.persist.audit).length,1);
 assert.equal(db.persist.audit[OP].payload_hash.length,64);
 assert.equal(db.rollbackCount,0);
 assert.equal(db.commitCount,1);
});
test('separate revisions prevent stale edits from clobbering the current draft',async()=>{
 const db=new MockClient();await ctx(db);
 await rejected(()=>ctx(db,{operationId:otherOp,proposal:proposed(0)}),'REVISION_CONFLICT');
 assert.equal(db.persist.revision,1);
 assert.equal(Object.keys(db.persist.audit).length,1);
 assert.equal(db.rollbackCount,1);
});
test('same actor, operation and payload may be replayed without double applying',async()=>{
 const db=new MockClient();await ctx(db);
 const again=await ctx(db);
 assert.deepEqual(again,{ok:true,replayed:true,revision:1,published:false});
 assert.equal(db.persist.revision,1);
 assert.equal(Object.keys(db.persist.audit).length,1);
 assert.equal(db.commitCount,2);
});
test('same operation ID with different payload is rejected',async()=>{
 const db=new MockClient();await ctx(db);
 const changed={...proposed(),featuredId:null};
 await rejected(()=>ctx(db,{proposal:changed}),'OPERATION_CONFLICT');
 assert.equal(db.persist.featuredId,video.id);
 assert.equal(db.persist.revision,1);
});
test('same operation ID from a different authenticated owner is rejected',async()=>{
 const db=new MockClient();await ctx(db);
 await rejected(()=>ctx(db,{verifyAdmin:async()=>({
  user_id:'99999999-9999-4999-8999-999999999999',role:'owner'
 })}),'OPERATION_CONFLICT');
 assert.equal(db.persist.revision,1);
});
test('lost COMMIT acknowledgement never claims success; retry resolves by audit ID',async()=>{
 const db=new MockClient({commitAckLost:true});
 await rejected(()=>ctx(db),'COMMIT_UNCONFIRMED');
 assert.equal(db.persist.revision,1);
 assert.equal(Object.keys(db.persist.audit).length,1);
 const result=await ctx(db);
 assert.deepEqual(result,{ok:true,replayed:true,revision:1,published:false});
});
test('an audit write failure rolls back the pending draft changes',async()=>{
 const db=new MockClient({failAudit:true});
 await assert.rejects(()=>ctx(db),/mock audit failed/);
 assert.equal(db.persist.initialized,false);
 assert.equal(db.persist.revision,0);
 assert.equal(Object.keys(db.persist.audit).length,0);
 assert.equal(db.rollbackCount,1);
});
test('an UPDATE failure cannot leave a half-written draft',async()=>{
 const db=new MockClient({failUpdate:true});
 await assert.rejects(()=>ctx(db),/mock update failed/);
 assert.equal(db.persist.initialized,false);
 assert.equal(db.persist.revision,0);
 assert.equal(db.rollbackCount,1);
});
test('missing operator authentication blocks even layout-row creation',async()=>{
 for(const value of [null,{user_id:ID,role:'viewer'},
  {user_id:'invalid',role:'owner'}]){
  const db=new MockClient();
  await rejected(()=>ctx(db,{verifyAdmin:async()=>value}),'ADMIN_AUTH_REQUIRED');
  assert.equal(db.persist.initialized,false);
  assert.equal(db.calls.some(x=>x.sql.startsWith('INSERT INTO museum_gallery_layout_stage')),false);
 }
});
test('unverified catalog source cannot be persisted',async()=>{
 const db=new MockClient();
 await rejected(()=>ctx(db,{loadModeratedCatalog:async()=>null}),'CATALOG_SOURCE_UNVERIFIED');
 assert.equal(db.persist.revision,0);
 assert.equal(db.rollbackCount,1);
});
test('takedown and unapproved gallery work cannot be included in draft visibility',async()=>{
 const db=new MockClient();
 await assert.rejects(()=>ctx(db,{proposal:{...proposed(),visibleIds:[song.id,hidden.id]}}),
  /MUSEUM_PLAN_VISIBILITY_UNAPPROVED/);
 assert.equal(db.persist.revision,0);
 await assert.rejects(()=>ctx(db,{loadModeratedCatalog:async()=>({
  ...source(),verifiedApprovedIds:[song.id]
 })}),/MUSEUM_PLAN_VISIBILITY_UNAPPROVED/);
 assert.equal(db.persist.revision,0);
});
test('unverified raw caller payload is never used as an approval source',async()=>{
 const db=new MockClient();
 const request={body:{verifiedApprovedIds:[song.id,video.id,hidden.id],
  role:'owner',session:'forged',published:true}};
 await rejected(()=>ctx(db,{request,loadModeratedCatalog:async()=>null}),
  'CATALOG_SOURCE_UNVERIFIED');
 assert.equal(db.persist.revision,0);
});
test('input shape, operation ID, and missing dedicated verifier fail before starting transaction',async()=>{
 const db=new MockClient();
 await rejected(()=>ctx(db,{operationId:'bad'}),'OPERATION_ID_INVALID');
 await rejected(()=>ctx(db,{proposal:{...proposed(),expectedRevision:-1}}),'REVISION_INVALID');
 await rejected(()=>ctx(db,{verifyAdmin:null}),'VERIFIER_REQUIRED');
 assert.equal(db.calls.length,0);
 await rejected(()=>saveMuseumGalleryDraft({query:undefined},{operationId:OP,
  verifyAdmin:async()=>admin(),loadModeratedCatalog:async()=>source(),proposal:proposed()}),
  'DEDICATED_CLIENT_REQUIRED');
});
test('no database path may promote public publication fields or mutate legacy work tables',async()=>{
 const db=new MockClient();await ctx(db);
 const sql=db.calls.map(x=>x.sql).join('\n');
 assert.doesNotMatch(sql,/SET published_|UPDATE gallery_live_overrides|FROM mio_|TRUNCATE|DROP TABLE|DELETE FROM/i);
 assert.equal(db.persist.publishedMarker,'legacy-live-layout-unchanged');
});
test('draft module is not an HTTP handler nor connected to production routes or secrets',()=>{
 const sourceText=readFileSync(new URL('../museum-gallery-draft-store.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(sourceText,/export default|process\.env|BLOB_READ_WRITE_TOKEN|console\.log/i);
 assert.match(sourceText,/This saves a PRIVATE draft only/);
 assert.equal(config.routes.some(x=>x.dest==='/museum-gallery-draft-store.mjs'),false);
 assert.equal(config.builds.some(x=>x.src==='museum-gallery-draft-store.mjs'),false);
});
