// Actual HTTP + actual temporary PostgreSQL; no mock store, no public endpoint.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {request} from 'node:http';
import {registerAccountTransaction} from '../security/mio-postgres-registration.mjs';
import {startTestAuthHttpServer} from './test-auth-http-server.mjs';
assert.equal(process.env.CI, 'true');
const connection = new URL(process.env.MIO_TEST_DATABASE_URL || 'postgresql://invalid/');
assert.equal(connection.hostname, '127.0.0.1');
assert.equal(connection.port, '5432');
assert.equal(connection.pathname, '/mio_ci_test');
assert.equal(connection.username, 'mio_test');
const {Pool} = createRequire(import.meta.url)(process.env.MIO_TEST_PG_MODULE);
const pool = new Pool({connectionString: connection.href, options: '-c search_path=mio_http_ci,public',
  max: 20, connectionTimeoutMillis: 5000, statement_timeout: 10000});
const origin = 'https://mio-http-ci.invalid', password = 'Synthetic-HTTP-Password-2026!';
let server, a, b;
const throttle = {async allow(key) {
  const r = await pool.query(`INSERT INTO mio_http_ci.login_limits(peer,attempts,expires_at)
    VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(peer) DO UPDATE SET
    attempts=CASE WHEN login_limits.expires_at<=now() THEN 1 ELSE login_limits.attempts+1 END,
    expires_at=CASE WHEN login_limits.expires_at<=now() THEN now()+interval '15 minutes' ELSE login_limits.expires_at END
    RETURNING attempts`, [key]);
  return r.rows[0].attempts <= 30;
}};
async function call(path, {method = 'POST', body = {}, cookie, headers = {}, raw} = {}) {
  const response = await fetch(server.url + '/test-auth/' + path, {method,
    headers: {origin, 'sec-fetch-site': 'same-origin', ...(method === 'POST' ? {'content-type': 'application/json'} : {}), ...(cookie ? {cookie} : {}), ...headers},
    ...(method === 'POST' ? {body: raw ?? JSON.stringify(body)} : {})});
  return {status: response.status, headers: response.headers, body: await response.json()};
}
const cookieOf = r => r.headers.get('set-cookie').split(';')[0];
async function login(account, deviceLabel) {
  const r = await call('login', {body: {identifier: account.loginId, password, deviceLabel}});
  assert.equal(r.status, 200); return cookieOf(r);
}
before(async () => {
  await pool.query('CREATE SCHEMA mio_http_ci');
  await pool.query(await readFile(new URL('../security/mio-auth-v21-schema.preview.sql', import.meta.url), 'utf8'));
  await pool.query('CREATE TABLE login_limits(peer text PRIMARY KEY,attempts integer NOT NULL,expires_at timestamptz NOT NULL)');
  a = await registerAccountTransaction(pool, {mioId: 'SYNTH-HTTP-MIO-A', loginId: 'Http_AccountA26', password});
  b = await registerAccountTransaction(pool, {mioId: 'SYNTH-HTTP-MIO-B', loginId: 'Http_AccountB26', password});
  server = await startTestAuthHttpServer({pool, trustedOrigin: origin, throttle});
});
after(async () => { if (server) await server.close(); await pool.end(); });

