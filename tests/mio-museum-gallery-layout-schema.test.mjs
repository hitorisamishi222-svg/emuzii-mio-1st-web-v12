import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('db/museum-gallery-layout-stage.sql');
const statements=sql.split('\n').map(x=>x.trim()).filter(x=>x&&!x.startsWith('--')).join('\n');
const config=JSON.parse(read('vercel.json'));

test('proposed gallery layout migration is NOT connected to public routes or deployed APIs',()=>{
 const path='db/museum-gallery-layout-stage.sql';
 assert.equal(config.builds.some(x=>x.src===path),false);
 assert.equal(config.routes.some(x=>x.src==='/'+path),false);
 assert.equal(config.routes.some(x=>x.src==='/api/museum/layout'),false);
 assert.equal(config.builds.some(x=>x.src==='api-museum-gallery-layout.js'),false);
 assert.match(sql,/Unapplied candidate/);
});
test('schema creates only two new tables and does not touch the live gallery schema',()=>{
 const tables=[...statements.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map(x=>x[1]);
 assert.deepEqual(tables,['museum_gallery_layout_stage','museum_gallery_layout_history_stage','museum_gallery_layout_audit_stage']);
 assert.doesNotMatch(statements,/\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|GRANT|REVOKE)\b/i);
 assert.doesNotMatch(statements,/\b(?:gallery_live_overrides|mio_registration|attendance|gacha|checkin)\b/i);
});
test('one shared museum layout with separate draft and published versions',()=>{
 assert.match(statements,/layout_key text PRIMARY KEY CHECK\s*\(layout_key='main'\)/);
 for(const name of ['draft_revision','draft_order','draft_visible_ids','draft_featured_id',
  'published_revision','published_order','published_visible_ids','published_featured_id']){
  assert.ok(statements.includes(name),name);
 }
 assert.match(statements,/published_revision IS NULL AND published_from_draft_revision IS NULL/);
 assert.match(statements,/published_revision IS NOT NULL AND published_from_draft_revision IS NOT NULL/);
 assert.match(statements,/published_by IS NOT NULL AND published_at IS NOT NULL/);
});
test('metadata counts cannot grow without bounds or be arbitrarily structured',()=>{
 for(const field of ['draft_order','draft_visible_ids','published_order','published_visible_ids']){
  assert.match(statements,new RegExp("jsonb_typeof\\("+field+"\\)='array'"));
  assert.match(statements,new RegExp("jsonb_array_length\\("+field+"\\)<=500"));
 }
 assert.match(statements,/char_length\(draft_featured_id\)<=70/);
});
test('SQL rejects out-of-order or unfeatured visibility references',()=>{
 for(const expr of [
  'draft_order @> draft_visible_ids',
  'draft_visible_ids ? draft_featured_id',
  'published_order @> published_visible_ids',
  'published_visible_ids ? published_featured_id',
  'snapshot_order @> snapshot_visible_ids',
  'snapshot_visible_ids ? snapshot_featured_id',
  'published_from_draft_revision<=draft_revision'
 ])assert.ok(statements.includes(expr),'missing stage SQL constraint: '+expr);
});
test('owner-linked audit records exactly track approved draft, publish and rollback actions',()=>{
 assert.match(statements,/operation_id text NOT NULL UNIQUE CHECK\s*\(operation_id ~/);
 assert.match(statements,/payload_hash text NOT NULL CHECK\s*\(payload_hash ~/);
 assert.match(statements,/actor_id uuid NOT NULL REFERENCES gallery_admin_users\(id\)/);
 assert.match(statements,/action IN \('draft','publish','rollback'\)/);
 assert.match(statements,/new_revision bigint NOT NULL CHECK\s*\(new_revision>prior_revision\)/);
 assert.match(statements,/recorded_at timestamptz NOT NULL DEFAULT now\(\)/);
});
test('a fully versioned publication history can support rollback without deleting old snapshots',()=>{
 assert.match(statements,/CREATE TABLE IF NOT EXISTS museum_gallery_layout_history_stage/);
 assert.match(statements,/UNIQUE \(layout_key,published_revision\)/);
 assert.match(statements,/source_draft_revision bigint NOT NULL CHECK \(source_draft_revision>=1\)/);
 assert.match(statements,/snapshot_order jsonb NOT NULL/);
 assert.match(statements,/snapshot_visible_ids jsonb NOT NULL/);
 assert.match(statements,/published_from_draft_revision bigint/);
 assert.match(statements,/action IN \('draft','publish','rollback'\)/);
});
test('candidate SQL is precisely three complete CREATE TABLE statements with balanced syntax delimiters',()=>{
 const noComments=sql.split('\n').filter(line=>!/^\s*--/.test(line)).join('\n');
 const declarations=noComments.split(';').map(x=>x.trim()).filter(Boolean);
 assert.equal(declarations.length,3);
 for(const declaration of declarations){
  assert.match(declaration,/^CREATE TABLE IF NOT EXISTS [a-z_]+ \(/);
  let depth=0,inString=false;
  for(let i=0;i<declaration.length;i++){
   const ch=declaration[i];
   if(ch==="'"){
    if(inString&&declaration[i+1]==="'"){i++;continue}
    inString=!inString;continue;
   }
   if(inString)continue;
   if(ch==='(')depth++;
   if(ch===')'){depth--;assert.ok(depth>=0,'unmatched SQL closing bracket')}
  }
  assert.equal(inString,false,'unterminated SQL string literal');
  assert.equal(depth,0,'unmatched SQL bracket');
  assert.match(declaration,/\)$/,'complete CREATE TABLE body');
 }
});
test('layout metadata alone cannot unhide or publish moderated items',()=>{
 assert.match(sql,/Layout metadata NEVER overrides live moderation/);
 assert.match(sql,/hidden\/deleted flags in the SAME dedicated transaction/);
 assert.match(sql,/Serialized IDs are NOT publication rights/);
 assert.match(sql,/On uncertain COMMIT check operation_id/);
});
