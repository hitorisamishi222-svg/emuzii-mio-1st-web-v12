import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {saveMuseumOwnerExhibitStage} from '../museum-exhibit-owner-save-stage.mjs';
const USER='11111111-2222-4333-8444-555555555555';
const DEVICE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const EXHIBIT='33333333-4444-4555-8666-777777777777';
const SESSION='s'.repeat(44),DEVICE_COOKIE='d'.repeat(44);
const OP='0123456789abcdef0123456789abcdef';
const OP2='abcdef0123456789abcdef0123456789';
const sha=value=>createHash('sha256').update(value).digest('hex');
const draft=()=>({
 kind:'gallery',category:'ファンアート',title:'架空の思い出',description:'仮の説明',
 credit:'テスト管理者',occurredOn:null,imageUrl:'',
 externalUrl:'https://example.org/work'
});
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
const result=(rows,command='SELECT')=>({command,rowCount:rows.length,rows});
const setup=(options={})=>{
 const storage={works:{},receipts:{},newIds:0,commitAckLost:!!options.commitAckLost,
  owner:options.owner!==false,legacyAttendance:'protected',legacyGacha:'protected',
  calls:[],connections:[],released:[]};
 const pool={
  get query(){throw Error('POOL_QUERY_BYPASS')},
  async connect(){
   const client={
    active:null,
    async query(sql,args=[]){
     storage.calls.push({sql,args});
     if(sql==='BEGIN ISOLATION LEVEL SERIALIZABLE'){
      assert.equal(this.active,null);
      this.active=structuredClone({
       works:storage.works,receipts:storage.receipts,newIds:storage.newIds
      });
      return {command:'BEGIN'};
     }
     if(sql==='ROLLBACK'){this.active=null;return {command:'ROLLBACK'}}
     if(sql==='COMMIT'){
      Object.assign(storage,this.active);
      this.active=null;
      if(storage.commitAckLost){
       storage.commitAckLost=false;
       throw Error('unknown commit with sensitive connection string');
      }
      return {command:'COMMIT'};
     }
     if(!this.active)throw Error('QUERY_OUTSIDE_TRANSACTION');
     if(sql.includes('FROM gallery_admin_sessions s')){
      assert.deepEqual(args,[sha(SESSION),sha(DEVICE_COOKIE)]);
      return result(storage.owner?[{user_id:USER,role:'owner',device_id:DEVICE}]:[]);
     }
     if(sql.startsWith('SELECT actor_id,action,payload_hash,exhibit_id,revision FROM museum_exhibit_draft_operations_stage')){
      const hit=this.active.receipts[args[0]];
      return result(hit?[hit]:[]);
     }
     if(sql.startsWith('INSERT INTO museum_public_exhibits(')){
      assert.match(sql,/VALUES\(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,'draft',0\)/);
      const id=EXHIBIT;
      assert.equal(this.active.works[id],undefined,'duplicate created');
      this.active.newIds++;
      this.active.works[id]={
       id,kind:args[0],category:args[1],title:args[2],description:args[3],
       credit:args[4],occurred_on:args[5],image_url:args[6],
       external_url:args[7],status:'draft',revision:0,
       rights_checked_at:null,privacy_checked_at:null,reviewed_by:null,published_at:null
      };
      return result([{id,revision:0,status:'draft'}],'INSERT');
     }
     if(sql.startsWith('UPDATE museum_public_exhibits SET kind=')){
      assert.match(sql,/status='draft'/);
      assert.match(sql,/rights_checked_at=NULL,privacy_checked_at=NULL,reviewed_by=NULL,published_at=NULL/);
      const current=this.active.works[args[8]];
      if(!current||current.status!=='draft'||current.revision!==args[9])
       return result([],'UPDATE');
      Object.assign(current,{
       kind:args[0],category:args[1],title:args[2],description:args[3],
       credit:args[4],occurred_on:args[5],image_url:args[6],
       external_url:args[7],
       revision:current.revision+1,rights_checked_at:null,privacy_checked_at:null,
       reviewed_by:null,published_at:null
      });
      return result([{id:current.id,revision:current.revision,status:'draft'}],'UPDATE');
     }
     if(sql.startsWith('INSERT INTO museum_exhibit_draft_operations_stage(')){
      const [operation_id,actor_id,exhibit_id,action,payload_hash,revision]=args;
      assert.equal(this.active.receipts[operation_id],undefined);
      this.active.receipts[operation_id]={actor_id,action,payload_hash,exhibit_id,revision};
      return result([{operation_id}],'INSERT');
     }
     throw Error('INVALID_SQL');
    },
    release(err){storage.released.push(err)}
   };
   storage.connections.push(client);
   return client;
  }
 };
 return {pool,storage};
};
const run=(pool,overrides={})=>saveMuseumOwnerExhibitStage(pool,{
 request:request(),operationId:OP,action:'create',draft:draft(),
 verifyBinding:async()=>proof(),...overrides
});
test('owner creates nonpublic exhibition with one private audit receipt; never touches legacy records',async()=>{
 const {pool,storage}=setup();
 const r=await run(pool);
 assert.deepEqual(r,{ok:true,replayed:false,exhibitId:EXHIBIT,
  revision:0,privateDraftAtSave:true,published:false});
 assert.equal(storage.works[EXHIBIT].status,'draft');
 assert.equal(storage.works[EXHIBIT].kind,'gallery');
 assert.equal(storage.works[EXHIBIT].category,'ファンアート');
 assert.equal(storage.works[EXHIBIT].rights_checked_at,null);
 assert.equal(storage.works[EXHIBIT].published_at,null);
 assert.equal(storage.newIds,1);
 assert.equal(Object.keys(storage.receipts).length,1);
 assert.equal(storage.legacyAttendance,'protected');
 assert.equal(storage.legacyGacha,'protected');
 assert.equal(storage.connections.length,1);
 assert.equal(storage.released[0],undefined);
 assert.ok(storage.calls.every(x=>!/\bDELETE\b|\bDROP\b|\bTRUNCATE\b|UPDATE gallery_live_overrides/i.test(x.sql)));
});
test('edit increments exact matching private revision and strips stale review metadata',async()=>{
 const {pool,storage}=setup();
 await run(pool);
 const r=await run(pool,{operationId:OP2,action:'edit',exhibitId:EXHIBIT,
  expectedRevision:0,draft:{...draft(),title:'架空作品・改訂版'}});
 assert.deepEqual(r,{ok:true,replayed:false,exhibitId:EXHIBIT,
  revision:1,privateDraftAtSave:true,published:false});
 assert.equal(storage.works[EXHIBIT].title,'架空作品・改訂版');
 assert.equal(storage.works[EXHIBIT].revision,1);
 assert.equal(storage.released.length,2);
 assert.equal(storage.released.every(x=>x===undefined),true);
});
test('stale edit and editing published, hidden, archived or missing work all fail closed',async()=>{
 const {pool,storage}=setup();
 await run(pool);
 for(const status of ['draft','published','hidden','trash']){
  storage.works[EXHIBIT].status=status;
  await assert.rejects(()=>run(pool,{operationId:OP2,action:'edit',
   expectedRevision:1,exhibitId:EXHIBIT}),
   /MUSEUM_EXHIBIT_REVISION_OR_STATE_CONFLICT/);
  assert.equal(storage.works[EXHIBIT].revision,0);
 }
 storage.works[EXHIBIT].status='draft';
 await assert.rejects(()=>run(pool,{operationId:OP2,action:'edit',
  expectedRevision:0,exhibitId:'99999999-9999-4999-8999-999999999999'}),
  /MUSEUM_EXHIBIT_REVISION_OR_STATE_CONFLICT/);
});
test('same operation and payload are replay-safe; conflicting content cannot be silently reused',async()=>{
 const {pool,storage}=setup();
 await run(pool);
 const replay=await run(pool);
 assert.equal(replay.replayed,true);
 assert.equal(replay.exhibitId,EXHIBIT);
 assert.equal(storage.newIds,1);
 await assert.rejects(()=>run(pool,{draft:{...draft(),title:'別作品'}}),
  /MUSEUM_EXHIBIT_OPERATION_CONFLICT/);
 assert.equal(storage.works[EXHIBIT].title,draft().title);
});
test('unknown COMMIT acknowledgement resolves via durable receipt without duplicate exhibit',async()=>{
 const {pool,storage}=setup({commitAckLost:true});
 await assert.rejects(()=>run(pool),/MUSEUM_EXHIBIT_COMMIT_UNCONFIRMED/);
 assert.equal(storage.newIds,1);
 assert.ok(storage.released[0] instanceof Error);
 const retried=await run(pool);
 assert.equal(retried.replayed,true);
 assert.equal(storage.newIds,1);
 assert.equal(storage.connections.length,2);
});
test('approved device, origin and missing binding proof block all exhibit writes',async()=>{
 for(const key of Object.keys(proof())){
  const {pool,storage}=setup();
  await assert.rejects(()=>run(pool,{
   verifyBinding:async()=>({...proof(),[key]:false})
  }),/MUSEUM_CLIENT_BINDING_NOT_VERIFIED/);
  assert.equal(storage.calls.length,0);
 }
 for(const change of [
  x=>{x.headers.origin='https://attacker.example'},
  x=>{x.headers.host='some-preview.vercel.app'},
  x=>{x.headers.cookie=''},
  x=>{x.method='GET'},
 ]){
  const {pool,storage}=setup();
  const req=request();change(req);
  await assert.rejects(()=>run(pool,{request:req}),/MUSEUM_EXHIBIT_OWNER_AUTH_REQUIRED/);
  assert.equal(Object.keys(storage.works).length,0);
 }
 const {pool,storage}=setup({owner:false});
 await assert.rejects(()=>run(pool),/MUSEUM_EXHIBIT_OWNER_AUTH_REQUIRED/);
 assert.equal(Object.keys(storage.works).length,0);
});
test('draft schema forbids disguised publish, uploaded bytes and insecure image URLs',async()=>{
 const malicious=[
  {...draft(),publish:true},
  {...draft(),status:'published'},
  {...draft(),rightsChecked:true},
  {...draft(),imageUrl:'data:image/png;base64,AAAA'},
  {...draft(),imageUrl:'https://evil.example/image.png'},
  {...draft(),externalUrl:'javascript:alert(1)'},
  {...draft(),externalUrl:'http://example.org/'},
  {...draft(),title:'\u0000'},
  {...draft(),occurredOn:'2026-02-30'}
 ];
 for(const attempted of malicious){
  const {pool,storage}=setup();
  await assert.rejects(()=>run(pool,{draft:attempted}),/MUSEUM_EXHIBIT_DRAFT_/);
  assert.equal(storage.calls.length,0);
 }
});
test('invalid create/edit action fields never reach a database transaction',async()=>{
 for(const changes of [
  {action:'publish'}, {action:'create',exhibitId:EXHIBIT},
  {action:'create',expectedRevision:0},
  {action:'edit',exhibitId:'bad',expectedRevision:0},
  {action:'edit',exhibitId:EXHIBIT,expectedRevision:-1},
  {operationId:'not-an-operation-id'}
 ]){
  const {pool,storage}=setup();
  await assert.rejects(()=>run(pool,changes),/MUSEUM_EXHIBIT_/);
  assert.equal(storage.calls.length,0);
 }
});
test('media category changes independently of exhibition room, and unknown type never writes',async()=>{
 const {pool,storage}=setup();
 await run(pool,{draft:{...draft(),kind:'moments',category:'音声・楽曲'}});
 assert.equal(storage.works[EXHIBIT].kind,'moments');
 assert.equal(storage.works[EXHIBIT].category,'音声・楽曲');
 await run(pool,{operationId:OP2,action:'edit',exhibitId:EXHIBIT,
  expectedRevision:0,draft:{...draft(),kind:'events',category:'動画'}});
 assert.equal(storage.works[EXHIBIT].kind,'events');
 assert.equal(storage.works[EXHIBIT].category,'動画');
 const count=storage.calls.length;
 await assert.rejects(()=>run(pool,{operationId:'fedcba9876543210fedcba9876543210',
  action:'edit',exhibitId:EXHIBIT,expectedRevision:1,
  draft:{...draft(),kind:'icons',category:'動画以外'}}),/MUSEUM_EXHIBIT_DRAFT_CONTENT_INVALID/);
 assert.equal(storage.calls.length,count);
});
test('candidate DDL and stage module remain unrouted and contain no private data',()=>{
 const code=readFileSync(new URL('../museum-exhibit-private-draft-stage.mjs',import.meta.url),'utf8');
 const adapter=readFileSync(new URL('../museum-exhibit-owner-save-stage.mjs',import.meta.url),'utf8');
 const ddl=readFileSync(new URL('../db/museum-exhibit-draft-operations-stage.sql',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 for(const path of ['museum-exhibit-private-draft-stage.mjs','museum-exhibit-owner-save-stage.mjs']){
  assert.equal(config.builds.some(x=>x.src===path),false);
  assert.equal(config.routes.some(x=>x.src==='/'+path||x.dest==='/'+path),false);
 }
 assert.doesNotMatch(code+adapter,/export default|process\.env|new Pool|BLOB_READ_WRITE_TOKEN|GALLERY_DATABASE_URL/);
 assert.match(ddl,/CREATE TABLE IF NOT EXISTS museum_exhibit_draft_operations_stage/);
 assert.doesNotMatch(ddl,/\bDELETE\b|\bTRUNCATE\b|UPDATE museum_public_exhibits|INSERT INTO gallery_/i);
});
