// CI-only browser → HTTPS → test HTTP auth API → temporary PostgreSQL.
// Runs the repository's actual login and device-management pages with synthetic accounts.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer as createHttpsServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {registerAccountTransaction} from '../security/mio-postgres-registration.mjs';
import {startTestAuthHttpServer} from './test-auth-http-server.mjs';

assert.equal(process.env.CI, 'true', 'browser auth verification is CI-only');
const database = new URL(process.env.MIO_TEST_DATABASE_URL || 'postgresql://invalid/');
assert.equal(database.protocol, 'postgresql:');
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '5432');
assert.equal(database.pathname, '/mio_ci_test');
assert.equal(database.username, 'mio_test');
const {Pool} = createRequire(import.meta.url)(process.env.MIO_TEST_PG_MODULE);
const {chromium, webkit} = createRequire(import.meta.url)(process.env.MIO_BROWSER_MODULE);
const pool = new Pool({connectionString: database.href, options: '-c search_path=mio_browser_ci,public',
  max: 20, connectionTimeoutMillis: 5000, statement_timeout: 10000});
const originFor = port => `https://127.0.0.1:${port}`;
const password = 'Synthetic-Browser-Password-2026!';
let browser, front, api, appOrigin, account;
const throttle = {async allow() { return true; }};
const files = new Map([
  ['/login-recovery-demo.html', ['login-recovery-demo.html', 'text/html; charset=utf-8']],
  ['/device-sessions-preview.html', ['device-sessions-preview.html', 'text/html; charset=utf-8']],
  ['/mio-approved-layout-preview.css', ['mio-approved-layout-preview.css', 'text/css; charset=utf-8']],
  ['/mio-approved-background-guard.js', ['mio-approved-background-guard.js', 'text/javascript; charset=utf-8']],
  ['/mio-auth-rules-v21.js', ['mio-auth-rules-v21.js', 'text/javascript; charset=utf-8']],
  ['/assets/mio-bg-princess.jpg', ['assets/mio-bg-princess.jpg', 'image/jpeg']],
  ['/assets/mio-bg-devil.jpg', ['assets/mio-bg-devil.jpg', 'image/jpeg']],
]);

async function login(context, identifier) {
  const page = await context.newPage();
  await page.goto(appOrigin + '/login-recovery-demo.html');
  await page.getByRole('button', {name: 'ログインIDが分かる'}).click();
  await page.locator('#loginId').fill(identifier);
  await page.locator('#loginPassword').fill(password);
  await page.locator('#testLogin').click();
  await page.getByRole('status').getByText('TESTログイン成功。端末管理画面で接続を確認できます。').waitFor();
  return page;
}

async function openDevices(page, expectedCount) {
  await page.goto(appOrigin + '/device-sessions-preview.html');
  await page.locator('#probe').click();
  await page.getByText(`TEST API接続済み・端末 ${expectedCount} 件`).waitFor();
}

