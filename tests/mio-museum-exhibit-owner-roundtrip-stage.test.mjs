import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {saveAndVerifyMuseumOwnerDraftStage as roundtrip} from '../museum-exhibit-owner-roundtrip-stage.mjs';

const OWNER='11111111-2222-4333-8444-555555555555';
const DEVICE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const WORK='44444444-4444-4444-8444-444444444444';
const OP='0123456789abcdef0123456789abcdef';
const OP2='abcdef0123456789abcdef0123456789';
const SESSION='s'.repeat(44),DEVICE_COOKIE='d'.repeat(44);
const sha=s=>createHash('sha256').update(s).digest('hex');
const request=()=>({method:'POST',headers:{
 host:'emuzii-mio-1st-web-v12.vercel.app',
 origin:'https://emuzii-mio-1st-web-v12.vercel.app',
 'content-type':'application/json; charset=utf-8',
 cookie:'mio_gallery_session='+SESSION+'; mio_gallery_device='+DEVICE_COOKIE
}});
const proof=()=>({
 identityVerified:true,schemaReady:true,sourceReady:true,layoutReady:true,
 previewEnvScopeVerified:true,backupVerified:true,ownerApproved:true
});
const fields=()=>({
 room:'icons',category:'イラスト',title:'架空の下書き',
 description:'架空の説明',credit:'架空の作者',
 occurredOn:'2026-11-05',externalUrl:'https://example.org/fictional'
});
const full=()=>({
 kind:'moments',category:'音声・楽曲',title:'架空の楽曲',
 description:'公開前の架空展示',credit:'架空の作者',
 occurredOn:'2026-11-05',
 imageUrl:'/assets/gallery-emuzii-mio-cover.svg',
 externalUrl:'https://example.org/fictional'
});
const sqlRows=(rows,command='SELECT')=>({rows,rowCount:rows.length,command});
function fixture(options={}){
 const state={
  calls:[],connections:[],releases:[],
  works:{},receipts:{},countCreates:0,
  commits:0,readbacks:0,legacyAttendance:'unchanged',gacha:'unchanged',
  failAck:!!options.failAck,failRead:!!options.failRead,
  afterWrite:options.afterWrite||null
 };
 const pool={
  get query(){throw Error('POOL_QUERY_BYPASS')},
  async connect(){
   const client={
    active:null,readonly:false,mutated:false,
    async query(sql,args=[]){
     state.calls.push({sql,args,connection:state.connections.length});
     if(sql==='BEGIN ISOLATION LEVEL SERIALIZABLE'||
        sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'){
      assert.equal(this.active,null);
      this.readonly=sql.includes('READ ONLY');
      this.mutated=false;
      this.active=structuredClone({works:state.works,receipts:state.receipts,countCreates:state.countCreates});
      return {command:'BEGIN'};
     }
     if(sql==='ROLLBACK'){
      this.active=null;return {command:'ROLLBACK'};
     }
     if(sql==='COMMIT'){
      if(!this.active)throw Error('NOT_IN_TRANSACTION');
      const write=!this.readonly;
      if(write){
       state.works=this.active.works;
       state.receipts=this.active.receipts;
       state.countCreates=this.active.countCreates;
       // An idempotent receipt replay uses a write-capable transaction but
       // does not actually mutate records; it must not count as another save.
       if(this.mutated){
        state.commits++;
        state.afterWrite?.(state);
       }
      }
      this.active=null;
      if(write&&state.failAck){
       state.failAck=false;throw Error('postgres://do-not-expose-secret');
      }
      return {command:'COMMIT'};
     }
     if(!this.active)throw Error('QUERY_OUTSIDE_TRANSACTION');
     if(sql.includes('FROM gallery_admin_sessions s')){
      const expected=[sha(SESSION),sha(DEVICE_COOKIE)];
      assert.deepEqual(args,expected);
      return sqlRows(options.owner===false?[]:[{user_id:OWNER,role:'owner',device_id:DEVICE}]);
     }
     if(sql.startsWith('SELECT actor_id,action,payload_hash,exhibit_id,revision FROM museum_exhibit_draft_operations_stage')){
      assert.equal(this.readonly,false);
      const receipt=this.active.receipts[args[0]];
      return sqlRows(receipt?[receipt]:[]);
     }
     if(sql.startsWith('INSERT INTO museum_public_exhibits(')){
      assert.equal(this.readonly,false);
      assert.equal(this.active.works[WORK],undefined);
      this.mutated=true;
      this.active.countCreates++;
      this.active.works[WORK]={
       id:WORK,kind:args[0],category:args[1],title:args[2],
       description:args[3],credit:args[4],occurred_on:args[5],
       image_url:args[6],external_url:args[7],
       status:'draft',revision:0,updated_at:'2026-11-06T07:00:00.000Z',
       rights_checked_at:null,privacy_checked_at:null,reviewed_by:null,published_at:null
      };
      return sqlRows([{id:WORK,status:'draft',revision:0}],'INSERT');
     }
     if(sql.startsWith('UPDATE museum_public_exhibits SET kind=')){
      assert.equal(this.readonly,false);
      const record=this.active.works[args[8]];
      if(!record||record.status!=='draft'||record.revision!==args[9])
       return sqlRows([],'UPDATE');
      this.mutated=true;
      Object.assign(record,{
       kind:args[0],category:args[1],title:args[2],
       description:args[3],credit:args[4],occurred_on:args[5],
       image_url:args[10]?record.image_url:args[6],external_url:args[7],
       revision:record.revision+1,updated_at:'2026-11-06T07:01:00.000Z',
       rights_checked_at:null,privacy_checked_at:null,reviewed_by:null,published_at:null
      });
      return sqlRows([{id:WORK,status:'draft',revision:record.revision}],'UPDATE');
     }
     if(sql.startsWith('INSERT INTO museum_exhibit_draft_operations_stage(')){
      assert.equal(this.readonly,false);
      const [operation_id,actor_id,exhibit_id,action,payload_hash,revision]=args;
      assert.equal(this.active.receipts[operation_id],undefined);
      this.mutated=true;
      this.active.receipts[operation_id]={actor_id,action,payload_hash,exhibit_id,revision};
      return sqlRows([{operation_id}],'INSERT');
     }
     if(sql.startsWith('SELECT id,kind,category,title,description,credit,occurred_on,image_url,external_url,')){
      assert.equal(this.readonly,true);
      assert.match(sql,/WHERE id=\$1::uuid AND status='draft' LIMIT 2$/);
      state.readbacks++;
      if(state.failRead)throw Error('postgres://private:secret@hidden.invalid');
      const work=this.active.works[args[0]];
      return sqlRows(work&&work.status==='draft'?[work]:[]);
     }
     throw Error('UNEXPECTED_SQL: '+sql);
    },
    release(error){state.releases.push(error)}
   };
   state.connections.push(client);return client;
  }
 };
 return {state,pool};
}
const run=(pool,extra={})=>roundtrip(pool,{
 request:request(),verifyBinding:async()=>proof(),
 operationId:OP,action:'create',uiDraft:fields(),...extra
});
test('creation is written once, independently read back, and still private',async()=>{
 const {pool,state}=fixture();
 const x=await run(pool);
 assert.equal(x.ok,true);
 assert.equal(x.savedAndReloaded,true);
 assert.equal(x.exhibitId,WORK);
 assert.equal(x.revision,0);
 assert.equal(x.canEditWithRevision,0);
 assert.equal(x.currentPrivateDraft.title,fields().title);
 assert.equal(x.currentPrivateDraft.room,'icons');
 assert.equal(x.currentPrivateDraft.imageUrl,'');
 assert.equal(x.currentPrivateDraft.status,'draft');
 assert.equal(x.canPublish,false);
 assert.equal(x.productionReleased,false);
 assert.equal(x.requiresFreshReview,true);
 assert.equal(x.replayedReceipt,false);
 assert.equal(Object.isFrozen(x),true);
 assert.equal(Object.isFrozen(x.currentPrivateDraft),true);
 assert.equal(state.countCreates,1);
 assert.equal(state.commits,1);
 assert.equal(state.readbacks,1);
 assert.equal(state.connections.length,2);
 assert.equal(state.releases.length,2);
 assert.ok(state.releases.every(x=>x===undefined));
 assert.equal(state.legacyAttendance,'unchanged');
 assert.equal(state.gacha,'unchanged');
 assert.equal(state.calls.some(x=>/\bDELETE\b|\bDROP\b|\bTRUNCATE\b|UPDATE\s+gallery_live_overrides/i.test(x.sql)),false);
});
test('phone-only metadata edit keeps existing cover, resets moderation and reads new revision',async()=>{
 const {pool,state}=fixture();
 await run(pool,{uiDraft:undefined,draft:full()});
 const updated=await run(pool,{
  operationId:OP2,action:'edit',exhibitId:WORK,expectedRevision:0,
  uiDraft:{...fields(),title:'架空の非公開アイコン・更新'}
 });
 assert.equal(updated.savedAndReloaded,true);
 assert.equal(updated.revision,1);
 assert.equal(updated.currentPrivateDraft.title,'架空の非公開アイコン・更新');
 assert.equal(updated.currentPrivateDraft.imageUrl,'/assets/gallery-emuzii-mio-cover.svg');
 assert.equal(updated.currentPrivateDraft.category,'イラスト');
 assert.equal(state.works[WORK].rights_checked_at,null);
 assert.equal(state.works[WORK].reviewed_by,null);
 assert.equal(state.works[WORK].published_at,null);
 assert.equal(state.countCreates,1);
 assert.equal(state.commits,2);
 assert.equal(state.readbacks,2);
});
test('edit with a stale revision cannot overwrite the newer draft',async()=>{
 const {pool,state}=fixture();
 await run(pool);
 const before=state.readbacks;
 await assert.rejects(()=>run(pool,{
  operationId:OP2,action:'edit',exhibitId:WORK,expectedRevision:3,
  uiDraft:{...fields(),title:'古い版で上書き'}
 }),/MUSEUM_DRAFT_ROUNDTRIP_REVISION_CONFLICT/);
 assert.equal(state.works[WORK].title,fields().title);
 assert.equal(state.works[WORK].revision,0);
 assert.equal(state.readbacks,before);
});
test('concurrent edit after save but before readback is detected, never overwritten',async()=>{
 let n=0;
 const {pool,state}=fixture({afterWrite:s=>{
  n++;
  if(n===1){
   s.works[WORK].revision=1;
   s.works[WORK].title='別の承認済み操作による変更';
  }
 }});
 await assert.rejects(()=>run(pool),/MUSEUM_DRAFT_ROUNDTRIP_REVISION_ADVANCED/);
 assert.equal(state.countCreates,1);
 assert.equal(state.commits,1);
 assert.equal(state.readbacks,1);
 assert.equal(state.works[WORK].title,'別の承認済み操作による変更');
});
test('an exhibit hidden or published before readback is never exposed as editable',async()=>{
 for(const changedState of ['published','hidden','trash']){
  const {pool,state}=fixture({afterWrite:s=>{s.works[WORK].status=changedState;}});
  await assert.rejects(()=>run(pool),/MUSEUM_DRAFT_ROUNDTRIP_NOT_CURRENT_PRIVATE_DRAFT/);
  assert.equal(state.countCreates,1);
  assert.equal(state.works[WORK].status,changedState);
 }
});
test('mismatched contents at the same revision are rejected rather than reported saved',async()=>{
 const {pool,state}=fixture({afterWrite:s=>{s.works[WORK].title='別の内容';}});
 await assert.rejects(()=>run(pool),/MUSEUM_DRAFT_ROUNDTRIP_RELOAD_CONTENT_MISMATCH/);
 assert.equal(state.countCreates,1);
 assert.equal(state.readbacks,1);
});
test('a lost read response after a confirmed save does not create a second draft',async()=>{
 const {pool,state}=fixture({failRead:true});
 await assert.rejects(()=>run(pool),/MUSEUM_DRAFT_ROUNDTRIP_RELOAD_UNCONFIRMED/);
 assert.equal(state.countCreates,1);
 assert.equal(state.commits,1);
 assert.ok(state.releases[1] instanceof Error);
 state.failRead=false;
 const sameOperation=await run(pool);
 assert.equal(sameOperation.replayedReceipt,true);
 assert.equal(sameOperation.savedAndReloaded,true);
 assert.equal(state.countCreates,1);
 assert.equal(state.commits,1);
});
test('lost COMMIT acknowledgment can be recovered ONLY by replaying same operationId',async()=>{
 const {pool,state}=fixture({failAck:true});
 await assert.rejects(()=>run(pool),/MUSEUM_DRAFT_ROUNDTRIP_COMMIT_UNCONFIRMED/);
 assert.equal(state.countCreates,1);
 assert.equal(state.readbacks,0,'do not assume a failed COMMIT response means saved');
 assert.ok(state.releases[0] instanceof Error);
 const result=await run(pool);
 assert.equal(result.replayedReceipt,true);
 assert.equal(result.revision,0);
 assert.equal(state.countCreates,1);
 assert.equal(state.readbacks,1);
});
test('replay after a later revision was saved never masquerades as current editable',async()=>{
 const {pool,state}=fixture();
 await run(pool);
 state.works[WORK].revision=1;
 state.works[WORK].title='別の最新版';
 await assert.rejects(()=>run(pool),/MUSEUM_DRAFT_ROUNDTRIP_REVISION_ADVANCED/);
 assert.equal(state.countCreates,1);
});
test('an operation ID cannot be used for a different body after its first save',async()=>{
 const {pool,state}=fixture();
 await run(pool);
 await assert.rejects(()=>run(pool,{
  uiDraft:{...fields(),title:'他の内容'}
 }),/MUSEUM_DRAFT_ROUNDTRIP_OPERATION_CONFLICT/);
 assert.equal(state.countCreates,1);
 assert.equal(state.readbacks,1);
});
test('missing binding proof or invalid owner blocks before save/readback',async()=>{
 for(const key of Object.keys(proof())){
  const {pool,state}=fixture();
  await assert.rejects(()=>run(pool,{verifyBinding:async()=>({...proof(),[key]:false})}),
   /MUSEUM_DRAFT_ROUNDTRIP_SAVE_NOT_CONFIRMED/);
  assert.equal(state.countCreates,0);
  assert.equal(state.readbacks,0);
 }
 const denied=fixture({owner:false});
 await assert.rejects(()=>run(denied.pool),/MUSEUM_DRAFT_ROUNDTRIP_SAVE_NOT_CONFIRMED/);
 assert.equal(denied.state.countCreates,0);
 const req=request();req.headers.origin='https://untrusted.invalid';
 const wrongOrigin=fixture();
 await assert.rejects(()=>run(wrongOrigin.pool,{request:req}),
  /MUSEUM_DRAFT_ROUNDTRIP_SAVE_NOT_CONFIRMED/);
 assert.equal(wrongOrigin.state.countCreates,0);
});
test('malformed inputs stop before a database connection, never echo sensitive information',async()=>{
 const {pool,state}=fixture();
 for(const bad of [
  {operationId:'untrusted-id'},
  {action:'publish'},
  {action:'create',expectedRevision:0},
  {action:'edit',exhibitId:'not-uuid',expectedRevision:0},
  {action:'edit',exhibitId:WORK,expectedRevision:'0'},
  {draft:full()},
  {uiDraft:undefined,draft:{...full(),publish:true}},
  {uiDraft:{...fields(),rightsChecked:true}}
 ]){
  await assert.rejects(()=>run(pool,bad),/MUSEUM_DRAFT_ROUNDTRIP_/);
 }
 assert.equal(state.connections.length,0);
});
test('snapshot immutable submitted body before async verification',async()=>{
 const {pool,state}=fixture();
 const draft=fields();
 const result=await run(pool,{uiDraft:draft,verifyBinding:async()=>{
  draft.title='別の編集途中タイトル';
  return proof();
 }});
 assert.equal(result.currentPrivateDraft.title,'架空の下書き');
 assert.equal(state.works[WORK].title,'架空の下書き');
});
test('new coordinator is unmounted: no route, page import, env or real credentials',()=>{
 const code=readFileSync(new URL('../museum-exhibit-owner-roundtrip-stage.mjs',import.meta.url),'utf8');
 const conf=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
 assert.equal(conf.builds.some(x=>x.src==='museum-exhibit-owner-roundtrip-stage.mjs'),false);
 assert.equal(conf.routes.some(x=>x.src==='/museum-exhibit-owner-roundtrip-stage.mjs'||
   x.dest==='/museum-exhibit-owner-roundtrip-stage.mjs'),false);
 assert.doesNotMatch(code,/export default|process\.env|new Pool|GALLERY_DATABASE_URL|BLOB_READ_WRITE_TOKEN|fetch\s*\(|document\.cookie|localStorage|sessionStorage/);
 for(const page of ['museum.html','museum-approved-gallery.html','museum-archive.html','museum-curator-preview.html']){
  const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');
  assert.equal(html.includes('museum-exhibit-owner-roundtrip-stage.mjs'),false);
 }
});
