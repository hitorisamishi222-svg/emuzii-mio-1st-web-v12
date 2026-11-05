import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {approvedGalleryItems} from '../gallery-items.js';
import {saveMuseumOwnerGalleryDraftStage} from '../museum-gallery-owner-draft-stage.mjs';

const USER='11111111-2222-4333-8444-555555555555';
const DEVICE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OP='0123456789abcdef0123456789abcdef';
const SESSION='s'.repeat(44),DEVICE_TOKEN='d'.repeat(44);
const sha=value=>createHash('sha256').update(value).digest('hex');
const request=()=>({
 method:'POST',
 headers:{
  host:'emuzii-mio-1st-web-v12.vercel.app',
  origin:'https://emuzii-mio-1st-web-v12.vercel.app',
  'content-type':'application/json',
  cookie:'mio_gallery_session='+SESSION+'; mio_gallery_device='+DEVICE_TOKEN
 }
});
const proposal=()=>({
 expectedRevision:0,order:approvedGalleryItems.map(x=>x.id),
 visibleIds:approvedGalleryItems.filter(x=>!x.hidden).map(x=>x.id),
 featuredId:approvedGalleryItems.find(x=>!x.hidden)?.id??null
});
const binding=()=>({
 identityVerified:true,schemaReady:true,sourceReady:true,layoutReady:true,
 previewEnvScopeVerified:true,backupVerified:true,ownerApproved:true
});
const select=rows=>({command:'SELECT',rowCount:rows.length,rows});
class SimulatedMuseumClient {
 constructor({owner=true,hidden=false}={}){
  this.owner=owner;this.hidden=hidden;
  this.persist={draftRevision:0,draftOrder:[],visible:[],featured:null,
   receipt:null,publication:'legacy-public-content-unchanged'};
  this.working=null;this.statements=[];this.releaseReason=null;this.released=0;
 }
 release(error){this.released++;this.releaseReason=error}
 async query(sql,args=[]){
  this.statements.push({sql,args});
  if(sql==='BEGIN ISOLATION LEVEL SERIALIZABLE'){
   this.working=structuredClone(this.persist);return {command:'BEGIN'};
  }
  if(sql==='ROLLBACK'){this.working=null;return {command:'ROLLBACK'}}
  if(sql==='COMMIT'){
   this.persist=this.working;this.working=null;return {command:'COMMIT'};
  }
  if(!this.working)throw Error('UNSAFE_QUERY_OUTSIDE_TRANSACTION');
  if(sql.includes('FROM gallery_admin_sessions s')){
   assert.deepEqual(args,[sha(SESSION),sha(DEVICE_TOKEN)]);
   return select(this.owner?[{user_id:USER,role:'owner',device_id:DEVICE}]:[]);
  }
  if(sql.startsWith('INSERT INTO museum_gallery_layout_stage(layout_key)'))
   return {command:'INSERT',rowCount:1};
  if(sql.startsWith('SELECT draft_revision FROM museum_gallery_layout_stage'))
   return select([{draft_revision:String(this.working.draftRevision)}]);
  if(sql.startsWith('SELECT actor_id,action,payload_hash,new_revision FROM museum_gallery_layout_audit_stage'))
   return select(this.working.receipt?[{...this.working.receipt}]:[]);
  if(sql.startsWith('SELECT item_id,title,creator,description,category,external_url,')){
   assert.match(sql,/FROM gallery_live_overrides/);
   assert.match(sql,/FOR SHARE$/);
   if(!this.hidden)return select([]);
   return select([{
    item_id:approvedGalleryItems[0].id,title:null,creator:null,
    description:null,category:null,external_url:null,thumbnail_url:null,
    hidden:true,deleted:false,revision:'1',updated_at:new Date()
   }]);
  }
  if(sql.startsWith('SELECT id,kind,category,title,description,credit,image_url,')){
   assert.match(sql,/FROM museum_public_exhibits/);
   assert.match(sql,/FOR SHARE$/);
   return select([]);
  }
  if(sql.startsWith('UPDATE museum_gallery_layout_stage SET draft_revision=')){
   if(args[5]!==this.working.draftRevision)return select([]);
   this.working.draftRevision=args[0];
   this.working.draftOrder=JSON.parse(args[1]);
   this.working.visible=JSON.parse(args[2]);
   this.working.featured=args[3];
   return select([{draft_revision:String(args[0])}]);
  }
  if(sql.startsWith('INSERT INTO museum_gallery_layout_audit_stage')){
   this.working.receipt={actor_id:args[2],action:'draft',
    payload_hash:args[1],new_revision:String(args[4])};
   return select([{operation_id:args[0]}]);
  }
  throw Error('UNEXPECTED_SQL');
 }
}
const poolFor=client=>({
 get query(){throw Error('POOLED_QUERY_NOT_ALLOWED')},
 async connect(){return client}
});
const save=(client,{req=request(),proof=binding(),draft=proposal()}={})=>
 saveMuseumOwnerGalleryDraftStage(poolFor(client),{
  request:req,operationId:OP,proposal:draft,verifyBinding:async checked=>{
   assert.equal(checked,client);return proof;
  }
 });

