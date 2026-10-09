import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('./test-device-transfer-schema.sql',import.meta.url),'utf8');

test('device transfer migration only adds TEST schema objects',()=>{
 assert(sql.startsWith('-- NEXT TEST ONLY'));
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^COMMIT;/m);
 const tables=[...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([^\s(]+)/gi)].map(x=>x[1]);
 assert.deepEqual(tables,[
  'next_test.test_device_sessions',
  'next_test.test_transfer_approvals',
  'next_test.test_participant_history',
  'next_test.test_device_transfer_audit'
 ]);
 assert(!/\b(?:DROP|TRUNCATE|DELETE|UPDATE)\s+(?:TABLE\s+)?(?:public|emuzii|main)\./i.test(sql));
});
test('sessions rotate against participant identity, not browser identity',()=>{
 assert.match(sql,/test_participant_ref text PRIMARY KEY/);
 assert.match(sql,/active_device_id text NOT NULL/);
 assert.match(sql,/generation bigint NOT NULL CHECK \(generation >= 1\)/);
 assert.match(sql,/session_digest char\(64\)/);
 assert.doesNotMatch(sql,/raw_session_token|plain_login_id/i);
});
test('one-time verified approvals and test-only history retain participant ID',()=>{
 assert.match(sql,/transfer_approval_id text PRIMARY KEY/);
 assert.match(sql,/verified_operator_ref text NOT NULL/);
 assert.match(sql,/consumed_at timestamptz/);
 assert.match(sql,/category IN \('attendance','gacha','gallery'\)/);
 assert.match(sql,/test_participant_ref text NOT NULL/);
 assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS\s+public\./i);
});
test('RLS is force enabled with zero client policies for all new tables',()=>{
 for(const name of ['test_device_sessions','test_transfer_approvals',
  'test_participant_history','test_device_transfer_audit']){
  assert(sql.includes('ALTER TABLE next_test.'+name+' ENABLE ROW LEVEL SECURITY'));
  assert(sql.includes('ALTER TABLE next_test.'+name+' FORCE ROW LEVEL SECURITY'));
 }
 assert(sql.includes('REVOKE ALL ON ALL TABLES IN SCHEMA next_test FROM PUBLIC'));
 assert(!/^\s*CREATE\s+POLICY\b/im.test(sql),'SQL must contain no CREATE POLICY statement');
});