test('HTTP login issues private secure cookie and both IDs resolve to same account', async () => {
  for (const identifier of [a.mioId, a.loginId.toUpperCase()]) {
    const r = await call('login', {body: {identifier, password}});
    assert.equal(r.status, 200); assert.equal(r.body.accountId, a.accountId);
    assert.match(r.headers.get('set-cookie'), /__Host-mio_session=.*; Path=\/;.*Secure; HttpOnly; SameSite=Lax/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal((await call('me', {method: 'GET', cookie: cookieOf(r)})).body.accountId, a.accountId);
    assert.equal(JSON.stringify(r.body).includes(password), false);
  }
});
test('HTTP invalid credentials return generic error and create no session', async () => {
  const count = async () => (await pool.query('SELECT count(*)::int AS n FROM mio_sessions_v21')).rows[0].n;
  const initial = await count();
  for (const identifier of [a.loginId, 'DoesNotExist26']) {
    const r = await call('login', {body: {identifier, password: 'wrong'}});
    assert.equal(r.status, 401); assert.deepEqual(r.body, {error: 'invalid_credentials'});
    assert.equal(r.headers.get('set-cookie'), null);
  }
  assert.equal(await count(), initial);
});
test('HTTP rejects cross-origin, missing origin, cross-site and wrong content type', async () => {
  for (const [headers, status] of [[{origin: 'https://evil.invalid'},403], [{origin: ''},403], [{'sec-fetch-site':'cross-site'},403], [{'content-type':'text/plain'},415]]) {
    assert.equal((await call('login', {headers})).status, status);
  }
});
test('HTTP validates JSON, shape, methods and denies public registration', async () => {
  assert.equal((await call('login', {raw: '{'})).status, 400);
  assert.equal((await call('login', {body: []})).status, 400);
  assert.equal((await call('login', {body: {identifier:a.loginId,password,deviceLabel:{}}})).status,400);
  assert.equal((await call('login', {method:'GET'})).status,405);
  assert.equal((await call('register')).status,404);
});
test('HTTP limits actual body bytes including chunked uploads without content-length', async () => {
  assert.equal((await call('login', {raw: 'x'.repeat(5000)})).status,413);
  const result = await new Promise((resolve, reject) => {
    const req = request(server.url+'/test-auth/login', {method:'POST',headers:{origin,'content-type':'application/json'}}, res => {
      let value=''; res.on('data', x=>value+=x); res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(value)}));
    });
    req.on('error',reject); req.write('x'.repeat(4100)); req.end();
  });
  assert.equal(result.status,413);
});
test('HTTP requires valid session for every account operation', async () => {
  for (const path of ['me','devices','logout','logout-all','revoke-device','login-id','gacha']) {
    assert.equal((await call(path,{method:['me','devices'].includes(path)?'GET':'POST',body:{loginId:'Valid_New26',requestKey:'synthetic-request-0001'}})).status,401);
  }
});
test('HTTP duplicate cookie is rejected', async () => {
  const cookie=await login(a,'cookie-device');
  assert.equal((await call('me',{method:'GET',cookie:cookie+'; '+cookie})).status,401);
});
test('HTTP multiple devices, foreign revoke denied, selected logout leaves other device active', async () => {
  const phone=await login(a,'HTTP iPhone'),android=await login(a,'HTTP Android'),other=await login(b,'Other account');
  const list=await call('devices',{method:'GET',cookie:phone});
  const target=list.body.devices.find(d=>d.deviceLabel==='HTTP iPhone'); assert.ok(target);
  assert.equal((await call('revoke-device',{cookie:other,body:{sessionId:target.sessionId}})).body.revoked,false);
  assert.equal((await call('revoke-device',{cookie:android,body:{sessionId:target.sessionId}})).body.revoked,true);
  assert.equal((await call('me',{method:'GET',cookie:phone})).status,401);
  assert.equal((await call('me',{method:'GET',cookie:android})).status,200);
});
test('HTTP ID change ignores client accountId and preserves MIO mapping, sessions and rights', async () => {
  const cookie=await login(a,'ID change');
  await pool.query('UPDATE mio_gacha_balances_v21 SET remaining=2 WHERE account_id=$1',[a.accountId]);
  const old=a.loginId;
  assert.equal((await call('login-id',{cookie,body:{accountId:b.accountId,loginId:'Changed_Http26'}})).status,200);
  a.loginId='Changed_Http26';
  assert.equal((await call('me',{method:'GET',cookie})).body.accountId,a.accountId);
  assert.equal((await call('login',{body:{identifier:old,password}})).status,401);
  assert.equal((await call('login',{body:{identifier:a.mioId,password}})).body.accountId,a.accountId);
  const other=await login(b,'collision');
  assert.equal((await call('login-id',{cookie:other,body:{loginId:old}})).status,409);
  assert.equal((await call('login-id',{cookie,body:{loginId:'alllowercase'}})).status,400);
  assert.equal((await pool.query('SELECT login_id FROM mio_accounts_v21 WHERE account_id=$1',[b.accountId])).rows[0].login_id,b.loginId);
});
test('HTTP concurrent draws from two devices share rights and replay one result', async () => {
  const cookies=[await login(a,'Draw phone'),await login(a,'Draw tablet')];
  const results=await Promise.all(Array.from({length:8},(_,i)=>call('gacha',{cookie:cookies[i%2],body:{accountId:b.accountId,requestKey:'http-shared-key-0001'}})));
  assert.ok(results.every(r=>r.status===200));
  assert.equal(results.filter(r=>r.body.status==='drawn').length,1);
  assert.equal(results.filter(r=>r.body.status==='replayed').length,7);
  assert.equal(new Set(results.map(r=>r.body.drawId)).size,1);
  assert.equal((await pool.query('SELECT remaining FROM mio_gacha_balances_v21 WHERE account_id=$1',[a.accountId])).rows[0].remaining,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM mio_gacha_draws_v21 WHERE account_id=$1',[b.accountId])).rows[0].n,0);
});
test('HTTP logout clears cookie and logout-all invalidates remaining devices', async () => {
  const phone=await login(a,'logout phone'),tablet=await login(a,'logout tablet');
  const out=await call('logout',{cookie:phone}); assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await call('me',{method:'GET',cookie:phone})).status,401);
  assert.equal((await call('me',{method:'GET',cookie:tablet})).status,200);
  assert.equal((await call('logout-all',{cookie:tablet})).status,200);
  assert.equal((await call('me',{method:'GET',cookie:tablet})).status,401);
});
test('HTTP database-backed throttle survives server restart and ignores spoofed forwarded IP', async () => {
  await pool.query('DELETE FROM login_limits');
  await pool.query("INSERT INTO login_limits VALUES('127.0.0.1',30,now()+interval '15 minutes')");
  await server.close(); server=await startTestAuthHttpServer({pool,trustedOrigin:origin,throttle});
  const r=await call('login',{body:{identifier:b.loginId,password},headers:{'x-forwarded-for':'203.0.113.99'}});
  assert.equal(r.status,429); assert.equal(r.headers.get('retry-after'),'900');
  assert.equal(r.headers.get('cache-control'),'no-store');
});