test('owner + device session and locked moderated catalog save a private draft in one DB client',async()=>{
 const db=new SimulatedMuseumClient();
 const output=await save(db);
 assert.deepEqual(output,{ok:true,replayed:false,revision:1,published:false});
 assert.deepEqual(db.persist.draftOrder,proposal().order);
 assert.deepEqual(db.persist.visible,proposal().visibleIds);
 assert.equal(db.persist.publication,'legacy-public-content-unchanged');
 assert.equal(db.persist.receipt.action,'draft');
 assert.equal(db.statements[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE');
 assert.equal(db.statements.at(-1).sql,'COMMIT');
 assert.equal(db.released,1);
 assert.equal(db.releaseReason,undefined);
 const src=db.statements.filter(x=>x.sql.includes('gallery_live_overrides')||
  x.sql.includes('FROM museum_public_exhibits'));
 assert.equal(src.length,2);
 assert.ok(src.every(x=>/FOR SHARE$/.test(x.sql)));
 assert.ok(db.statements.every(x=>!/DELETE FROM|DROP TABLE|SET published_|FROM mio_gacha_/i.test(x.sql)));
});
test('incomplete DB provider, backup or owner release evidence blocks before transaction',async()=>{
 for(const key of Object.keys(binding())){
  const db=new SimulatedMuseumClient();
  await assert.rejects(()=>save(db,{proof:{...binding(),[key]:false}}),
   /MUSEUM_CLIENT_BINDING_NOT_VERIFIED/);
  assert.equal(db.statements.length,0,key);
  assert.equal(db.released,1);
  assert.ok(db.releaseReason instanceof Error);
 }
});
test('invalid origin or unapproved admin device stops before any layout write',async()=>{
 for(const mutate of [
  req=>{req.headers.origin='https://evil.example'},
  req=>{req.headers.host='other-preview.vercel.app'},
  req=>{req.method='GET'},
  req=>{req.headers.cookie=''},
 ]){
  const db=new SimulatedMuseumClient();
  const req=request();mutate(req);
  await assert.rejects(()=>save(db,{req}),/MUSEUM_DRAFT_ADMIN_AUTH_REQUIRED/);
  assert.equal(db.persist.draftRevision,0);
  assert.equal(db.statements.some(x=>/INSERT INTO museum_gallery_layout_stage|UPDATE museum_gallery_layout_stage/.test(x.sql)),false);
  assert.equal(db.statements.at(-1).sql,'ROLLBACK');
  assert.ok(db.releaseReason instanceof Error);
 }
 const db=new SimulatedMuseumClient({owner:false});
 await assert.rejects(()=>save(db),/MUSEUM_DRAFT_ADMIN_AUTH_REQUIRED/);
 assert.equal(db.persist.draftRevision,0);
});
test('current rights takedown wins over a formerly approved static catalog work',async()=>{
 const db=new SimulatedMuseumClient({hidden:true});
 await assert.rejects(()=>save(db),/MUSEUM_PLAN_VISIBILITY_UNAPPROVED/);
 assert.equal(db.persist.draftRevision,0);
 assert.equal(db.persist.publication,'legacy-public-content-unchanged');
 assert.equal(db.statements.at(-1).sql,'ROLLBACK');
 assert.ok(db.releaseReason instanceof Error);
});
test('forged request fields cannot be injected as owner, approval or publication rights',async()=>{
 const db=new SimulatedMuseumClient({owner:false});
 const req=request();
 req.body={ownerApproved:true,role:'owner',verifiedApprovedIds:proposal().order,
  publish:true,database:'production',session:SESSION};
 await assert.rejects(()=>save(db,{req}),/MUSEUM_DRAFT_ADMIN_AUTH_REQUIRED/);
 assert.equal(db.persist.draftRevision,0);
 assert.equal(db.statements.some(x=>/UPDATE museum_gallery_layout_stage/.test(x.sql)),false);
});
test('the composed stage does not have a route, create a pool or inspect environment secrets',()=>{
 const module='museum-gallery-owner-draft-stage.mjs';
 const src=readFileSync(new URL('../'+module,import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.builds.some(x=>x.src===module),false);
 assert.equal(config.routes.some(x=>x.src==='/'+module||x.dest==='/'+module),false);
 assert.doesNotMatch(src,/process\.env|export default|new Pool|GALLERY_DATABASE_URL|\bfetch\s*\(|\bINSERT INTO\b|BLOB_READ_WRITE_TOKEN/);
});
