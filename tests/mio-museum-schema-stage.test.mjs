import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 REQUIRED_MUSEUM_SCHEMA, OPTIONAL_ASSET_SCHEMA, REQUIRED_COLUMN_TYPES,
 REQUIRED_FOREIGN_KEYS, REQUIRED_NOT_NULL, museumSchemaReport
} from '../museum-preflight-core.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const columns=Object.entries(REQUIRED_MUSEUM_SCHEMA).flatMap(([table_name,fields])=>
 fields.map(column_name=>({
  table_name,column_name,
  data_type:REQUIRED_COLUMN_TYPES[table_name+'.'+column_name]||'text',
  is_nullable:(REQUIRED_NOT_NULL[table_name]||[]).includes(column_name)?'NO':'YES'
 })));
const status={
 table_name:'museum_public_exhibits',contype:'c',validated:true,
 definition:"CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'hidden'::text, 'trash'::text])))"
};
const keys=REQUIRED_FOREIGN_KEYS.map(([table,column,refTable,refColumn])=>({
 table_name:table,contype:'f',validated:true,
 definition:'FOREIGN KEY ('+column+') REFERENCES '+refTable+'('+refColumn+')'
}));
const valid=()=>({columns:structuredClone(columns),constraints:structuredClone([status,...keys]),identityVerified:true});
const report=x=>museumSchemaReport(x);

test('existing phase2 museum schema preflight is reusable in current Draft without writes',()=>{
 const src=read('museum-preflight-core.js');
 assert.match(src,/A checked-in migration is not evidence/);
 assert.doesNotMatch(src,/\bfetch\s*\(|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bTRUNCATE\b|\.query\s*\(/i);
 assert.deepEqual(Object.keys(REQUIRED_MUSEUM_SCHEMA).sort(),[
  'gallery_admin_devices','gallery_admin_sessions','gallery_admin_users',
  'gallery_admin_audit','museum_public_exhibits'
 ].sort());
});
test('report checks identity, column structure, status and foreign keys',()=>{
 const result=report(valid());
 assert.equal(result.schemaReady,true);
 assert.equal(result.allReady,true);
 assert.equal(result.identityVerified,true);
 assert.equal(result.foreignKeys.every(x=>x.present),true);
 assert.equal(result.tables.every(x=>x.exists&&
  !x.missing.length&&!x.wrongTypes.length&&!x.wrongNullability.length),true);
 // This is only schema identity preflight, never publish authorization.
 assert.equal('approvedForPublication' in result,false);
});
test('missing owner or audit schema must fail closed',()=>{
 for(const table of ['gallery_admin_users','gallery_admin_audit','museum_public_exhibits']){
  const p=valid();p.columns=p.columns.filter(x=>x.table_name!==table);
  assert.equal(report(p).allReady,false);
 }
});
test('missing or wrongly typed columns are rejected',()=>{
 const missing=valid();missing.columns=missing.columns.filter(x=>x.column_name!=='trashed_at');
 assert.equal(report(missing).allReady,false);
 const bad=valid();
 bad.columns.find(x=>x.table_name==='museum_public_exhibits'&&x.column_name==='revision').data_type='text';
 assert.ok(report(bad).tables.find(x=>x.table==='museum_public_exhibits').wrongTypes.includes('revision'));
 assert.equal(report(bad).allReady,false);
});
test('nullable review, identity or audit columns prevent readiness',()=>{
 for(const column of ['rights_checked_at','privacy_checked_at','reviewed_by']){
  const p=valid();
  p.columns.find(x=>x.table_name==='museum_public_exhibits'&&x.column_name===column).is_nullable='YES';
  assert.equal(report(p).allReady,false,column);
 }
});
test('invalid, unvalidated or missing public status check cannot pass',()=>{
 for(const constraint of [null,{...status,validated:false},
  {...status,definition:"CHECK (description <> 'draft' AND title <> 'published')"}]){
  const p=valid();p.constraints=[...keys,...(constraint?[constraint]:[])];
  assert.equal(report(p).statusConstraintComplete,false);
  assert.equal(report(p).allReady,false);
 }
});
test('every required role/session and reviewed-by foreign key must be verified',()=>{
 for(let i=0;i<keys.length;i++){
  const p=valid();p.constraints=[status,...keys.filter((_,j)=>i!==j)];
  assert.equal(report(p).allReady,false,'missing FK '+i);
  const unvalidated=valid();unvalidated.constraints[i+1].validated=false;
  assert.equal(report(unvalidated).allReady,false,'unvalidated FK '+i);
 }
});
test('database identity is mandatory even for structurally complete metadata',()=>{
 for(const identityVerified of [false,null,undefined,'true']){
  const p=valid();p.identityVerified=identityVerified;
  assert.equal(report(p).allReady,false);
 }
});
test('optional existing gallery table is checked independently of museum readiness',()=>{
 const p=valid();
 assert.equal(report(p).schemaReady,true);
 assert.equal(report(p).assetAuditReady,false);
 const optional=Object.entries(OPTIONAL_ASSET_SCHEMA).flatMap(([table_name,fields])=>
  fields.map(column_name=>({
   table_name,column_name,data_type:REQUIRED_COLUMN_TYPES[table_name+'.'+column_name]||'text',
   is_nullable:'YES'
  })));
 p.columns.push(...optional);
 assert.equal(report(p).assetAuditReady,true);
});
test('malformed schema inspection fails rather than pretending a clean DB',()=>{
 for(const p of [{columns:null,constraints:[]},{columns:[],constraints:null}]){
  assert.throws(()=>report(p),TypeError);
 }
 assert.equal(report({columns:[],constraints:[],identityVerified:true}).allReady,false);
});
test('candidate museum migration is additive, retains trash, and is never applied in the Draft',()=>{
 const sql=read('db/museum-public-exhibits.sql');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS museum_public_exhibits/);
 assert.match(sql,/status IN \('draft','published','hidden','trash'\)/);
 assert.match(sql,/trashed_at timestamptz/);
 assert.match(sql,/reviewed_by uuid NOT NULL REFERENCES gallery_admin_users\(id\)/);
 assert.doesNotMatch(sql,/\b(?:DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER)\s+(?:TABLE|FROM|INTO|museum_public_exhibits)\b/i);
 assert.match(sql,/NEVER run from the public API/);
 const config=JSON.parse(read('vercel.json'));
 for(const path of ['museum-preflight-core.js','db/museum-public-exhibits.sql']){
  assert.equal(config.builds.some(x=>x.src===path),false);
  assert.equal(config.routes.some(x=>x.src==='/'+path),false);
 }
 for(const api of ['api-museum-exhibits.js','api-museum-preflight.js']){
  assert.equal(config.builds.some(x=>x.src===api),false);
 }
});
