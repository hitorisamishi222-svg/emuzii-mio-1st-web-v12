import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withDedicatedMuseumStageClient} from '../museum-gallery-client-stage.mjs';

const proof=()=>({
 identityVerified:true,schemaReady:true,backupVerified:true,ownerApproved:true
});
const mock=()=>{
 const state={connections:0,queryCount:0,releases:[],clients:[]};
 const pool={
  get query(){throw Error('pooled query must never be used');},
  async connect(){
   state.connections++;
   const client={
    async query(){state.queryCount++;return {command:'SELECT',rows:[],rowCount:0}},
    release(error){state.releases.push(error)}
   };
   state.clients.push(client);
   return client;
  }
 };
 return {pool,state};
};
const run=(pool,verifyBinding=async()=>proof(),perform=async()=>42)=>
 withDedicatedMuseumStageClient(pool,{verifyBinding,perform});

test('stage wrapper uses one checked-out client for both identity and work and releases once',async()=>{
 const {pool,state}=mock();
 let checked;
 const result=await run(pool,async client=>{
  checked=client;await client.query('SELECT 1');return proof();
 },async client=>{
  assert.equal(client,checked);
  await client.query('SELECT 2');return {ok:true};
 });
 assert.deepEqual(result,{ok:true});
 assert.equal(state.connections,1);
 assert.equal(state.queryCount,2);
 assert.equal(state.releases.length,1);
 assert.equal(state.releases[0],undefined);
});
test('no database work runs without independently verified branch/schema/backup and owner decision',async()=>{
 for(const key of ['identityVerified','schemaReady','backupVerified','ownerApproved']){
  const {pool,state}=mock();
  let executed=false;
  await assert.rejects(()=>run(pool,async()=>({...proof(),[key]:false}),
   async()=>{executed=true}),/MUSEUM_CLIENT_BINDING_NOT_VERIFIED/);
  assert.equal(executed,false);
  assert.equal(state.connections,1);
  assert.equal(state.releases.length,1);
  assert.ok(state.releases[0] instanceof Error);
 }
});
test('missing or malformed proof never turns a connection into an authorized editor',async()=>{
 for(const invalid of [null,{},undefined,{...proof(),ownerApproved:'true'}]){
  const {pool,state}=mock();
  await assert.rejects(()=>run(pool,async()=>invalid),/BINDING_NOT_VERIFIED/);
  assert.equal(state.releases.length,1);
  assert.ok(state.releases[0] instanceof Error);
 }
});
test('a failed DB operation discards the connection rather than returning an aborted transaction',async()=>{
 const {pool,state}=mock();
 const error=Error('uncertain transaction outcome');
 await assert.rejects(()=>run(pool,async()=>proof(),async()=>{throw error}),error);
 assert.equal(state.releases[0],error);
});
test('a throwing schema identity check is fail-closed and discards the client',async()=>{
 const {pool,state}=mock();
 const error=Error('DB branch cannot be verified');
 await assert.rejects(()=>run(pool,async()=>{throw error}),error);
 assert.equal(state.releases[0],error);
});
test('invalid pool, client and callback shapes never run a production query',async()=>{
 await assert.rejects(()=>withDedicatedMuseumStageClient({
  query:async()=>({rows:[]})
 },{verifyBinding:async()=>proof(),perform:async()=>42}),/DEPENDENCY_REQUIRED/);
 const {pool,state}=mock();
 await assert.rejects(()=>withDedicatedMuseumStageClient(pool,{
  verifyBinding:async()=>proof()
 }),/DEPENDENCY_REQUIRED/);
 assert.equal(state.connections,0);
 const broken={
  async connect(){return {query:null,release(error){this.discarded=error}}}
 };
 await assert.rejects(()=>run(broken),/MUSEUM_CLIENT_INVALID/);
});
test('a connection error is redacted without emitting driver URLs or credentials',async()=>{
 const pool={async connect(){throw Error('postgresql://secret:password@example.com')}};
 await assert.rejects(()=>run(pool),error=>{
  assert.equal(error.message,'MUSEUM_CLIENT_CONNECT_FAILED');
  assert.equal(error.message.includes('secret'),false);
  return true;
 });
});
test('two independent operations never reuse a released checked-out client',async()=>{
 const {pool,state}=mock();
 await run(pool);
 await run(pool);
 assert.equal(state.connections,2);
 assert.equal(state.releases.length,2);
 assert.notEqual(state.clients[0],state.clients[1]);
});
test('stage client contract cannot become an HTTP handler or publish on its own',()=>{
 const path='museum-gallery-client-stage.mjs';
 const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.builds.some(b=>b.src===path),false);
 assert.equal(config.routes.some(x=>x.dest==='/'+path||x.src==='/'+path),false);
 assert.doesNotMatch(src,/export default|process\.env|@vercel\/blob|GALLERY_DATABASE_URL|fetch\s*\(|DELETE FROM|INSERT INTO|UPDATE\s+museum/i);
});
