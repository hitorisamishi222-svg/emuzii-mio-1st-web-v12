// CI only: reuse repository synthetic fixtures against a disposable PostgreSQL 16 service.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {registerAccountTransaction} from '../security/mio-postgres-registration.mjs';
import {createPostgresIdentifierStore} from '../security/mio-postgres-identifier-store.mjs';
import {createPostgresSessionStore} from '../security/mio-postgres-session-store.mjs';
import {drawGachaTransaction} from '../security/mio-gacha-transaction.mjs';
import {getSyntheticAuthFixture} from './fixtures/synthetic-auth-data.mjs';

assert.equal(process.env.CI,'true','synthetic identity integration is CI-only');
const connection=new URL(process.env.MIO_TEST_DATABASE_URL||'postgresql://invalid/');
assert.equal(connection.protocol,'postgresql:');
assert.equal(connection.hostname,'127.0.0.1');
assert.equal(connection.port,'5432');
assert.equal(connection.pathname,'/mio_ci_test');
assert.equal(connection.username,'mio_test');
const {Pool}=createRequire(import.meta.url)(process.env.MIO_TEST_PG_MODULE);
const pool=new Pool({connectionString:connection.href,max:12,connectionTimeoutMillis:5000,
  statement_timeout:10000,options:'-c search_path=mio_fixture_ci,public'});
async function balance(id){return (await pool.query('SELECT remaining FROM mio_gacha_balances_v21 WHERE account_id=$1',[id])).rows[0].remaining;}
async function draws(id){return (await pool.query('SELECT draw_id,prize_code,request_key FROM mio_gacha_draws_v21 WHERE account_id=$1 ORDER BY draw_id',[id])).rows;}
before(async()=>{
 const actual=(await pool.query('SELECT current_database() AS db,current_user AS username')).rows[0];
 assert.equal(actual.db,'mio_ci_test');assert.equal(actual.username,'mio_test');
 await pool.query('CREATE SCHEMA mio_fixture_ci');
 await pool.query(await readFile(new URL('../security/mio-auth-v21-schema.preview.sql',import.meta.url),'utf8'));
});
after(async()=>{await pool.end();});

test('shared synthetic identity fixtures reject case-folded and cross-type ID collisions atomically',async()=>{
 const winnerFixture=getSyntheticAuthFixture('duplicateRaceWinner');
 const contenderFixture=getSyntheticAuthFixture('duplicateRaceContender');
 const outcomes=await Promise.allSettled([
  registerAccountTransaction(pool,winnerFixture),
  registerAccountTransaction(pool,{...contenderFixture,loginId:winnerFixture.loginId.toUpperCase()}),
 ]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
 const winnerIndex=outcomes.findIndex(x=>x.status==='fulfilled');
 const winnerFixtureUsed=winnerIndex===0?winnerFixture:{...contenderFixture,loginId:winnerFixture.loginId.toUpperCase()};
 const winner=outcomes[winnerIndex].value;
 const loserFixture=winnerIndex===0?{...contenderFixture,loginId:winnerFixture.loginId.toUpperCase()}:winnerFixture;
 const ids=createPostgresIdentifierStore(pool);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM mio_accounts_v21 WHERE lower(login_id)=lower($1)',[winnerFixture.loginId])).rows[0].n,1);
 assert.equal(await ids.resolve(loserFixture.mioId),null,'losing account identifier must roll back');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM mio_accounts_v21 WHERE mio_id=$1',[loserFixture.mioId])).rows[0].n,0);

 await assert.rejects(registerAccountTransaction(pool,{
  mioId:'SYNTH-CROSS-OTHER-001',loginId:winnerFixtureUsed.mioId,password:contenderFixture.password,
 }),/already registered/,'an existing MIO-ID must not be claimable as another login ID');
 await assert.rejects(registerAccountTransaction(pool,{
  mioId:winnerFixtureUsed.loginId,loginId:'Cross_Test2026',password:contenderFixture.password,
 }),/already registered/,'an existing login ID must not be claimable as another MIO-ID');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM mio_accounts_v21')).rows[0].n,1);
 assert.equal(await ids.resolve(winnerFixtureUsed.mioId),winner.accountId);
 assert.equal(await ids.resolve(winnerFixtureUsed.loginId),winner.accountId);
});

test('shared history fixture keeps old ID reserved, sessions, draw history and gacha balance after ID change',async()=>{
 const fixture=getSyntheticAuthFixture('historyOwner');
 const owner=await registerAccountTransaction(pool,fixture);
 const ids=createPostgresIdentifierStore(pool),sessions=createPostgresSessionStore(pool);
 const sessionA=await sessions.create(owner.accountId,'Synthetic device A');
 const sessionB=await sessions.create(owner.accountId,'Synthetic device B');
 await pool.query('UPDATE mio_gacha_balances_v21 SET remaining=2 WHERE account_id=$1',[owner.accountId]);
 await drawGachaTransaction(pool,{accountId:owner.accountId,requestKey:'synthetic-history-draw-001',selectPrize:async()=>'SYNTHETIC-PRIZE'});
 const savedDraws=await draws(owner.accountId);
 const newLoginId='History_Changed2026';
 await ids.changeLoginId(owner.accountId,newLoginId);
 assert.equal(await ids.resolve(owner.mioId),owner.accountId);
 assert.equal(await ids.resolve(newLoginId),owner.accountId);
 assert.equal(await ids.resolve(fixture.loginId),null,'retired ID is no longer a login alias');
 await assert.rejects(registerAccountTransaction(pool,{
  mioId:'SYNTH-NEW-OWNER-001',loginId:fixture.loginId,password:fixture.password,
 }),/already registered/,'retired login ID remains reserved');
 assert.equal((await sessions.lookup(sessionA.token)).accountId,owner.accountId);
 assert.equal((await sessions.lookup(sessionB.token)).accountId,owner.accountId);
 assert.equal(await balance(owner.accountId),1);
 assert.deepEqual(await draws(owner.accountId),savedDraws);

 const simultaneous=await Promise.all([
  drawGachaTransaction(pool,{accountId:owner.accountId,requestKey:'synthetic-device-a-draw',selectPrize:async()=>'SYNTHETIC-A'}),
  drawGachaTransaction(pool,{accountId:owner.accountId,requestKey:'synthetic-device-b-draw',selectPrize:async()=>'SYNTHETIC-B'}),
 ]);
 assert.equal(simultaneous.filter(x=>x.status==='drawn').length,1);
 assert.equal(simultaneous.filter(x=>x.status==='no_rights').length,1);
 assert.equal(await balance(owner.accountId),0,'both devices share one remaining right');
 assert.equal((await draws(owner.accountId)).length,2);
});
