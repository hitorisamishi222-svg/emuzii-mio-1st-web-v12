// CI-only proof that the real login page never POSTs credentials when TEST API is disabled.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer as createHttpsServer} from 'node:https';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

assert.equal(process.env.CI, 'true', 'disabled-preview browser check is CI-only');
const {chromium, webkit} = createRequire(import.meta.url)(process.env.MIO_BROWSER_MODULE);
const requests = [];
let browser, server, origin;
const files = new Map([
  ['/login-recovery-demo.html', ['login-recovery-demo.html', 'text/html; charset=utf-8']],
  ['/mio-approved-layout-preview.css', ['mio-approved-layout-preview.css', 'text/css; charset=utf-8']],
  ['/mio-approved-background-guard.js', ['mio-approved-background-guard.js', 'text/javascript; charset=utf-8']],
  ['/assets/mio-bg-princess.jpg', ['assets/mio-bg-princess.jpg', 'image/jpeg']],
  ['/assets/mio-bg-devil.jpg', ['assets/mio-bg-devil.jpg', 'image/jpeg']],
]);

before(async () => {
  const key = await readFile(process.env.MIO_TEST_TLS_KEY, 'utf8');
  const cert = await readFile(process.env.MIO_TEST_TLS_CERT, 'utf8');
  server = createHttpsServer({key, cert}, async (req, res) => {
    const url = new URL(req.url, 'https://127.0.0.1');
    if (url.pathname.startsWith('/test-auth/')) {
      requests.push({method:req.method, path:url.pathname});
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(503);
      res.end(JSON.stringify({error:'test_environment_not_ready'}));
      return;
    }
    const file = files.get(url.pathname);
    if (!file || !['GET','HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return; }
    try {
      const body = await readFile(new URL('../'+file[0], import.meta.url));
      res.writeHead(200, {'Content-Type':file[1], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
      if (req.method === 'HEAD') res.end(); else res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin = `https://127.0.0.1:${server.address().port}`;
  const engine = process.env.MIO_BROWSER === 'webkit' ? webkit : chromium;
  browser = await engine.launch({headless:true});
});

after(async()=>{
  if(browser) await browser.close();
  if(server) await new Promise(resolve=>server.close(resolve));
});

test('disabled TEST API only receives the preflight GET; synthetic credentials are never POSTed',async()=>{
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try{
    const page=await context.newPage();
    await page.goto(origin+'/login-recovery-demo.html');
    await page.getByRole('button',{name:'ログインIDが分かる'}).click();
    await page.locator('#loginId').fill('Synthetic-Disabled-User-2026');
    await page.locator('#loginPassword').fill('Synthetic-Only-Password-2026!');
    await page.locator('#testLogin').click();
    await page.locator('#result').waitFor({state:'visible'});
    assert.equal((await page.locator('#result').innerText()).trim(),
      'TEST認証APIの応答を確認できません。ログイン情報は送信していません。');
    assert.deepEqual(requests,[{method:'GET',path:'/test-auth/me'}]);
    assert.equal((await context.cookies(origin)).some(c=>c.name==='__Host-mio_session'),false);
  }finally{await context.close();}
});
