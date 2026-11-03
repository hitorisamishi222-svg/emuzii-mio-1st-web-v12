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
  item_id:'text',hidden:'boolean',deleted:'boolean'
 },
 museum_gallery_layout_stage:{
  layout_key:'text',draft_revision:'bigint',draft_order:'jsonb',
  draft_visible_ids:'jsonb',draft_featured_id:'text',drafted_by:'uuid',
  published_revision:'bigint',published_from_draft_revision:'bigint',
  published_order:'jsonb',published_visible_ids:'jsonb',
  published_featured_id:'text',published_by:'uuid',
  published_at:'timestamp with time zone'
 },
 museum_gallery_layout_history_stage:{
  layout_key:'text',published_revision:'bigint',source_draft_revision:'bigint',
  snapshot_order:'jsonb',snapshot_visible_ids:'jsonb',
  snapshot_featured_id:'text',published_by:'uuid',
  published_at:'timestamp with time zone'
 },
 museum_gallery_layout_audit_stage:{
  operation_id:'text',payload_hash:'text',actor_id:'uuid',
  action:'text',prior_revision:'bigint',new_revision:'bigint'
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
 {table_name:'museum_gallery_layout_history_stage',contype:'f',validated:true,
  definition:'FOREIGN KEY (published_by) REFERENCES gallery_admin_users(id)'},
 {table_name:'museum_gallery_layout_audit_stage',contype:'f',validated:true,
  definition:'FOREIGN KEY (actor_id) REFERENCES gallery_admin_users(id)'}
];
const good=()=>({identityVerified:true,
 columns:structuredClone([...baseColumns,...extraCols]),
 constraints:structuredClone([status,review,...baseKeys,...moreConstraints])
});
const report=input=>museumGalleryReleaseSchemaReport(input);
test('a staged release can be reviewed only when base museum, live overrides and all layout tables exist',()=>{
 const result=report(good());
 assert.equal(result.identityVerified,true);
 assert.equal(result.baseMuseumReady,true);
 assert.equal(result.sourceReady,true);
 assert.equal(result.layoutReady,true);
 assert.equal(result.allReady,true);
 assert.equal(result.canPublish,false);
 assert.equal(result.canDeploy,false);
 assert.equal(result.tables.every(x=>x.ready),true);
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
