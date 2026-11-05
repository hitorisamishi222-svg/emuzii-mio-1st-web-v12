import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {museumGalleryReleaseSchemaReport} from '../museum-gallery-release-schema-stage.mjs';
import {REQUIRED_MUSEUM_SCHEMA,REQUIRED_COLUMN_TYPES,REQUIRED_NOT_NULL,
 REQUIRED_FOREIGN_KEYS} from '../museum-preflight-core.js';

const status={table_name:'museum_public_exhibits',contype:'c',validated:true,
 definition:"CHECK (status = ANY (ARRAY['draft'::text,'published'::text,'hidden'::text,'trash'::text]))"};
const review={table_name:'museum_public_exhibits',contype:'c',validated:true,
 definition:"CHECK ((status <> 'published'::text) OR (rights_checked_at IS NOT NULL AND privacy_checked_at IS NOT NULL AND reviewed_by IS NOT NULL AND published_at IS NOT NULL))"};
const roomKinds={table_name:'museum_public_exhibits',contype:'c',validated:true,
 definition:"CHECK (kind = ANY (ARRAY['gallery'::text,'icons'::text,'moments'::text,'events'::text]))"};
const mediaCategories={table_name:'museum_public_exhibits',contype:'c',validated:true,
 definition:"CHECK (category = ANY (ARRAY['イラスト'::text,'動画'::text,'音声・楽曲'::text,'ファンアート'::text,'その他'::text]))"};
const chronology={table_name:'museum_public_exhibits',contype:'c',validated:true,
 definition:"CHECK ((status <> 'published'::text) OR (rights_checked_at <= published_at AND privacy_checked_at <= published_at))"};
const baseColumns=Object.entries(REQUIRED_MUSEUM_SCHEMA).flatMap(([table_name,cols])=>
 cols.map(column_name=>({table_name,column_name,
  data_type:REQUIRED_COLUMN_TYPES[table_name+'.'+column_name]||'text',
  is_nullable:(REQUIRED_NOT_NULL[table_name]||[]).includes(column_name)?'NO':'YES'})));
const baseKeys=REQUIRED_FOREIGN_KEYS.map(([table_name,column,to,ref])=>({
 table_name,contype:'f',validated:true,
 definition:'FOREIGN KEY ('+column+') REFERENCES '+to+'('+ref+')'
}));
const extra={
 gallery_live_overrides:{
  item_id:'text',hidden:'boolean',deleted:'boolean',
  revision:'bigint',updated_at:'timestamp with time zone'
 },
 museum_gallery_layout_stage:{
  layout_key:'text',draft_revision:'bigint',draft_order:'jsonb',
  draft_visible_ids:'jsonb',draft_featured_id:'text',drafted_by:'uuid',
  published_revision:'bigint',published_from_draft_revision:'bigint',
  published_order:'jsonb',published_visible_ids:'jsonb',published_review_hashes:'jsonb',
  published_featured_id:'text',published_by:'uuid',
  published_at:'timestamp with time zone'
 },
 museum_gallery_layout_history_stage:{
  layout_key:'text',published_revision:'bigint',source_draft_revision:'bigint',
  snapshot_order:'jsonb',snapshot_visible_ids:'jsonb',snapshot_review_hashes:'jsonb',
  snapshot_featured_id:'text',published_by:'uuid',
  published_at:'timestamp with time zone'
 },
 museum_gallery_layout_audit_stage:{
  operation_id:'text',payload_hash:'text',actor_id:'uuid',
  action:'text',prior_revision:'bigint',new_revision:'bigint'
 },
 museum_exhibit_draft_operations_stage:{
  operation_id:'text',actor_id:'uuid',exhibit_id:'uuid',
  action:'text',payload_hash:'text',revision:'integer',
  recorded_at:'timestamp with time zone'
 }
};
const nullable=Object.freeze({
 museum_gallery_layout_stage:new Set(['draft_featured_id','drafted_by',
  'published_revision','published_from_draft_revision','published_order',
  'published_visible_ids','published_featured_id','published_by','published_at']),
 museum_gallery_layout_history_stage:new Set(['snapshot_featured_id'])
});
const extraCols=Object.entries(extra).flatMap(([table_name,cols])=>
 Object.entries(cols).map(([column_name,data_type])=>({
  table_name,column_name,data_type,
  is_nullable:nullable[table_name]?.has(column_name)?'YES':'NO'
 })));
