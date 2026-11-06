import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getMuseumPrivateDraftStage as get} from '../museum-exhibit-owner-list-stage.mjs';
import {getMuseumOwnerDraftStage as ownerGet} from '../museum-exhibit-owner-list-entry-stage.mjs';

const OWNER='11111111-2222-4333-8444-555555555555';
const DEVICE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const WORK='44444444-4444-4444-8444-444444444444';
const OTHER='55555555-5555-4555-8555-555555555555';
const SESSION='s'.repeat(44),DEVICE_COOKIE='d'.repeat(44);
const sha=value=>createHash('sha256').update(value).digest('hex');
const request=()=>({method:'POST',headers:{
 host:'emuzii-mio-1st-web-v12.vercel.app',
 origin:'https://emuzii-mio-1st-web-v12.vercel.app',
 'content-type':'application/json; charset=utf-8',
 cookie:'mio_gallery_session='+SESSION+'; mio_gallery_device='+DEVICE_COOKIE
}});
const row=()=>({
 id:WORK,kind:'icons',category:'イラスト',
 title:'架空の非公開アイコン',description:'公開前の架空作品',
 credit:'架空の作者',occurred_on:'2026-11-05',
 image_url:'/assets/gallery-emuzii-mio-cover.svg',
 external_url:'https://example.org/safe',status:'draft',revision:3,
 updated_at:'2026-11-06T04:20:00.000Z'
});
const proof=()=>({
 identityVerified:true,schemaReady:true,sourceReady:true,layoutReady:true,
 previewEnvScopeVerified:true,backupVerified:true,ownerApproved:true
});
const result=rows=>({command:'SELECT',rowCount:rows.length,rows});
function fixture({stored=row(),owner=true,failQuery=false,badCommit=false,rawRows=null}={}){
 const state={queries:[],releases:[],bound:0,rollbacks:0};
 const client={
  async query(sql,args=[]){
   state.queries.push({sql,args});
   if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')return {command:'BEGIN'};
   if(sql==='COMMIT')return {command:badCommit?'ROLLBACK':'COMMIT'};
   if(sql==='ROLLBACK'){state.rollbacks++;return {command:'ROLLBACK'};}
   if(sql.includes('FROM gallery_admin_sessions s')){
    assert.deepEqual(args,[sha(SESSION),sha(DEVICE_COOKIE)]);
    return result(owner?[{user_id:OWNER,role:'owner',device_id:DEVICE}]:[]);
   }
   if(failQuery)throw Error('postgresql://hidden:password@secret.example.invalid');
   assert.match(sql,/^SELECT id,kind,category,title,description,credit,occurred_on,image_url,external_url,/);
   assert.match(sql,/WHERE id=\$1::uuid AND status='draft' LIMIT 2$/);
   assert.deepEqual(args,[WORK]);
   if(rawRows!==null)return result(rawRows);
   return result(stored&&stored.id===args[0]&&stored.status==='draft'?[stored]:[]);
  },
  release(error){state.releases.push(error);}
 };
 const pool={
  get query(){throw Error('POOL_QUERY_BYPASS');},
  async connect(){state.bound++;return client;}
 };
 return {client,pool,state};
}
const verified=async()=>({role:'owner',user_id:OWNER});
const run=(client,opts={})=>get(client,{
 request:request(),verifyOwner:verified,exhibitId:WORK,...opts
});

