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
 assert.deepEqual(tables,['museum_gallery_layout_stage','museum_gallery_layout_audit_stage']);
 assert.doesNotMatch(statements,/\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|GRANT|REVOKE)\b/i);
 assert.doesNotMatch(statements,/\b(?:gallery_live_overrides|mio_registration|attendance|gacha|checkin)\b/i);
});
test('one shared museum layout with separate draft and published versions',()=>{
 assert.match(statements,/layout_key text PRIMARY KEY CHECK\(layout_key='main'\)/);
 for(const name of ['draft_revision','draft_order','draft_visible_ids','draft_featured_id',
  'published_revision','published_order','published_visible_ids','published_featured_id']){
  assert.ok(statements.includes(name),name);
 }
 assert.match(statements,/published_revision IS NULL AND published_order IS NULL/);
 assert.match(statements,/published_revision IS NOT NULL AND published_revision>=0/);
 assert.match(statements,/published_by IS NOT NULL AND published_at IS NOT NULL/);
});
test('metadata counts cannot grow without bounds or be arbitrarily structured',()=>{
 for(const field of ['draft_order','draft_visible_ids','published_order','published_visible_ids']){
  assert.match(statements,new RegExp("jsonb_typeof\\("+field+"\\)='array'"));
  assert.match(statements,new RegExp("jsonb_array_length\\("+field+"\\)<=500"));
 }
 assert.match(statements,/char_length\(draft_featured_id\)<=70/);
});
test('owner-linked audit records exactly track approved draft, publish and rollback actions',()=>{
 assert.match(statements,/operation_id text NOT NULL UNIQUE CHECK\(operation_id ~/);
 assert.match(statements,/actor_id uuid NOT NULL REFERENCES gallery_admin_users\(id\)/);
 assert.match(statements,/action IN \('draft','publish','rollback'\)/);
 assert.match(statements,/new_revision bigint NOT NULL CHECK\(new_revision>prior_revision\)/);
 assert.match(statements,/recorded_at timestamptz NOT NULL DEFAULT now\(\)/);
});
test('layout metadata alone cannot unhide or publish moderated items',()=>{
 assert.match(sql,/takedowns and rights decisions remain authoritative/);
 assert.match(sql,/authoritative DB again inside ONE transaction before every publish/);
 assert.match(sql,/JSON arrays alone MUST NEVER be interpreted as permission to publish/);
 assert.match(sql,/uncertain COMMIT, recheck the same operation_id/);
});