const moreConstraints=[
 {table_name:'museum_gallery_layout_stage',contype:'p',validated:true,
  definition:'PRIMARY KEY (layout_key)'},
 {table_name:'museum_gallery_layout_history_stage',contype:'u',validated:true,
  definition:'UNIQUE (layout_key,published_revision)'},
 {table_name:'museum_gallery_layout_audit_stage',contype:'u',validated:true,
  definition:'UNIQUE (operation_id)'},
 {table_name:'museum_gallery_layout_audit_stage',contype:'c',validated:true,
  definition:"CHECK (action = ANY (ARRAY['draft','publish','rollback']))"},
 {table_name:'museum_gallery_layout_stage',contype:'c',validated:true,
  definition:'CHECK (draft_order @> draft_visible_ids)'},
 {table_name:'museum_gallery_layout_history_stage',contype:'c',validated:true,
  definition:'CHECK (snapshot_order @> snapshot_visible_ids)'},
 {table_name:'museum_gallery_layout_stage',contype:'f',validated:true,
  definition:'FOREIGN KEY (drafted_by) REFERENCES gallery_admin_users(id)'},
 {table_name:'museum_gallery_layout_stage',contype:'c',validated:true,
  definition:"CHECK ((published_review_hashes IS NULL) OR (jsonb_typeof(published_review_hashes) = 'object'))"},
 {table_name:'museum_gallery_layout_history_stage',contype:'c',validated:true,
  definition:"CHECK (jsonb_typeof(snapshot_review_hashes) = 'object')"},
 {table_name:'museum_gallery_layout_history_stage',contype:'f',validated:true,
  definition:'FOREIGN KEY (published_by) REFERENCES gallery_admin_users(id)'},
 {table_name:'museum_gallery_layout_stage',contype:'f',validated:true,
  definition:'FOREIGN KEY (published_by) REFERENCES gallery_admin_users(id)'},
 {table_name:'museum_gallery_layout_stage',contype:'c',validated:true,
  definition:'CHECK (draft_featured_id IS NULL OR draft_visible_ids ? draft_featured_id)'},
 {table_name:'museum_gallery_layout_stage',contype:'c',validated:true,
  definition:'CHECK (published_featured_id IS NULL OR published_visible_ids ? published_featured_id)'},
 {table_name:'museum_gallery_layout_history_stage',contype:'c',validated:true,
  definition:'CHECK (snapshot_featured_id IS NULL OR snapshot_visible_ids ? snapshot_featured_id)'},
 {table_name:'museum_gallery_layout_audit_stage',contype:'f',validated:true,
  definition:'FOREIGN KEY (actor_id) REFERENCES gallery_admin_users(id)'}
];
const legacyConstraints=[
 {table_name:'gallery_live_overrides',contype:'p',validated:true,
  definition:'PRIMARY KEY (item_id)'},
 {table_name:'gallery_live_overrides',contype:'c',validated:true,
  definition:"CHECK ((item_id ~ '^[a-z0-9-]{3,70}"+String.fromCharCode(36)+"'::text))"},
 {table_name:'gallery_live_overrides',contype:'f',validated:true,
  definition:'FOREIGN KEY (updated_by) REFERENCES gallery_admin_users(id)'}
];
const receiptConstraints=[
 {table_name:'museum_exhibit_draft_operations_stage',contype:'p',validated:true,
  definition:'PRIMARY KEY (operation_id)'},
 {table_name:'museum_exhibit_draft_operations_stage',contype:'u',validated:true,
  definition:'UNIQUE (exhibit_id,revision)'},
 {table_name:'museum_exhibit_draft_operations_stage',contype:'f',validated:true,
  definition:'FOREIGN KEY (actor_id) REFERENCES gallery_admin_users(id)'},
 {table_name:'museum_exhibit_draft_operations_stage',contype:'f',validated:true,
  definition:'FOREIGN KEY (exhibit_id) REFERENCES museum_public_exhibits(id)'},
 {table_name:'museum_exhibit_draft_operations_stage',contype:'c',validated:true,
  definition:"CHECK (action = ANY (ARRAY['create'::text,'edit'::text]))"},
 {table_name:'museum_exhibit_draft_operations_stage',contype:'c',validated:true,
  definition:"CHECK (operation_id ~ '^[a-f0-9]{32}$'::text)"},
 {table_name:'museum_exhibit_draft_operations_stage',contype:'c',validated:true,
  definition:"CHECK (payload_hash ~ '^[a-f0-9]{64}$'::text)"},
 {table_name:'museum_exhibit_draft_operations_stage',contype:'c',validated:true,
  definition:'CHECK (revision >= 0)'}
];
const good=()=>({identityVerified:true,
 columns:structuredClone([...baseColumns,...extraCols]),
 constraints:structuredClone([status,review,roomKinds,mediaCategories,chronology,...baseKeys,
  ...legacyConstraints,...receiptConstraints,...moreConstraints])
});
const report=input=>museumGalleryReleaseSchemaReport(input);
test('media type requires an independent non-bypassable check in the real DB',()=>{
 const missing=good();
 missing.constraints=missing.constraints.filter(x=>x.definition!==mediaCategories.definition);
 assert.equal(report(missing).mediaCategoryReady,false);
 assert.equal(report(missing).allReady,false);
 for(const expression of [
  "CHECK (category IN ('イラスト','動画','音声・楽曲','ファンアート','その他') OR TRUE)",
  "CHECK (category IS NOT NULL)",
  "CHECK (kind IN ('gallery','icons','moments','events'))"
 ]){
  const x=good();
  x.constraints.find(c=>c.definition===mediaCategories.definition).definition=expression;
  assert.equal(report(x).mediaCategoryReady,false,expression);
  assert.equal(report(x).allReady,false,expression);
 }
});
test('exhibit draft receipt table is mandatory even if the layout subsystem is valid',()=>{
 const noTable=good();
 noTable.columns=noTable.columns.filter(c=>
  c.table_name!=='museum_exhibit_draft_operations_stage');
 assert.equal(report(noTable).layoutReady,true);
 assert.equal(report(noTable).exhibitReceiptReady,false);
 assert.equal(report(noTable).allReady,false);
 for(const name of ['operation_id','actor_id','exhibit_id','action','payload_hash','revision','recorded_at']){
  const x=good();
  x.columns=x.columns.filter(c=>!(c.table_name==='museum_exhibit_draft_operations_stage'&&
   c.column_name===name));
  const r=report(x);
  assert.equal(r.exhibitReceiptReady,false,name);
  assert.ok(r.tables.find(t=>t.table==='museum_exhibit_draft_operations_stage').missing.includes(name),name);
 }
 for(const name of ['actor_id','payload_hash','recorded_at']){
  const x=good();
  x.columns.find(c=>c.table_name==='museum_exhibit_draft_operations_stage'&&
   c.column_name===name).is_nullable='YES';
  assert.equal(report(x).exhibitReceiptReady,false,name);
 }
 for(const name of ['operation_id','revision','recorded_at']){
  const x=good();
  x.columns.find(c=>c.table_name==='museum_exhibit_draft_operations_stage'&&
   c.column_name===name).data_type='wrong';
  assert.equal(report(x).exhibitReceiptReady,false,name);
 }
});
test('receipt primary, unique, foreign-key and check constraints all block unsafe readiness',()=>{
 for(let i=0;i<receiptConstraints.length;i++){
  for(const change of ['missing','unvalidated']){
   const x=good();
   const receipt=x.constraints.filter(c=>c.table_name==='museum_exhibit_draft_operations_stage');
   const row=receipt[i];
   if(change==='missing')x.constraints=x.constraints.filter(c=>c!==row);
   else row.validated=false;
   const r=report(x);
   assert.equal(r.exhibitReceiptReady,false,i+' '+change);
   assert.equal(r.layoutReady,true);
   assert.equal(r.allReady,false);
  }
 }
});
test('bypassable or too-broad receipt IDs, actions and revisions never pass',()=>{
 for(const [needle,bad] of [
  ['operation_id ~',"CHECK (operation_id ~ '^[a-f0-9]{32}$' OR TRUE)"],
  ['operation_id ~',"CHECK (operation_id !~ '^[a-f0-9]{32}$')"],
  ['payload_hash ~',"CHECK (payload_hash ~ '^[a-f0-9]{63}$')"],
  ['payload_hash ~',"CHECK (payload_hash ~ '^[a-f0-9]{64}$' OR TRUE)"],
  ['action = ANY',"CHECK (action IN ('create','edit','publish'))"],
  ['action = ANY',"CHECK (action IN ('create','edit') OR TRUE)"],
  ['revision >=',"CHECK (revision >= -1)"],
  ['revision >=',"CHECK (revision >= 0 OR TRUE)"]
 ]){
  const x=good();
  const row=x.constraints.find(c=>
   c.table_name==='museum_exhibit_draft_operations_stage'&&
   String(c.definition).includes(needle));
  assert.ok(row,needle);
  row.definition=bad;
  const r=report(x);
  assert.equal(r.exhibitReceiptReady,false,bad);
  assert.equal(r.allReady,false,bad);
 }
});
test('a staged release can be reviewed only when base museum, live overrides and all layout tables exist',()=>{
 const result=report(good());
 assert.equal(result.identityVerified,true);
 assert.equal(result.baseMuseumReady,true);
 assert.equal(result.sourceReady,true);
 assert.equal(result.roomKindReady,true);
 assert.equal(result.mediaCategoryReady,true);
 assert.equal(result.layoutReady,true);
 assert.equal(result.exhibitReceiptReady,true);
 assert.equal(Object.values(result.receiptChecks).every(Boolean),true);
 assert.equal(result.allReady,true);
 assert.equal(result.canPublish,false);
 assert.equal(result.canDeploy,false);
 assert.equal(result.tables.every(x=>x.ready),true);
});
test('an actual checked DB must accept all four owner-curated exhibition rooms',()=>{
 for(const definition of [
  "CHECK (kind = ANY (ARRAY['icons','moments','events']))",
  "CHECK (kind <> 'invalid' AND title <> 'gallery' AND title <> 'icons' AND title <> 'moments' AND title <> 'events')",
  "CHECK (kind NOT IN ('gallery','icons','moments','events'))"
 ]){
  const x=good();x.constraints[2].definition=definition;
  assert.equal(report(x).roomKindReady,false,definition);
  assert.equal(report(x).allReady,false,definition);
 }
 const unvalidated=good();unvalidated.constraints[2].validated=false;
 assert.equal(report(unvalidated).roomKindReady,false);
 const absent=good();absent.constraints.splice(2,1);
 assert.equal(report(absent).roomKindReady,false);
});
test('release requires real DB chronology check, not just source code',()=>{
 const ready=report(good());
 assert.equal(ready.reviewChronologyReady,true);
 for(const invalidate of [
  c=>{c.validated=false},
  c=>{c.definition="CHECK (status <> 'published' OR rights_checked_at >= published_at AND privacy_checked_at >= published_at)"},
  c=>{c.definition="CHECK (status <> 'published' OR rights_checked_at <= published_at)"}
 ]){
  const x=good();
  const row=x.constraints.find(c=>c.table_name==='museum_public_exhibits'&&
   c.definition.includes('rights_checked_at <= published_at'));
  assert.ok(row);
  invalidate(row);
  assert.equal(report(x).reviewChronologyReady,false);
  assert.equal(report(x).allReady,false);
 }
 const missing=good();
 missing.constraints=missing.constraints.filter(c=>c.definition!==chronology.definition);
 assert.equal(report(missing).reviewChronologyReady,false);
});
test('SQL check that lists rooms but allows OR TRUE cannot pass the room gate',()=>{
 const x=good();
 const row=x.constraints.find(c=>c.table_name==='museum_public_exhibits'&&
  c.definition.includes('kind = ANY'));
 assert.ok(row);
 row.definition="CHECK (kind = ANY (ARRAY['gallery','icons','moments','events']) OR TRUE)";
 assert.equal(report(x).roomKindReady,false);
 assert.equal(report(x).allReady,false);
});
test('chronology must require BOTH independent review timestamps, never either one',()=>{
 const definitions=[
  "CHECK (status <> 'published' OR (rights_checked_at <= published_at OR privacy_checked_at <= published_at))",
  "CHECK (status <> 'published' OR (rights_checked_at <= published_at AND privacy_checked_at <= published_at) OR TRUE)",
  "CHECK (NOT (status <> 'published' OR rights_checked_at <= published_at AND privacy_checked_at <= published_at))"
 ];
 for(const definition of definitions){
  const x=good(),row=x.constraints.find(c=>
   c.table_name==='museum_public_exhibits'&&
   c.definition.includes('rights_checked_at <= published_at'));
  assert.ok(row);
  row.definition=definition;
  assert.equal(report(x).reviewChronologyReady,false,definition);
  assert.equal(report(x).allReady,false,definition);
 }
});
test('publication and history review fingerprints are necessary for release readiness',()=>{
 for(const [table,column] of [
  ['museum_gallery_layout_stage','published_review_hashes'],
  ['museum_gallery_layout_history_stage','snapshot_review_hashes']
 ]){
  const x=good();
  x.columns=x.columns.filter(c=>!(c.table_name===table&&c.column_name===column));
  assert.equal(report(x).allReady,false);
  assert.ok(report(x).tables.find(t=>t.table===table).missing.includes(column));
 }
});
test('review fingerprints require a validated JSONB-object check in both tables',()=>{
 for(const name of ['published_review_hashes','snapshot_review_hashes']){
  const x=good();
  x.constraints=x.constraints.filter(c=>!String(c.definition).includes('jsonb_typeof('+name+')'));
  const result=report(x);
  assert.equal(result.layoutReady,false,name);
  assert.equal(result.allReady,false,name);
 }
});
test('the prior museum-only preflight is insufficient when the layout tables are missing',()=>{
 for(const table of ['museum_gallery_layout_stage',
  'museum_gallery_layout_history_stage','museum_gallery_layout_audit_stage']){
  const x=good();x.columns=x.columns.filter(c=>c.table_name!==table);
  const v=report(x);
  assert.equal(v.baseMuseumReady,true);
  assert.equal(v.layoutReady,false);
  assert.equal(v.allReady,false);
  assert.equal(v.tables.find(a=>a.table===table).exists,false);
 }
});
test('the live override table is required for correct public takedowns',()=>{
 const x=good();x.columns=x.columns.filter(c=>c.table_name!=='gallery_live_overrides');
 const v=report(x);
 assert.equal(v.baseMuseumReady,true);
 assert.equal(v.sourceReady,false);
 assert.equal(v.layoutReady,true);
 assert.equal(v.allReady,false);
});
test('existing gallery needs a unique work ID and attributed moderation',()=>{
 for(const kind of ['p','c','f']){
  const x=good();
  const index=x.constraints.findIndex(row=>row.table_name==='gallery_live_overrides'&&row.contype===kind);
  assert.notEqual(index,-1);
  x.constraints.splice(index,1);
  const out=report(x);
  assert.equal(out.sourceReady,false,kind);
  assert.equal(out.layoutReady,true);
  assert.equal(out.allReady,false);
 }
});
test('unvalidated or negated legacy ID checks fail closed',()=>{
 for(const kind of ['p','c','f']){
  const x=good(),row=x.constraints.find(row=>
   row.table_name==='gallery_live_overrides'&&row.contype===kind);
  row.validated=false;
  assert.equal(report(x).sourceReady,false,kind);
 }
 const x=good();
 const format=x.constraints.find(row=>
  row.table_name==='gallery_live_overrides'&&row.contype==='c');
 format.definition="CHECK (item_id !~ '^[a-z0-9-]{3,70}"+String.fromCharCode(36)+"')";
 assert.equal(report(x).sourceReady,false);
});
test('a wrong type or nullable audit field must prevent a write-ready report',()=>{
 for(const column of ['draft_order','published_revision','snapshot_order',
  'payload_hash','new_revision']){
  const x=good();x.columns.find(c=>c.column_name===column).data_type='text (invalid)';
  assert.equal(report(x).allReady,false,column);
 }
 const x=good();x.columns.find(c=>c.table_name==='museum_gallery_layout_audit_stage'&&
  c.column_name==='operation_id').is_nullable='YES';
 assert.equal(report(x).allReady,false);
});
test('all required primary, unique, owner-link and membership checks must be validated',()=>{
 for(let i=0;i<moreConstraints.length;i++){
  const x=good();
  const index=x.constraints.length-moreConstraints.length+i;
  x.constraints[index].validated=false;
  const result=report(x);
  assert.equal(result.layoutReady,false,'unvalidated check '+i);
  assert.equal(result.allReady,false);
 }
});
test('layout and history must bind published owner and featured items to approved visibility',()=>{
 for(const token of [
  'FOREIGN KEY (published_by) REFERENCES gallery_admin_users(id)',
  'draft_visible_ids ? draft_featured_id',
  'published_visible_ids ? published_featured_id',
  'snapshot_visible_ids ? snapshot_featured_id'
 ]){
  const x=good();
  const i=x.constraints.findIndex(row=>String(row.definition).includes(token)&&
   (token.startsWith('FOREIGN KEY')?row.table_name==='museum_gallery_layout_stage':true));
  assert.notEqual(i,-1,token);
  x.constraints.splice(i,1);
  const out=report(x);
  assert.equal(out.layoutReady,false,token);
  assert.equal(out.allReady,false,token);
 }
});
test('missing or unverified real DB identity is not inferred from valid metadata',()=>{
 for(const identityVerified of [false,undefined,'true']){
  const x=good();x.identityVerified=identityVerified;
  const result=report(x);
  assert.equal(result.allReady,false);
  assert.equal(result.canDeploy,false);
 }
});
test('incomplete query results cannot produce a ready report',()=>{
 assert.throws(()=>report({columns:null,constraints:[],identityVerified:true}),TypeError);
 assert.throws(()=>report({columns:[],constraints:null,identityVerified:true}),TypeError);
 assert.equal(report({columns:[],constraints:[],identityVerified:true}).allReady,false);
});
test('release schema evaluator has no live database or deployment capabilities',()=>{
 const src=readFileSync(new URL('../museum-gallery-release-schema-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(src,/export default|process\.env|\.query\s*\(|INSERT INTO|DELETE FROM|UPDATE museum|fetch\s*\(/);
 assert.equal(config.routes.some(x=>x.src==='/museum-gallery-release-schema-stage.mjs'),false);
 assert.equal(config.builds.some(x=>x.src==='museum-gallery-release-schema-stage.mjs'),false);
});
