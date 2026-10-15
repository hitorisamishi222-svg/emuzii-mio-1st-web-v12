import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('./test-auth-identity-schema.sql',import.meta.url),'utf8');

test('identity migration stays inside the isolated next_test schema',()=>{
 assert.match(sql,/^-- NEXT TEST ONLY/m);
 assert.match(sql,/^BEGIN;/m);assert.match(sql,/^COMMIT;/m);
 const tables=[...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([^\s(]+)/gi)].map(x=>x[1]);
 assert.deepEqual(tables,[
  'next_test.test_auth_accounts',
  'next_test.test_auth_identifiers',
  'next_test.test_login_id_history'
 ]);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE|UPDATE)\s+(?:TABLE\s+)?(?:public|emuzii|main)\./i);
});

test('one normalized namespace prevents MIO-ID and login-ID collisions',()=>{
 assert.match(sql,/identifier_key text PRIMARY KEY/);
 assert.match(sql,/identifier_type IN \('mio_id','login_id'\)/);
 assert.match(sql,/identifier_key=lower\(display_value\)/);
 assert.match(sql,/test_participant_ref text NOT NULL UNIQUE/);
 assert.match(sql,/test_account_ref text PRIMARY KEY/);
});

test('login ID format and uniqueness rules retain prior aliases for the owner',()=>{
 assert.match(sql,/char_length\(display_value\) BETWEEN 8 AND 20/);
 assert.match(sql,/display_value ~ '\^\[A-Za-z0-9_\.!@-\]\+\$'/);
 assert.match(sql,/CASE WHEN display_value ~ '\[A-Z\]' THEN 1 ELSE 0 END/);
 assert.match(sql,/CASE WHEN display_value ~ '\[a-z\]' THEN 1 ELSE 0 END/);
 assert.match(sql,/CASE WHEN display_value ~ '\[0-9\]' THEN 1 ELSE 0 END/);
 assert.match(sql,/identifier_state IN \('current','retired'\)/);
 assert.match(sql,/idx_next_test_one_current_login_per_account/);
 assert.match(sql,/identifier_key text PRIMARY KEY/); // retired keys remain reserved globally
 assert.match(sql,/event_kind IN \('registered','changed','restored'\)/);
});

test('all identity tables are fail-closed under forced RLS',()=>{
 for(const name of ['test_auth_accounts','test_auth_identifiers','test_login_id_history']){
  assert.match(sql,new RegExp(`ALTER TABLE next_test\\.${name} ENABLE ROW LEVEL SECURITY`));
  assert.match(sql,new RegExp(`ALTER TABLE next_test\\.${name} FORCE ROW LEVEL SECURITY`));
 }
 assert.match(sql,/REVOKE ALL ON ALL TABLES IN SCHEMA next_test FROM PUBLIC/);
 assert.doesNotMatch(sql,/^\s*CREATE\s+POLICY\b/im);
});