before(async () => {
  const actual = (await pool.query('SELECT current_database() AS db,current_user AS username,current_schema() AS schema')).rows[0];
  assert.equal(actual.db, 'mio_ci_test'); assert.equal(actual.username, 'mio_test');
  await pool.query('CREATE SCHEMA mio_browser_ci');
  await pool.query(await readFile(new URL('../security/mio-auth-v21-schema.preview.sql', import.meta.url), 'utf8'));
  account = await registerAccountTransaction(pool, {mioId: 'SYNTH-BROWSER-MIO-001', loginId: 'Browser_User2026', password});

  const key = await readFile(process.env.MIO_TEST_TLS_KEY, 'utf8');
  const cert = await readFile(process.env.MIO_TEST_TLS_CERT, 'utf8');
  front = createHttpsServer({key, cert}, async (req, res) => {
    const pathname = new URL(req.url, 'https://127.0.0.1').pathname;
    if (pathname.startsWith('/test-auth/')) {
      const upstream = httpRequest(api.url + pathname + new URL(req.url, 'https://127.0.0.1').search, {
        method: req.method, headers: req.headers,
      }, response => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end(); } });
      req.pipe(upstream); return;
    }
    const file = files.get(pathname);
    if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return; }
    try {
      const body = await readFile(new URL('../' + file[0], import.meta.url));
      res.writeHead(200, {'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      if (req.method === 'HEAD') res.end(); else res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { front.once('error', reject); front.listen(0, '127.0.0.1', resolve); });
  appOrigin = originFor(front.address().port);
  api = await startTestAuthHttpServer({pool, trustedOrigin: appOrigin, throttle});
  const engine = process.env.MIO_BROWSER === 'webkit' ? webkit : chromium;
  browser = await engine.launch({headless: true});
});

after(async () => {
  if (browser) await browser.close();
  if (api) await api.close();
  if (front) await new Promise(resolve => front.close(resolve));
  await pool.end();
});

test('browser login uses the page UI and stores an actual Secure HttpOnly __Host cookie', async () => {
  const context = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  try {
    const page = await login(context, account.mioId);
    const cookie = (await context.cookies(appOrigin)).find(x => x.name === '__Host-mio_session');
    assert.ok(cookie, 'browser stores the server-issued cookie');
    assert.equal(cookie.secure, true); assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Lax'); assert.equal(cookie.path, '/');
    assert.equal(cookie.domain, '127.0.0.1');
    await page.goto(appOrigin + '/device-sessions-preview.html');
    await page.locator('#probe').click();
    await page.getByText('TEST API接続済み・端末 1 件').waitFor();
  } finally { await context.close(); }
});

test('two independent browser contexts share MIO account, and one device can be revoked in the UI', async () => {
  const phoneContext = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const tabletContext = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 430, height: 932}, isMobile: true, hasTouch: true});
  try {
    const phone = await login(phoneContext, account.loginId);
    const tablet = await login(tabletContext, account.mioId);
    await openDevices(phone, 2);
    // The preview labels both sessions "スマホ". Revoke the newest row (tablet)
    // and verify its own browser cookie stops working while the other stays active.
    const target = phone.locator('#activeDeviceList .device').first().getByRole('button', {name: 'このTEST端末からログアウト'});
    assert.equal(await target.count(), 1);
    phone.once('dialog', dialog => dialog.accept());
    await target.click();
    await phone.getByText('TEST端末のログインを解除しました。端末一覧を再確認してください。').waitFor();
    await tablet.goto(appOrigin + '/device-sessions-preview.html');
    await tablet.locator('#probe').click();
    await tablet.getByText('API応答あり・未ログイン').waitFor();
    await openDevices(phone, 1);
    assert.equal(await phone.locator('#activeDeviceList .device').count(), 1);
  } finally { await phoneContext.close(); await tabletContext.close(); }
});

test('browser UI clears its current cookie and logout-all revokes every remaining session', async () => {
  const first = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const second = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  try {
    const page1 = await login(first, account.loginId);
    const page2 = await login(second, account.mioId);
    await openDevices(page1, 2);
    page1.once('dialog', dialog => dialog.accept());
    await page1.locator('#logoutCurrent').click();
    await page1.getByText('このTEST端末からログアウトしました').waitFor();
    assert.equal((await first.cookies(appOrigin)).some(x => x.name === '__Host-mio_session'), false);
    await page2.goto(appOrigin + '/device-sessions-preview.html');
    await page2.locator('#probe').click();
    await page2.getByText('TEST API接続済み・端末 1 件').waitFor();
    page2.once('dialog', dialog => dialog.accept());
    await page2.locator('#logoutEverywhere').click();
    await page2.getByText('すべてのTEST端末からログアウトしました').waitFor();
    assert.equal((await second.cookies(appOrigin)).some(x => x.name === '__Host-mio_session'), false);
    await page2.locator('#probe').click();
    await page2.getByText('API応答あり・未ログイン').waitFor();
  } finally { await first.close(); await second.close(); }
});
