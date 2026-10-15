// CI ONLY: synthetic fixtures in the temporary PostgreSQL service, never a live DB.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {registerAccountTransaction} from '../security/mio-postgres-registration.mjs';
import {createPostgresIdentifierStore} from '../security/mio-postgres-identifier-store.mjs';
import {createPostgresSessionStore} from '../security/mio-postgres-session-store.mjs';
import {createPostgresLoginService} from '../security/mio-postgres-login.mjs';
import {drawGachaTransaction} from '../security/mio-gacha-transaction.mjs';

const connection = new URL(process.env.MIO_TEST_DATABASE_URL || 'postgresql://invalid/');
assert.equal(process.env.CI, 'true', 'This suite runs only in the isolated CI service');
assert.equal(connection.protocol, 'postgresql:');
assert.equal(connection.hostname, '127.0.0.1', 'External database connections are forbidden');
assert.equal(connection.port, '5432');
assert.equal(connection.pathname, '/mio_ci_test');
assert.equal(connection.username, 'mio_test');
const require = createRequire(import.meta.url);
const {Pool} = require(process.env.MIO_TEST_PG_MODULE);
const pool = new Pool({connectionString: connection.href, max: 20,
  connectionTimeoutMillis: 5000, statement_timeout: 10000,
  options: '-c search_path=mio_ci,public'});
const password = 'Synthetic-CI-Password-2026!';
const migrations = [
  '../security/mio-auth-v21-schema.preview.sql',
  './community-test-schema.sql',
  './test-auth-identity-schema.sql',
  './test-device-transfer-schema.sql',
];
const freshLogin = () => `Ci_${randomUUID().slice(0, 8)}26`;
const account = (override = {}) => registerAccountTransaction(pool, {
  mioId: `MIO-CI-${randomUUID()}`, loginId: freshLogin(), password, ...override,
});
async function applyMigrations() {
  for (const path of migrations) await pool.query(await readFile(new URL(path, import.meta.url), 'utf8'));
}
async function balance(accountId) {
  return (await pool.query('SELECT remaining FROM mio_gacha_balances_v21 WHERE account_id=$1', [accountId])).rows[0].remaining;
}
async function draws(accountId) {
  return (await pool.query('SELECT draw_id,prize_code,request_key FROM mio_gacha_draws_v21 WHERE account_id=$1 ORDER BY draw_id', [accountId])).rows;
}
async function nextAccount(label) {
  const participant = `SYNTH-${label}-${randomUUID()}`;
  const ref = `TEST-ACCOUNT-${randomUUID()}`;
  await pool.query('INSERT INTO next_test.community_profiles(test_participant_ref,display_name) VALUES($1,$2)', [participant, 'Synthetic CI participant']);
  await pool.query('INSERT INTO next_test.test_auth_accounts(test_account_ref,test_participant_ref) VALUES($1,$2)', [ref, participant]);
  return {participant, ref};
}
before(async () => {
  const actual = await pool.query('SELECT current_database() AS db, current_user AS username');
  assert.equal(actual.rows[0].db, 'mio_ci_test');
  assert.equal(actual.rows[0].username, 'mio_test');
  await pool.query('CREATE SCHEMA mio_ci');
  await applyMigrations();
});
after(async () => { await pool.end(); });

test('real PostgreSQL applies all four migrations and supports repeat application', async () => {
  await applyMigrations();
  const r = await pool.query("SELECT to_regclass('mio_ci.mio_accounts_v21') AS accounts, to_regclass('next_test.test_auth_identifiers') AS identifiers, to_regclass('next_test.test_device_sessions') AS sessions");
  assert.ok(r.rows[0].accounts && r.rows[0].identifiers && r.rows[0].sessions);
});

test('real registration and password login bind MIO-ID and login ID to one account', async () => {
  const a = await account();
  const sessions = createPostgresSessionStore(pool);
  const login = createPostgresLoginService(pool, {sessions});
  const first = await login.login({identifier: a.mioId, password, deviceLabel: 'CI iPhone'});
  const second = await login.login({identifier: a.loginId.toUpperCase(), password, deviceLabel: 'CI Android'});
  assert.equal(first.accountId, a.accountId);
  assert.equal(second.accountId, a.accountId);
  assert.equal((await sessions.list(a.accountId)).length, 2);
  await assert.rejects(login.login({identifier: a.loginId, password: 'wrong-password'}), /invalid credentials/);
  const saved = (await pool.query('SELECT password_hash FROM mio_accounts_v21 WHERE account_id=$1', [a.accountId])).rows[0];
  assert.notEqual(saved.password_hash, password);
});

