import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {listMuseumPrivateDraftsStage as list} from '../museum-exhibit-owner-list-stage.mjs';
import {listMuseumOwnerDraftsStage as entry} from '../museum-exhibit-owner-list-entry-stage.mjs';

const OWNER='11111111-2222-4333-8444-555555555555';
const DEVICE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const SESSION='s'.repeat(44),DEVICE_COOKIE='d'.repeat(44);
const sha=s=>createHash('sha256').update(s).digest('hex');
const request=()=>({method:'POST',headers:{
 host:'emuzii-mio-1st-web-v12.vercel.app',
 origin:'https://emuzii-mio-1st-web-v12.vercel.app',
 'content-type':'application/json; charset=utf-8',
 cookie:'mio_gallery_session='+SESSION+'; mio_gallery_device='+DEVICE_COOKIE
}});
const row=(id,day,title='架空の非公開作品')=>({
 id,kind:'gallery',category:'ファンアート',title,description:'テスト用の説明',
 credit:'テスト',occurred_on:'2026-11-05',image_url:'',
 external_url:'https://example.org/fictional',status:'draft',revision:0,
 updated_at:'2026-11-'+day+'T12:00:00.000Z'
});
const works=[row(A,'06'),row(B,'05'),row(C,'04')];
const sqlResult=(rows,command='SELECT')=>({command,rowCount:rows.length,rows});
function fixture({rows=works,owner=true,badCommit=false,failQuery=false}={}){
 const state={calls:[],release:[],bound:0,rolledBack:0,sensitiveRecords:'untouched'};
 const client={
  async query(sql,args=[]){
   state.calls.push({sql,args});
   if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')return {command:'BEGIN'};
   if(sql==='ROLLBACK'){state.rolledBack++;return {command:'ROLLBACK'}}
   if(sql==='COMMIT')return {command:badCommit?'ROLLBACK':'COMMIT'};
   if(sql.includes('FROM gallery_admin_sessions s')){
    assert.deepEqual(args,[sha(SESSION),sha(DEVICE_COOKIE)]);
    return sqlResult(owner?[{user_id:OWNER,role:'owner',device_id:DEVICE}]:[]);
   }
   if(failQuery)throw Error('postgresql://secret:secret@example.invalid');
   assert.match(sql,/^SELECT id,kind,category,title,description,credit,occurred_on,image_url,external_url,status,revision,updated_at FROM museum_public_exhibits /);
   assert.match(sql,/WHERE status='draft'/);
   assert.match(sql,/ORDER BY updated_at DESC,id DESC LIMIT \$4$/);
   assert.equal(args.length,4);
   const [room,afterTime,afterId,limit]=args;
   let selected=rows.filter(x=>room===null||x.kind===room);
   if(afterTime)selected=selected.filter(x=>x.updated_at<afterTime||
     x.updated_at===afterTime&&x.id<afterId);
   return sqlResult(selected.slice(0,limit));
  },
  release(error){state.release.push(error)}
 };
 const pool={get query(){throw Error('POOL_QUERY_FORBIDDEN')},async connect(){
  state.bound++;return client;
 }};
 return {client,pool,state};
}
const ownership=async()=>({role:'owner',user_id:OWNER});
const proof=()=>({
 identityVerified:true,schemaReady:true,sourceReady:true,layoutReady:true,
 previewEnvScopeVerified:true,backupVerified:true,ownerApproved:true
});
const run=(client,args={})=>list(client,{
 request:request(),verifyOwner:ownership,...args
});
test('read-only transaction lists draft columns only with deterministic pagination and safe cursor',async()=>{
 const {client,state}=fixture();
 const first=await run(client,{limit:2});
 assert.equal(first.items.length,2);
 assert.deepEqual(first.items.map(x=>x.id),[A,B]);
 assert.equal(first.hasMore,true);
 assert.deepEqual(first.nextCursor,{updatedAt:works[1].updated_at,id:B});
 assert.deepEqual(Object.keys(first.items[0]).sort(),[
  'category','credit','description','editable','externalUrl','id','imageUrl',
  'occurredOn','revision','room','status','title','updatedAt'].sort());
 assert.equal(first.items[0].editable,true);
 assert.equal(first.onlyPrivateDrafts,true);
 assert.equal(Object.isFrozen(first),true);
 assert.equal(Object.isFrozen(first.items),true);
 assert.equal(Object.isFrozen(first.items[0]),true);
 assert.equal(state.calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal(state.calls.at(-1).sql,'COMMIT');
 assert.ok(state.calls.every(x=>!/INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|JOIN\s+participants/i.test(x.sql)));
 const second=await run(client,{limit:2,cursor:first.nextCursor});
 assert.deepEqual(second.items.map(x=>x.id),[C]);
 assert.equal(second.hasMore,false);
 assert.equal(second.nextCursor,null);
 assert.equal(state.rolledBack,0);
 assert.equal(state.sensitiveRecords,'untouched');
});
test('room filtering is passed as a SQL parameter and never interpolated into query',async()=>{
 const {client,state}=fixture();
 const found=await run(client,{room:'gallery'});
 assert.deepEqual(found.items.map(x=>x.id),[A,B,C]);
 const sql=state.calls.find(x=>x.sql.startsWith('SELECT id,kind'));
 assert.equal(sql.args[0],'gallery');
 assert.match(sql.sql,/\$1::text/);
 await assert.rejects(()=>run(client,{room:"gallery' OR true--"}),/MUSEUM_DRAFT_LIST_ROOM_INVALID/);
 assert.equal(state.calls.filter(x=>x.sql.startsWith('SELECT id,kind')).length,1);
});
test('invalid cursor, malformed limit and absent owner callback fail without any query',async()=>{
 const {client,state}=fixture();
 for(const cursor of [
  {},{id:A},{updatedAt:works[0].updated_at,id:'../../private'},
  {updatedAt:'yesterday',id:A},{updatedAt:works[0].updated_at,id:A,role:'owner'},
  {updatedAt:'2026-11-06T12:00:00Z',id:A}
 ])await assert.rejects(()=>run(client,{cursor}),/MUSEUM_DRAFT_LIST_CURSOR_INVALID/);
 for(const limit of [0,51,-1,1.5,'20'])await assert.rejects(
  ()=>run(client,{limit}),/MUSEUM_DRAFT_LIST_LIMIT_INVALID/);
 await assert.rejects(()=>list(client,{verifyOwner:null,request:request()}),
  /MUSEUM_DRAFT_LIST_OWNER_VERIFIER_REQUIRED/);
 assert.equal(state.calls.length,0);
});
test('non-owner request never selects drafts and executes read-only rollback',async()=>{
 const {client,state}=fixture();
 await assert.rejects(()=>run(client,{verifyOwner:async()=>null}),
  /MUSEUM_DRAFT_LIST_OWNER_AUTH_REQUIRED/);
 assert.equal(state.calls.some(x=>x.sql.includes('FROM museum_public_exhibits')),false);
 assert.equal(state.rolledBack,1);
});
test('published, hidden, trashed, duplicate, out-of-order and malformed rows fail closed',async()=>{
 const mutations=[
  data=>{data[0].status='published'},
  data=>{data[0].status='hidden'},
  data=>{data[0].status='trash'},
  data=>{data[0].title=''},
  data=>{data[0].image_url='https://untrusted.invalid/sensitive.jpg'},
  data=>{data[0].external_url='javascript:alert(1)'},
  data=>{data[0].revision=-1},
  data=>{data[0].occurred_on='2026-02-30'},
  data=>{data[0].updated_at='not a timestamp'},
  data=>{data[1].id=data[0].id},
  data=>{data.reverse()}
 ];
 for(const mutate of mutations){
  const data=structuredClone(works);mutate(data);
  const {client,state}=fixture({rows:data});
  await assert.rejects(()=>run(client),/MUSEUM_DRAFT_LIST_(ROW_UNVERIFIED|REVISION_INVALID|DATE_INVALID|TIMESTAMP_INVALID|ROW_ORDER_UNVERIFIED)/);
  assert.equal(state.rolledBack,1);
 }
});
test('unexpected DB driver error and uncertain read-only COMMIT are redacted',async()=>{
 const broken=fixture({failQuery:true});
 await assert.rejects(()=>run(broken.client),e=>
  e.message==='MUSEUM_DRAFT_LIST_QUERY_FAILED'&&!e.message.includes('secret'));
 assert.equal(broken.state.rolledBack,1);
 const commit=fixture({badCommit:true});
 await assert.rejects(()=>run(commit.client),/MUSEUM_DRAFT_LIST_COMMIT_UNVERIFIED/);
 assert.equal(commit.state.rolledBack,0);
});
test('composition verifies dedicated DB proofs and real existing owner session on same client',async()=>{
 const {pool,state}=fixture();
 const x=await entry(pool,{request:request(),verifyBinding:async client=>{
  assert.equal(client.query instanceof Function,true);return proof();
 },limit:2});
 assert.deepEqual(x.items.map(w=>w.id),[A,B]);
 assert.equal(state.bound,1);
 assert.equal(state.release[0],undefined);
 const sessionCall=state.calls.find(c=>c.sql.includes('FROM gallery_admin_sessions s'));
 assert.ok(sessionCall);
});
test('missing release gates, invalid origin or non-owner device cannot list private drafts',async()=>{
 for(const key of ['identityVerified','schemaReady','backupVerified',
  'previewEnvScopeVerified','ownerApproved']){
  const {pool,state}=fixture();
  await assert.rejects(()=>entry(pool,{request:request(),verifyBinding:async()=>({...proof(),[key]:false})}),
   /MUSEUM_CLIENT_BINDING_NOT_VERIFIED/);
  assert.equal(state.calls.filter(c=>c.sql.includes('FROM museum_public_exhibits')).length,0);
  assert.ok(state.release[0] instanceof Error);
 }
 const invalid=fixture();
 const bad=request();bad.headers.origin='https://unauthorized.example';
 await assert.rejects(()=>entry(invalid.pool,{request:bad,verifyBinding:async()=>proof()}),
  /MUSEUM_DRAFT_LIST_OWNER_AUTH_REQUIRED/);
 assert.equal(invalid.state.calls.filter(c=>c.sql.includes('FROM museum_public_exhibits')).length,0);
 const denied=fixture({owner:false});
 await assert.rejects(()=>entry(denied.pool,{request:request(),verifyBinding:async()=>proof()}),
  /MUSEUM_DRAFT_LIST_OWNER_AUTH_REQUIRED/);
 assert.equal(denied.state.calls.filter(c=>c.sql.includes('FROM museum_public_exhibits')).length,0);
});
test('private draft reader is not deployed, routed, or exposed in public scripts',()=>{
 const conf=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
 for(const path of ['museum-exhibit-owner-list-stage.mjs','museum-exhibit-owner-list-entry-stage.mjs']){
  assert.equal(conf.builds.some(b=>b.src===path),false);
  assert.equal(conf.routes.some(x=>x.src==='/'+path||x.dest==='/'+path),false);
 }
 const a=readFileSync(new URL('../museum-exhibit-owner-list-stage.mjs',import.meta.url),'utf8');
 const b=readFileSync(new URL('../museum-exhibit-owner-list-entry-stage.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(a+b,/export default|process\.env|new Pool|pool\.query|fetch\s*\(|document\.cookie|INSERT INTO|UPDATE\s+museum|DELETE FROM|DROP TABLE/);
 for(const page of ['museum.html','museum-approved-gallery.html','museum-archive.html']){
  const content=readFileSync(new URL('../'+page,import.meta.url),'utf8');
  assert.equal(content.includes('museum-exhibit-owner-list'),false);
 }
});
