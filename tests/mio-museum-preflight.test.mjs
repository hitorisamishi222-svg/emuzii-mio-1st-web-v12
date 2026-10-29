import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {REQUIRED_MUSEUM_SCHEMA,OPTIONAL_ASSET_SCHEMA,REQUIRED_COLUMN_TYPES,museumSchemaReport} from '../museum-preflight-core.js';
import {createMuseumPreflightHandler} from '../api-museum-preflight.js';

const HOST='emuzii-mio-1st-web-v12.vercel.app';
const expected='museum_safe_test';
const schemaRows=Object.entries(REQUIRED_MUSEUM_SCHEMA).flatMap(([table_name,fields])=>
 fields.map(column_name=>({table_name,column_name,data_type:REQUIRED_COLUMN_TYPES[table_name+'.'+column_name]||'text'})));
const optionalRows=Object.entries(OPTIONAL_ASSET_SCHEMA).flatMap(([table_name,fields])=>
 fields.map(column_name=>({table_name,column_name,data_type:REQUIRED_COLUMN_TYPES[table_name+'.'+column_name]||'text'})));
const statusCheck=[{definition:"CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'hidden'::text, 'trash'::text])))"}];
const reply=()=>({code:200,data:null,headers:{},
 setHeader(k,v){this.headers[k]=v;},
 status(n){this.code=n;return this;},
 json(v){this.data=v;return this;}
});
const request=(method='GET',host=HOST)=>({method,headers:{host},query:{}});
const envKeys=['GALLERY_DATABASE_URL','MIO_MUSEUM_PREFLIGHT_ENABLED','MIO_MUSEUM_EXPECTED_DB_HOST','MIO_MUSEUM_EXPECTED_DB_NAME'];
async function env(fn){
 const old=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 process.env.GALLERY_DATABASE_URL='postgres://fake:secret@museum.safe.test:5432/museum_safe_test?sslmode=require';
 process.env.MIO_MUSEUM_PREFLIGHT_ENABLED='true';
 process.env.MIO_MUSEUM_EXPECTED_DB_HOST='museum.safe.test';
 process.env.MIO_MUSEUM_EXPECTED_DB_NAME=expected;
 try{return await fn();}finally{
  for(const k of envKeys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
 }
}
function fakePool(query){
 return class Pool{
  async connect(){return {query,release(){}};}
  async end(){}
 };
}
const mockQueries=(names=[])=>async(sql,args)=>{
 names.push(sql);
 if(sql==='SELECT current_database() AS db_name')return {rows:[{db_name:expected}]};
 if(sql.includes('information_schema.columns')){
  assert.deepEqual(args,[[...Object.keys(REQUIRED_MUSEUM_SCHEMA),...Object.keys(OPTIONAL_ASSET_SCHEMA)]]);
  return {rows:[...schemaRows,...optionalRows]};
 }
 if(sql.includes('pg_constraint'))return {rows:statusCheck};
 throw Error('Unexpected or mutating SQL:'+sql);
};
const handler=(query,verify=async()=>({id:'test-id',role:'owner'}))=>
 createMuseumPreflightHandler({PoolClass:fakePool(query),verifyAdmin:verify});
test('schema report detects all five required tables, columns and trash status',()=>{
 const result=museumSchemaReport({columns:schemaRows,constraints:statusCheck,identityVerified:true});
 assert.equal(result.tables.length,5);
 assert.equal(result.allReady,true);
 assert.equal(result.statusConstraintComplete,true);
 assert.equal(result.tables.every(x=>x.exists&&x.missing.length===0&&x.wrongTypes.length===0),true);
 assert.equal(result.assetAuditReady,false,'optional override table not implied by museum readiness');
});
test('schema report fails closed on missing column, constraint and identity',()=>{
 const noTrash=schemaRows.filter(x=>x.column_name!=='trashed_at');
 assert.equal(museumSchemaReport({columns:noTrash,constraints:statusCheck,identityVerified:true}).schemaReady,false);
 assert.equal(museumSchemaReport({columns:schemaRows,constraints:[],identityVerified:true}).allReady,false);
 assert.equal(museumSchemaReport({columns:schemaRows,constraints:statusCheck,identityVerified:false}).allReady,false);
 assert.equal(museumSchemaReport({columns:schemaRows,constraints:[{definition:"CHECK (description <> 'draft' AND title <> 'trash' AND credit <> 'hidden' AND kind <> 'published')"}],identityVerified:true}).statusConstraintComplete,false);
 assert.throws(()=>museumSchemaReport({columns:null,constraints:[],identityVerified:true}),TypeError);
});
test('readiness endpoint is opt-in; closed by default with no DB connection',async()=>{
 const original=process.env.MIO_MUSEUM_PREFLIGHT_ENABLED;
 delete process.env.MIO_MUSEUM_PREFLIGHT_ENABLED;
 try{
  const fn=handler(async()=>{throw Error('DB must never be called');});
  const out=reply();await fn(request(),out);
  assert.equal(out.code,503);assert.equal(out.data.code,'PREFLIGHT_CLOSED');
 }finally{if(original===undefined)delete process.env.MIO_MUSEUM_PREFLIGHT_ENABLED;else process.env.MIO_MUSEUM_PREFLIGHT_ENABLED=original;}
});
test('only canonical production host and GET are allowed',async()=>{
 await env(async()=>{
  let queries=0;const fn=handler(async()=>{queries++;throw Error('DB access');});
  const wrong=reply();await fn(request('GET','preview.vercel.app'),wrong);
  assert.equal(wrong.code,503);
  const post=reply();await fn(request('POST'),post);
  assert.equal(post.code,405);
  assert.equal(queries,0);
 });
});
test('owner-authenticated preflight only reads system catalog metadata',async()=>{
 await env(async()=>{
  const q=[];const out=reply();
  await handler(mockQueries(q))(request(),out);
  assert.equal(out.code,200);
  assert.equal(out.data.ok,true);assert.equal(out.data.allReady,true);
  assert.equal(out.data.assetAuditReady,true);
  assert.equal(out.data.mode,'read_only');
  assert.equal(q.length,3);
  assert.ok(q.every(sql=>/^\s*SELECT\b/i.test(sql)),'all SQL must be read-only');
  assert.equal(out.headers['Cache-Control'],'private, no-store');
  const serialized=JSON.stringify(out.data);
  for(const secret of ['fake:secret','museum.safe.test','museum_safe_test','test-id'])
   assert.ok(!serialized.includes(secret),'sensitive DB identifiers must not leak');
 });
});
test('unapproved session and non-owner are denied before schema queries',async()=>{
 await env(async()=>{
  for(const [user,code] of [[null,401],[{id:'admin',role:'admin'},403]]){
   let count=0;
   const fn=handler(async()=>{count++;throw Error('unexpected query');},async()=>user);
   const out=reply();await fn(request(),out);
   assert.equal(out.code,code);
   assert.equal(count,0);
  }
 });
});
test('DB name and host confirmation are both mandatory and never returned',async()=>{
 await env(async()=>{
  delete process.env.MIO_MUSEUM_EXPECTED_DB_HOST;
  const a=reply();await handler(mockQueries([]))(request(),a);
  assert.equal(a.code,200);
  assert.equal(a.data.identityVerified,false);assert.equal(a.data.allReady,false);
  process.env.MIO_MUSEUM_EXPECTED_DB_HOST='different.safe.test';
  const b=reply();await handler(mockQueries([]))(request(),b);
  assert.equal(b.data.identityVerified,false);
  process.env.MIO_MUSEUM_EXPECTED_DB_HOST='museum.safe.test';
  process.env.MIO_MUSEUM_EXPECTED_DB_NAME='another_database';
  const c=reply();await handler(mockQueries([]))(request(),c);
  assert.equal(c.data.identityVerified,false);
 });
});
test('schema lookup errors never return partial or secret contents',async()=>{
 await env(async()=>{
  const fn=handler(async()=>{throw Error('secret connection text');});
  const out=reply();await fn(request(),out);
  assert.equal(out.code,503);assert.equal(out.data.code,'PREFLIGHT_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(out.data),/secret|connection text/);
 });
});
test('owner view has one-tap read-only readiness and authenticated route',()=>{
 const page=readFileSync(new URL('../museum-curate.html',import.meta.url),'utf8');
 const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.match(page,/id="preflightPanel"/);
 assert.match(page,/id="runPreflight"/);
 assert.match(page,/id="preflightStatus"/);
 assert.match(page,/fetch\('\/api\/gallery\/museum\/preflight'/);
 assert.match(page,/DBを変更しません/);
 assert.ok(vercel.routes.some(x=>x.src==='/api/gallery/museum/preflight'&&x.dest==='/api-museum-preflight.js'));
 assert.ok(vercel.builds.some(x=>x.src==='api-museum-preflight.js'&&x.use==='@vercel/node'));
 const start=page.indexOf('<script>'),end=page.indexOf('</script>',start);
 assert.doesNotThrow(()=>new Script(page.slice(start+8,end)));
});

test('wrong PostgreSQL column types fail closed even when names match',()=>{
 const corrupted=schemaRows.map(row=>row.table_name==='museum_public_exhibits'&&row.column_name==='revision'?
  {...row,data_type:'text'}:row);
 const report=museumSchemaReport({columns:corrupted,constraints:statusCheck,identityVerified:true});
 assert.equal(report.schemaReady,false);
 assert.ok(report.tables.find(x=>x.table==='museum_public_exhibits').wrongTypes.includes('revision'));
 const missingType=schemaRows.map(row=>row.table_name==='museum_public_exhibits'&&row.column_name==='status'?
  {...row,data_type:undefined}:row);
 assert.equal(museumSchemaReport({columns:missingType,constraints:statusCheck,identityVerified:true}).allReady,false);
});
test('optional live-overrides table readiness is independent of museum publishing readiness',()=>{
 const baseline=museumSchemaReport({columns:schemaRows,constraints:statusCheck,identityVerified:true});
 assert.equal(baseline.allReady,true);
 assert.equal(baseline.assetAuditReady,false);
 const full=museumSchemaReport({columns:[...schemaRows,...optionalRows],constraints:statusCheck,identityVerified:true});
 assert.equal(full.allReady,true);
 assert.equal(full.assetAuditReady,true);
 const partial=museumSchemaReport({columns:[...schemaRows,...optionalRows.filter(x=>x.column_name!=='thumbnail_url')],constraints:statusCheck,identityVerified:true});
 assert.equal(partial.allReady,true);
 assert.equal(partial.assetAuditReady,false);
 assert.ok(partial.optionalTables[0].missing.includes('thumbnail_url'));
});

test('checked-in manual DB inventory cannot alter any table or participant data',()=>{
 const sql=readFileSync(new URL('../db/museum-phase2-readonly-inventory.sql',import.meta.url),'utf8');
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/i);
 assert.match(sql,/COMMIT;/i);
 assert.match(sql,/information_schema\.tables/);
 assert.match(sql,/information_schema\.columns/);
 assert.match(sql,/pg_get_constraintdef/);
 assert.match(sql,/gallery_live_overrides/);
 const executable=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
 assert.doesNotMatch(executable,/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
 assert.doesNotMatch(executable,/https?:\/\/|[a-z0-9.+-]+@[^ /]+:5432/i,'inventory must not include a credential or host');
});
