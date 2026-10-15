// CI-only browser → HTTPS → test HTTP auth API → temporary PostgreSQL.
// Runs the repository's actual login and device-management pages with synthetic accounts.
import test, {before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer as createHttpsServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {registerAccountTransaction} from '../security/mio-postgres-registration.mjs';
import {sessionTokenDigest} from '../security/mio-auth-crypto.mjs';
import {startTestAuthHttpServer} from './test-auth-http-server.mjs';
import {getSyntheticAuthFixture} from './fixtures/synthetic-auth-data.mjs';

assert.equal(process.env.CI, 'true', 'browser auth verification is CI-only');
const database = new URL(process.env.MIO_TEST_DATABASE_URL || 'postgresql://invalid/');
assert.equal(database.protocol, 'postgresql:');
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '5432');
assert.equal(database.pathname, '/mio_ci_test');
assert.equal(database.username, 'mio_test');
const {Pool} = createRequire(import.meta.url)(process.env.MIO_TEST_PG_MODULE);
const {chromium, webkit} = createRequire(import.meta.url)(process.env.MIO_BROWSER_MODULE);
const pool = new Pool({connectionString: database.href, options: '-c search_path=mio_http_ci,public',
  max: 20, connectionTimeoutMillis: 5000, statement_timeout: 10000});
const originFor = port => `https://127.0.0.1:${port}`;
const browserFixture = getSyntheticAuthFixture('browserPrimary');
const password = browserFixture.password;
let browser, front, api, appOrigin, account;
const throttle = {async allow() { return true; }};
const files = new Map([
  ['/login-recovery-demo.html', ['login-recovery-demo.html', 'text/html; charset=utf-8']],
  ['/device-sessions-preview.html', ['device-sessions-preview.html', 'text/html; charset=utf-8']],
  ['/passkey-preview.html', ['passkey-preview.html', 'text/html; charset=utf-8']],
  ['/mio-approved-layout-preview.css', ['mio-approved-layout-preview.css', 'text/css; charset=utf-8']],
  ['/mio-approved-background-guard.js', ['mio-approved-background-guard.js', 'text/javascript; charset=utf-8']],
  ['/mio-auth-rules-v21.js', ['mio-auth-rules-v21.js', 'text/javascript; charset=utf-8']],
  ['/assets/mio-bg-princess.jpg', ['assets/mio-bg-princess.jpg', 'image/jpeg']],
  ['/assets/mio-bg-devil.jpg', ['assets/mio-bg-devil.jpg', 'image/jpeg']],
]);