test('owner may read one verified private draft to populate an editor without changing state',async()=>{
 const {client,state}=fixture();
 const data=await run(client,{expectedRevision:3});
 assert.equal(data.found,true);
 assert.equal(data.editable,true);
 assert.equal(data.onlyPrivateDrafts,true);
 assert.equal(data.item.id,WORK);
 assert.equal(data.item.revision,3);
 assert.equal(data.item.status,'draft');
 assert.equal(data.item.room,'icons');
 assert.equal(data.item.category,'イラスト');
 assert.equal(data.item.imageUrl,'/assets/gallery-emuzii-mio-cover.svg');
 assert.equal(Object.isFrozen(data),true);
 assert.equal(Object.isFrozen(data.item),true);
 assert.equal(state.queries[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal(state.queries.at(-1).sql,'COMMIT');
 assert.equal(state.queries.filter(x=>/\bSELECT\b/.test(x.sql)).length,1);
 assert.ok(state.queries.every(x=>!/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i.test(x.sql)));
 assert.equal(state.rollbacks,0);
 assert.equal(state.releases.length,0);
});
test('unknown/published/hidden/trash work IDs share the same non-disclosing not-found shape',async()=>{
 for(const status of [null,'published','hidden','trash']){
  const stored=status?{...row(),status}:null;
  const {client}=fixture({stored});
  const x=await run(client);
  assert.deepEqual(x,{found:false,item:null,editable:false,onlyPrivateDrafts:true});
 }
});
test('revision changed since list selection refuses stale edit preparation',async()=>{
 const {client,state}=fixture();
 await assert.rejects(()=>run(client,{expectedRevision:2}),
  /MUSEUM_DRAFT_LIST_REVISION_CHANGED/);
 assert.equal(state.rollbacks,1);
 assert.equal(state.queries.some(x=>x.sql.startsWith('UPDATE')),false);
 const later=await run(client,{expectedRevision:3});
 assert.equal(later.item.revision,3);
});
test('untrusted ID or expected revision is blocked before any database access',async()=>{
 const {client,state}=fixture();
 for(const exhibitId of ['',undefined,'../../private','123',
  "44444444-4444-4444-8444-444444444444' OR true--",OTHER.slice(0,-1)]){
  await assert.rejects(()=>run(client,{exhibitId}),/MUSEUM_DRAFT_LIST_EXHIBIT_ID_INVALID/);
 }
 for(const expectedRevision of ['3',-1,1.25,Number.MAX_SAFE_INTEGER]){
  await assert.rejects(()=>run(client,{expectedRevision}),
   /MUSEUM_DRAFT_LIST_EXPECTED_REVISION_INVALID/);
 }
 assert.equal(state.queries.length,0);
});
test('unauthorized and invalid-origin owner cannot load private detail',async()=>{
 const {client,state}=fixture();
 await assert.rejects(()=>run(client,{verifyOwner:async()=>null}),
  /MUSEUM_DRAFT_LIST_OWNER_AUTH_REQUIRED/);
 assert.equal(state.queries.some(x=>x.sql.includes('FROM museum_public_exhibits')),false);
 assert.equal(state.rollbacks,1);
 const denied=fixture({owner:false});
 await assert.rejects(()=>ownerGet(denied.pool,{request:request(),verifyBinding:async()=>proof(),
  exhibitId:WORK}),/MUSEUM_DRAFT_LIST_OWNER_AUTH_REQUIRED/);
 assert.equal(denied.state.queries.some(x=>x.sql.includes('FROM museum_public_exhibits')),false);
 const invalid=fixture();
 const req=request();req.headers.origin='https://forged.example.invalid';
 await assert.rejects(()=>ownerGet(invalid.pool,{request:req,verifyBinding:async()=>proof(),
  exhibitId:WORK}),/MUSEUM_DRAFT_LIST_OWNER_AUTH_REQUIRED/);
 assert.equal(invalid.state.queries.some(x=>x.sql.includes('FROM museum_public_exhibits')),false);
});
test('malformed, duplicate, wrong-id and non-draft database results are refused',async()=>{
 for(const records of [
  [row(),row()],
  [{...row(),id:OTHER}],
  [{...row(),status:'published'}],
  [{...row(),image_url:'https://untrusted.invalid/photo.jpg'}],
  [{...row(),revision:-1}],
  [{...row(),occurred_on:'2026-02-30'}]
 ]){
  const {client,state}=fixture({rawRows:records});
  await assert.rejects(()=>run(client),
   /MUSEUM_DRAFT_LIST_(DETAIL_RESULT_UNVERIFIED|DETAIL_ID_MISMATCH|ROW_UNVERIFIED|REVISION_INVALID|DATE_INVALID)/);
  assert.equal(state.rollbacks,1);
 }
});
test('database and commit failures hide connection credentials',async()=>{
 const {client,state}=fixture({failQuery:true});
 await assert.rejects(()=>run(client),error=>
  error.message==='MUSEUM_DRAFT_LIST_QUERY_FAILED'&&!error.message.includes('password'));
 assert.equal(state.rollbacks,1);
 const unknown=fixture({badCommit:true});
 await assert.rejects(()=>run(unknown.client),/MUSEUM_DRAFT_LIST_COMMIT_UNVERIFIED/);
 assert.equal(unknown.state.rollbacks,0);
});
test('binding proof and existing owner/device verification use one checked-out client',async()=>{
 const {pool,state,client}=fixture();
 const response=await ownerGet(pool,{request:request(),exhibitId:WORK,expectedRevision:3,
  verifyBinding:async current=>{
   assert.equal(current,client);return proof();
  }});
 assert.equal(response.found,true);
 assert.equal(response.item.revision,3);
 assert.equal(state.bound,1);
 assert.equal(state.releases.length,1);
 assert.equal(state.releases[0],undefined);
 assert.ok(state.queries.some(x=>x.sql.includes('FROM gallery_admin_sessions s')));
});
test('missing any one release gate blocks owner detail before reading the DB',async()=>{
 for(const gate of ['identityVerified','schemaReady','sourceReady','layoutReady',
  'previewEnvScopeVerified','backupVerified','ownerApproved']){
  const {pool,state}=fixture();
  await assert.rejects(()=>ownerGet(pool,{request:request(),exhibitId:WORK,
   verifyBinding:async()=>({...proof(),[gate]:false})}),
   /MUSEUM_CLIENT_BINDING_NOT_VERIFIED/);
  assert.equal(state.queries.length,0);
  assert.ok(state.releases[0] instanceof Error);
 }
});
test('no endpoint, credentials, participant data, public import or deployment exposure',()=>{
 const file='museum-exhibit-owner-list-stage.mjs';
 const wrapper='museum-exhibit-owner-list-entry-stage.mjs';
 const a=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const b=readFileSync(new URL('../'+wrapper,import.meta.url),'utf8');
 const conf=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
 for(const path of [file,wrapper]){
  assert.equal(conf.builds.some(x=>x.src===path),false);
  assert.equal(conf.routes.some(x=>x.src==='/'+path||x.dest==='/'+path),false);
 }
 assert.doesNotMatch(a+b,/export default|process\.env|new Pool|pool\.query|\bfetch\s*\(|document\.cookie|\bINSERT\s+INTO\b|\bUPDATE\s+museum\b|\bDELETE\s+FROM\b/);
 for(const page of ['museum.html','museum-approved-gallery.html','museum-archive.html']){
  const text=readFileSync(new URL('../'+page,import.meta.url),'utf8');
  assert.equal(text.includes('museum-exhibit-owner-list-stage.mjs'),false);
 }
});
