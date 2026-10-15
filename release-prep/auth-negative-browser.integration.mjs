// CI-only negative-path browser auth test with synthetic identities and ephemeral PostgreSQL.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer as createHttpsServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {registerAccountTransaction} from '../security/mio-postgres-registration.mjs';
import {startTestAuthHttpServer} from './test-auth-http-server.mjs';

assert.equal(process.env.CI, 'true', 'negative browser auth test is CI-only');
const database = new URL(process.env.MIO_TEST_DATABASE_URL || 'postgresql://invalid/');
assert.equal(database.protocol, 'postgresql:');
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '5432');
assert.equal(database.pathname, '/mio_ci_test');
assert.equal(database.username, 'mio_test');
const {Pool} = createRequire(import.meta.url)(process.env.MIO_TEST_PG_MODULE);
const {chromium, webkit} = createRequire(import.meta.url)(process.env.MIO_BROWSER_MODULE);
const pool = new Pool({connectionString: database.href, options: '-c search_path=mio_http_ci,public',
  max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000});
const password = 'Synthetic-Negative-Password-2026!';
const syntheticLoginId = 'Negative_User2026';
let browser, front, api, appOrigin, account;
const throttle = {async allow() { return true; }};
const files = new Map([
  ['/login-recovery-demo.html', ['login-recovery-demo.html', 'text/html; charset=utf-8']],
  ['/mio-approved-layout-preview.css', ['mio-approved-layout-preview.css', 'text/css; charset=utf-8']],
  ['/mio-approved-background-guard.js', ['mio-approved-background-guard.js', 'text/javascript; charset=utf-8']],
  ['/assets/mio-bg-princess.jpg', ['assets/mio-bg-princess.jpg', 'image/jpeg']],
  ['/assets/mio-bg-devil.jpg', ['assets/mio-bg-devil.jpg', 'image/jpeg']],
]);

before(async () => {
  const actual = (await pool.query('SELECT current_database() AS db,current_user AS username')).rows[0];
  assert.equal(actual.db, 'mio_ci_test');
  assert.equal(actual.username, 'mio_test');
  await pool.query('CREATE SCHEMA mio_http_ci');
  await pool.query(await readFile(new URL('../security/mio-auth-v21-schema.preview.sql', import.meta.url), 'utf8'));
  account = await registerAccountTransaction(pool, {
    mioId: 'SYNTH-NEGATIVE-MIO-001',
    loginId: syntheticLoginId,
    password,
  });

  const key = await readFile(process.env.MIO_TEST_TLS_KEY, 'utf8');
  const cert = await readFile(process.env.MIO_TEST_TLS_CERT, 'utf8');
  front = createHttpsServer({key, cert}, async (req, res) => {
    const url = new URL(req.url, 'https://127.0.0.1');
    if (url.pathname.startsWith('/test-auth/')) {
      const upstream = httpRequest(api.url + url.pathname + url.search, {
        method: req.method, headers: req.headers,
      }, response => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end(); } });
      req.pipe(upstream);
      return;
    }
    const file = files.get(url.pathname);
    if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return; }
    try {
      const body = await readFile(new URL('../' + file[0], import.meta.url));
      res.writeHead(200, {'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      if (req.method === 'HEAD') res.end(); else res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { front.once('error', reject); front.listen(0, '127.0.0.1', resolve); });
  appOrigin = `https://127.0.0.1:${front.address().port}`;
  api = await startTestAuthHttpServer({pool, trustedOrigin: appOrigin, throttle});
  const engine = process.env.MIO_BROWSER === 'webkit' ? webkit : chromium;
  browser = await engine.launch({headless: true});
});

after(async () => {
  if (browser) await browser.close();
  if (api) await api.close();
  if (front) await new Promise(resolve => front.close(resolve));
  if (account) await pool.query('DELETE FROM mio_sessions_v21 WHERE account_id=$1', [account.accountId]);
  await pool.end();
});

test('browser gives the same generic error for a wrong password and an unknown synthetic ID without issuing cookies', async () => {
  const context = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const statuses = [];
  const page = await context.newPage();
  page.on('response', response => {
    if (response.url().includes('/test-auth/')) statuses.push([new URL(response.url()).pathname, response.status()]);
  });
  try {
    await page.goto(appOrigin + '/login-recovery-demo.html');
    await page.getByRole('button', {name: 'ログインIDが分かる'}).click();

    await page.locator('#loginId').fill(syntheticLoginId);
    await page.locator('#loginPassword').fill('Wrong-Synthetic-Password-2026!');
    await page.locator('#testLogin').click();
    await page.locator('#result').waitFor({state: 'visible'});
    const wrongPasswordMessage = (await page.locator('#result').innerText()).trim();
    assert.equal(wrongPasswordMessage, 'IDまたはパスワードを確認してください。');
    assert.equal((await context.cookies(appOrigin)).some(cookie => cookie.name === '__Host-mio_session'), false);

    await page.locator('#loginId').fill('Missing_User2026');
    await page.locator('#loginPassword').fill('Wrong-Synthetic-Password-2026!');
    await page.locator('#testLogin').click();
    await page.locator('#result').waitFor({state: 'visible'});
    const unknownIdMessage = (await page.locator('#result').innerText()).trim();
    assert.equal(unknownIdMessage, wrongPasswordMessage, 'unknown identity must not disclose account existence');
    assert.equal((await context.cookies(appOrigin)).some(cookie => cookie.name === '__Host-mio_session'), false);
    assert.deepEqual(statuses.filter(x => x[0] === '/test-auth/login').map(x => x[1]), [401, 401]);

    const sessions = await pool.query('SELECT count(*)::int AS count FROM mio_sessions_v21 WHERE account_id=$1', [account.accountId]);
    assert.equal(sessions.rows[0].count, 0, 'failed synthetic logins must not create sessions');
  } finally {
    await context.close();
  }
});
