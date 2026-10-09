import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('./community-test-schema.sql',import.meta.url),'utf8');
test('migration only creates objects in the isolated next_test schema',()=>{
 const creates=[...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([^\s(]+)/gi)].map(x=>x[1]);
 assert(creates.length>=7);
 assert(creates.every(name=>name.startsWith('next_test.')));
 assert(sql.includes('CREATE SCHEMA IF NOT EXISTS next_test'));
 assert(!/CREATE TABLE\s+(?:public|emuzii|main)\./i.test(sql));
});
test('client table privileges and direct access are disabled by default',()=>{
 assert(sql.includes('REVOKE ALL ON SCHEMA next_test FROM PUBLIC'));
 assert(sql.includes('REVOKE ALL ON ALL TABLES IN SCHEMA next_test FROM PUBLIC'));
 for(const table of ['community_profiles','community_messages','community_media','community_reports','community_notices','community_controls','community_audit']){
  assert(sql.includes('ALTER TABLE next_test.'+table+' ENABLE ROW LEVEL SECURITY'),table);
  assert(sql.includes('ALTER TABLE next_test.'+table+' FORCE ROW LEVEL SECURITY'),table);
 }
 assert(!/CREATE POLICY/i.test(sql));
});
test('posts and files are awaiting approval and disabled at setup',()=>{
 assert(sql.includes("moderation_state text NOT NULL DEFAULT 'pending'"));
 assert(sql.includes("approval_state text NOT NULL DEFAULT 'pending'"));
 assert(sql.includes("enabled boolean NOT NULL DEFAULT false"));
 assert(sql.includes("('community_posts',false)"));
});