test('simultaneous registrations cannot claim the same normalized login ID', async () => {
  const loginId = freshLogin();
  const outcomes = await Promise.allSettled([account({loginId}), account({loginId: loginId.toUpperCase()})]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(r => r.status === 'rejected').length, 1);
  const r = await pool.query('SELECT count(*)::int AS n FROM mio_accounts_v21 WHERE lower(login_id)=$1', [loginId.toLowerCase()]);
  assert.equal(r.rows[0].n, 1, 'Losing registration must roll back the account row');
});

test('duplicate MIO-ID registration rolls back all newly reserved identifiers', async () => {
  const a = await account(), newLogin = freshLogin();
  await assert.rejects(account({mioId: a.mioId.toLowerCase(), loginId: newLogin}), /identifier already registered/);
  assert.equal(await createPostgresIdentifierStore(pool).resolve(newLogin), null);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM mio_accounts_v21 WHERE lower(mio_id)=$1', [a.mioId.toLowerCase()])).rows[0].n, 1);
});

test('login ID change retains MIO-ID, active sessions, draw history and shared balance', async () => {
  const a = await account(), ids = createPostgresIdentifierStore(pool), sessions = createPostgresSessionStore(pool);
  const session = await sessions.create(a.accountId, 'CI device');
  await pool.query('UPDATE mio_gacha_balances_v21 SET remaining=2 WHERE account_id=$1', [a.accountId]);
  await drawGachaTransaction(pool, {accountId: a.accountId, requestKey: 'ci-history-draw-0001', selectPrize: async () => 'SYNTH-N'});
  const previousDraws = await draws(a.accountId), newId = freshLogin();
  await ids.changeLoginId(a.accountId, newId);
  assert.equal(await ids.resolve(a.loginId), null);
  assert.equal(await ids.resolve(newId), a.accountId);
  assert.equal(await ids.resolve(a.mioId), a.accountId);
  assert.equal((await sessions.lookup(session.token)).accountId, a.accountId);
  assert.equal(await balance(a.accountId), 1);
  assert.deepEqual(await draws(a.accountId), previousDraws);
  await assert.rejects(account({loginId: a.loginId}), /identifier already registered/);
  const login = createPostgresLoginService(pool, {sessions});
  await assert.rejects(login.login({identifier: a.loginId, password}), /invalid credentials/);
  assert.equal((await login.login({identifier: newId, password})).accountId, a.accountId);
});

