import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectMuseumGallerySchemaStage} from '../museum-gallery-schema-inspect-stage.mjs';

const response=rows=>({command:'SELECT',rowCount:rows.length,rows});
function client({database='neondb',columns=[],constraints=[],failAt=null,
 invalidColumns=false,beginFail=false,commitFail=false}={}){
 const c={calls:[],rollback:0,async query(sql,args=[]){
  this.calls.push({sql,args});
  if(this.calls.length===failAt)throw Error('postgres://private-host:password@secret');
  if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
   return {command:beginFail?'UNKNOWN':'BEGIN'};
  if(sql==='ROLLBACK'){this.rollback++;return {command:'ROLLBACK'};}
  if(sql==='COMMIT')return {command:commitFail?'UNKNOWN':'COMMIT'};
  if(sql.includes('current_database()'))return response([{database_name:database}]);
  if(sql.includes('information_schema.columns'))
   return invalidColumns?{command:'SELECT',rowCount:2,rows:[]}:
    response(columns);
  if(sql.includes('pg_catalog.pg_constraint'))return response(constraints);
  throw Error('Unexpected or mutating SQL '+sql);
 }};
 return c;
}
const inspect=(c,independentBranchVerified=true)=>
 inspectMuseumGallerySchemaStage(c,{expectedDatabaseName:'neondb',independentBranchVerified});
test('inspects only schema metadata using a single READ ONLY transaction',async()=>{
 const c=client(),result=await inspect(c);
 assert.equal(result.identityVerified,true);
 assert.equal(result.schemaReady,false,'missing real tables must not be ready');
 assert.equal(result.allReady,false);
 assert.equal(result.backupVerified,false);
 assert.equal(result.ownerApproved,false);
 assert.equal(result.canDeploy,false);
 assert.equal(c.calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal(c.calls.at(-1).sql,'COMMIT');
 assert.equal(c.calls.length,5);
 assert.equal(c.calls.every(x=>!/\bINSERT\s+INTO|\bUPDATE\s+|\bDELETE\s+FROM|\bDROP\s+TABLE/i.test(x.sql)),true);
 assert.equal(c.rollback,0);
});
test('matching database name alone does not prove the Neon project and branch',async()=>{
 const c=client(),result=await inspect(c,false);
 assert.equal(result.identityVerified,false);
 assert.equal(result.allReady,false);
});
test('wrong database name remains a failed identity match',async()=>{
 const c=client({database:'anotherdb'});
 const result=await inspect(c);
 assert.equal(result.identityVerified,false);
 assert.equal(result.allReady,false);
});
test('untrusted expected database labels cannot trigger a query',async()=>{
 const c=client();
 for(const expectedDatabaseName of ['',undefined,'dbname;DROP TABLE users','a'.repeat(100)]){
  await assert.rejects(()=>inspectMuseumGallerySchemaStage(c,{
   expectedDatabaseName,independentBranchVerified:true
  }),/MUSEUM_INSPECT_DATABASE_NAME_INVALID/);
 }
 assert.equal(c.calls.length,0);
});
test('database query and credentials failures are masked and rolled back',async()=>{
 for(const failAt of [2,3,4]){
  const c=client({failAt});
  await assert.rejects(()=>inspect(c),e=>{
   assert.equal(e.message,'MUSEUM_INSPECT_QUERY_FAILED');
   assert.equal(e.message.includes('private-host'),false);
   return true;
  });
  assert.equal(c.rollback,1);
  assert.equal(c.calls.at(-1).sql,'ROLLBACK');
 }
});
test('malformed or incomplete schema metadata is rejected without returning a readiness claim',async()=>{
 const c=client({invalidColumns:true});
 await assert.rejects(()=>inspect(c),/MUSEUM_INSPECT_DATABASE_RESPONSE_UNVERIFIED/);
 assert.equal(c.rollback,1);
});
test('read-only commit must be acknowledged before any report is accepted',async()=>{
 const c=client({commitFail:true});
 await assert.rejects(()=>inspect(c),/MUSEUM_INSPECT_READ_COMMIT_UNCONFIRMED/);
 assert.equal(c.rollback,1);
});
test('a broken transaction opening fails before any metadata queries',async()=>{
 const c=client({beginFail:true});
 await assert.rejects(()=>inspect(c),/MUSEUM_INSPECT_BEGIN_UNVERIFIED/);
 assert.equal(c.calls.length,1);
});
test('schema introspection remains unexposed in the Vercel routing and build manifest',()=>{
 const src=readFileSync(new URL('../museum-gallery-schema-inspect-stage.mjs',import.meta.url),'utf8');
 const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(src,/export default|process\.env|Pool\s*\(|GALLERY_DATABASE_URL|fetch\s*\(/);
 assert.equal(vercel.routes.some(x=>x.dest==='/museum-gallery-schema-inspect-stage.mjs'),false);
 assert.equal(vercel.builds.some(x=>x.src==='museum-gallery-schema-inspect-stage.mjs'),false);
});