async function login(context, identifier) {
  const page = await context.newPage();
  const diagnostics = [];
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(`console:${message.text()}`); });
  page.on('response', response => { if (response.url().includes('/test-auth/')) diagnostics.push(`api:${response.status()} ${new URL(response.url()).pathname}`); });
  await page.goto(appOrigin + '/login-recovery-demo.html');
  await page.getByRole('button', {name: 'ログインIDが分かる'}).click();
  await page.locator('#loginId').fill(identifier);
  await page.locator('#loginPassword').fill(password);
  assert.equal(await page.locator('#testLoginForm').getAttribute('autocomplete'), 'on');
  assert.equal(await page.locator('#testLogin').getAttribute('type'), 'submit');
  await page.locator('#loginPassword').press('Enter');
  await page.locator('#result').waitFor({state: 'visible', timeout: 10000});
  const result = (await page.locator('#result').innerText()).trim();
  assert.equal(result, 'TESTログイン成功。端末管理画面で接続を確認できます。',
    `login page result: ${result}; ${diagnostics.join(' | ')}`);
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
  await pool.query('CREATE SCHEMA mio_http_ci');
  await pool.query(await readFile(new URL('../security/mio-auth-v21-schema.preview.sql', import.meta.url), 'utf8'));
  account = await registerAccountTransaction(pool, browserFixture);

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
afterEach(async () => {
  if (account) await pool.query('DELETE FROM mio_sessions_v21 WHERE account_id=$1', [account.accountId]);
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
    // The UI currently labels both browser contexts "スマホ". Match the tablet's
    // actual browser cookie digest to its row before revoking that specific session.
    const tabletCookie = (await tabletContext.cookies(appOrigin)).find(x => x.name === '__Host-mio_session');
    const tabletSessionId = sessionTokenDigest(tabletCookie.value);
    const devices = await phone.evaluate(async () => (await (await fetch('/test-auth/devices', {credentials: 'same-origin'})).json()).devices);
    const targetIndex = devices.findIndex(x => x.sessionId === tabletSessionId);
    assert.notEqual(targetIndex, -1, 'tablet cookie must map to an account session');
    const target = phone.locator('#activeDeviceList .device').nth(targetIndex).getByRole('button', {name: 'このTEST端末からログアウト'});
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


test('virtual authenticator registers a passkey, signs in, and rejects challenge replay', async () => {
  const context = await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    await context.credentials.install();
    const page = await login(context, account.loginId);
    await page.goto(appOrigin + '/passkey-preview.html');
    await page.getByText('TESTログイン中です。パスキーを登録できます。').waitFor();
    await page.locator('#register').click();
    await page.waitForFunction(()=>!document.querySelector('#register').disabled);
    const registrationMessage=await page.locator('#status').innerText();
    assert.match(registrationMessage,/パスキーを登録しました/,`registration UI: ${registrationMessage}`);
    const saved = await pool.query('SELECT credential_id,public_key,sign_count FROM mio_passkey_credentials WHERE account_id=$1',[account.accountId]);
    assert.equal(saved.rowCount,1,'server stores a public credential for the synthetic account');
    assert.ok(saved.rows[0].public_key.length>32);
    assert.equal((await context.credentials.get({rpId:'127.0.0.1'})).length,1,'virtual authenticator holds the registered private credential');
    const logout=await page.evaluate(async()=>{const r=await fetch('/test-auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});return r.status});
    assert.equal(logout,200);
    const passkeyDiagnostics=[];
    page.on('pageerror',error=>passkeyDiagnostics.push('pageerror:'+error.message));
    page.on('response',async response=>{
      if(response.url().includes('/test-auth/passkey-')){
        let body='';
        try{body=await response.text()}catch{}
        passkeyDiagnostics.push(`api:${response.status()} ${new URL(response.url()).pathname} ${body}`);
      }
    });
    await page.locator('#identifier').fill(account.mioId);
    await page.locator('#login').click();
    await page.waitForFunction(()=>{
      const value=document.querySelector('#status')?.textContent?.trim()||'';
      return value==='パスキーでログインしました。'||
        (value!==''&&value!=='パスキーを登録しました。この端末でログインできます。');
    },{timeout:12000}).catch(()=>{});
    const loginMessage=(await page.locator('#status').innerText()).trim();
    assert.match(loginMessage,/パスキーでログインしました。/,
      `passkey login UI: ${loginMessage}; ${passkeyDiagnostics.join(' | ')}`);
    assert.ok((await context.cookies(appOrigin)).some(x=>x.name==='__Host-mio_session'),'passkey login issues the regular server session cookie');
    const replay=await page.evaluate(async()=>{
      const start=await post('/test-auth/passkey-login-options',{identifier:document.querySelector('#identifier').value});
      const assertion=await navigator.credentials.get({publicKey:publicKeyOptions(start.d.options)});
      const body={challengeId:start.d.challengeId,response:serialize(assertion),deviceLabel:'再送テスト'};
      const first=await post('/test-auth/passkey-login-verify',body);
      const second=await post('/test-auth/passkey-login-verify',body);
      return [first.r.status,second.r.status,second.d.error];
    });
    assert.deepEqual(replay,[200,400,'challenge_expired'],'each authentication challenge is consumed once');
  } finally { await context.close(); }
});