test('simultaneous ID changes have one winner and preserve the losing mapping', async () => {
  const a = await account(), b = await account(), ids = createPostgresIdentifierStore(pool), target = freshLogin();
  const outcomes = await Promise.allSettled([ids.changeLoginId(a.accountId, target), ids.changeLoginId(b.accountId, target.toUpperCase())]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  const loser = outcomes[0].status === 'rejected' ? a : b;
  assert.equal(await ids.resolve(loser.loginId), loser.accountId);
  assert.notEqual(await ids.resolve(target), loser.accountId);
});

test('individual logout revokes only the selected device and rejects a foreign account', async () => {
  const a = await account(), other = await account(), sessions = createPostgresSessionStore(pool);
  const phone = await sessions.create(a.accountId, 'CI iPhone');
  const android = await sessions.create(a.accountId, 'CI Android');
  assert.equal(await sessions.revoke(other.accountId, phone.sessionId), false);
  assert.ok(await sessions.lookup(phone.token));
  assert.equal(await sessions.revoke(a.accountId, phone.sessionId), true);
  assert.equal(await sessions.lookup(phone.token), null);
  assert.equal((await sessions.lookup(android.token)).accountId, a.accountId);
  assert.equal((await sessions.list(a.accountId)).length, 1);
});

test('expired sessions and logout-all are enforced by the real session table', async () => {
  const a = await account(), sessions = createPostgresSessionStore(pool);
  const expired = await sessions.create(a.accountId);
  await pool.query("UPDATE mio_sessions_v21 SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE token_digest=$1", [expired.sessionId]);
  assert.equal(await sessions.lookup(expired.token), null);
  const active = await sessions.create(a.accountId);
  await sessions.revokeAll(a.accountId);
  assert.equal(await sessions.lookup(active.token), null);
  assert.equal((await sessions.list(a.accountId)).length, 0);
});

test('real concurrent same-key gacha requests consume exactly one shared right', async () => {
  const a = await account();
  await pool.query('UPDATE mio_gacha_balances_v21 SET remaining=1 WHERE account_id=$1', [a.accountId]);
  const results = await Promise.all(Array.from({length: 16}, () => drawGachaTransaction(pool, {
    accountId: a.accountId, requestKey: 'ci-same-key-00000001', selectPrize: async () => 'SYNTH-N',
  })));
  assert.equal(results.filter(r => r.status === 'drawn').length, 1);
  assert.equal(results.filter(r => r.status === 'replayed').length, 15);
  assert.equal(new Set(results.map(r => r.drawId)).size, 1);
  assert.equal(await balance(a.accountId), 0);
  assert.equal((await draws(a.accountId)).length, 1);
});

test('real concurrent different-key gacha requests cannot spend more than two rights', async () => {
  const a = await account();
  await pool.query('UPDATE mio_gacha_balances_v21 SET remaining=2 WHERE account_id=$1', [a.accountId]);
  const results = await Promise.all(Array.from({length: 20}, (_, i) => drawGachaTransaction(pool, {
    accountId: a.accountId, requestKey: `ci-different-key-${String(i).padStart(4, '0')}`, selectPrize: async () => 'SYNTH-N',
  })));
  assert.equal(results.filter(r => r.status === 'drawn').length, 2);
  assert.equal(results.filter(r => r.status === 'no_rights').length, 18);
  assert.equal(await balance(a.accountId), 0);
  assert.equal((await draws(a.accountId)).length, 2);
});

test('real gacha transaction restores balance when prize selection fails', async () => {
  const a = await account();
  await pool.query('UPDATE mio_gacha_balances_v21 SET remaining=1 WHERE account_id=$1', [a.accountId]);
  await assert.rejects(drawGachaTransaction(pool, {accountId: a.accountId, requestKey: 'ci-prize-error-0001',
    selectPrize: async () => { throw Error('synthetic prize failure'); }}), /synthetic prize failure/);
  assert.equal(await balance(a.accountId), 1);
  assert.equal((await draws(a.accountId)).length, 0);
});

test('TEST schema enforces login format, reserved IDs and cross-type uniqueness', async () => {
  const a = await nextAccount('schema'), b = await nextAccount('collision');
  const value = freshLogin(), key = value.toLowerCase();
  const insert = (ref, k, display, kind) => pool.query('INSERT INTO next_test.test_auth_identifiers(identifier_key,display_value,test_account_ref,identifier_type) VALUES($1,$2,$3,$4)', [k, display, ref, kind]);
  await insert(a.ref, key, value, 'login_id');
  await assert.rejects(insert(b.ref, key, value, 'mio_id'), {code: '23505'});
  await pool.query("UPDATE next_test.test_auth_identifiers SET identifier_state='retired',retired_at=now() WHERE identifier_key=$1", [key]);
  await assert.rejects(insert(b.ref, key, value, 'login_id'), {code: '23505'});
  for (const invalid of ['short', 'alllowercase', 'ALLUPPERCASE', '0123456789', 'Ab12345 ', 'Abc12345#']) {
    await assert.rejects(insert(b.ref, invalid.toLowerCase(), invalid, 'login_id'), {code: '23514'});
  }
  await insert(b.ref, freshLogin().toLowerCase(), 'mismatch-value', 'mio_id').then(
    () => assert.fail('Key/display mismatch must be rejected'), e => assert.equal(e.code, '23514'));
});

test('TEST schema supports multiple devices and keeps participant history after one logout', async () => {
  const a = await nextAccount('devices');
  const refs = [randomUUID(), randomUUID()];
  for (let i = 0; i < refs.length; i++) await pool.query("INSERT INTO next_test.test_device_sessions(test_session_ref,test_participant_ref,device_id,session_digest,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 day')", [refs[i], a.participant, `CI-device-${i}`, String(i + 1).repeat(64)]);
  await pool.query("INSERT INTO next_test.test_participant_history(synthetic_event_id,test_participant_ref,category,synthetic_payload) VALUES($1,$2,'attendance','{\"days\":17}')", [`SYNTH-HISTORY-${randomUUID()}`, a.participant]);
  await pool.query('UPDATE next_test.test_device_sessions SET revoked_at=now() WHERE test_session_ref=$1', [refs[0]]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM next_test.test_device_sessions WHERE test_participant_ref=$1 AND revoked_at IS NULL', [a.participant])).rows[0].n, 1);
  assert.deepEqual((await pool.query('SELECT synthetic_payload FROM next_test.test_participant_history WHERE test_participant_ref=$1', [a.participant])).rows[0].synthetic_payload, {days: 17});
});

test('TEST RLS denies untrusted reads and writes even when table privileges are granted', async () => {
  const a = await nextAccount('rls');
  await pool.query('CREATE ROLE mio_ci_untrusted NOLOGIN NOSUPERUSER NOBYPASSRLS');
  await pool.query('GRANT USAGE ON SCHEMA next_test TO mio_ci_untrusted');
  await pool.query('GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA next_test TO mio_ci_untrusted');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE mio_ci_untrusted');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM next_test.test_auth_accounts')).rows[0].n, 0);
    await assert.rejects(client.query('INSERT INTO next_test.test_auth_accounts(test_account_ref,test_participant_ref) VALUES($1,$2)', [`TEST-UNTRUSTED-${randomUUID()}`, a.participant]), {code: '42501'});
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
