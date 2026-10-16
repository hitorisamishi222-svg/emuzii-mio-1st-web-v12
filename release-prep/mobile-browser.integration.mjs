// CI-only browser checks. Static preview files, synthetic state and localhost only.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {createRequire} from 'node:module';

assert.equal(process.env.CI, 'true', 'Run only inside the isolated browser CI job');
const engine = process.env.MIO_BROWSER;
assert.ok(['chromium', 'webkit'].includes(engine));
const playwright = createRequire(import.meta.url)(process.env.MIO_BROWSER_MODULE);
const root = process.cwd();
const output = resolve(root, `artifacts/mobile-browser-${engine}`);
const pages = [
  'home-portrait-next.html', 'news.html', 'schedule.html', 'home-updates-demo.html',
  'mio-royal-whale-v74.html', 'attendance-deluxe-demo.html', 'mypage-deluxe-demo.html',
  'admin-center-demo.html', 'community-demo.html', 'music-gallery-demo.html',
  'login-recovery-demo.html', 'login-id-settings-preview.html', 'device-sessions-preview.html',
  'account-linkage-test.html', 'passkey-preview.html', 'integrated-functional-test.html',
  'integrated-live-demo.html', 'next-preview.html',
];
const widths = [320, 375, 390, 430];
const selection = process.env.MIO_BROWSER_CASES ? JSON.parse(process.env.MIO_BROWSER_CASES)[engine] : null;
const selected = id => !selection || selection.includes(id);
const results = [];
let browser, server, base;
const contentTypes = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2'};

before(async () => {
  await mkdir(output, {recursive: true});
  server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const name = path === '/' ? 'next-preview.html' : path.slice(1);
      const allowed = name.startsWith('assets/') || /^[a-z0-9_.-]+\.(html|css|js|png)$/i.test(name);
      if (!allowed || /^(?:index\.html|gacha\.html|api-|bridge\.js)/i.test(name) || path.includes('..')) {
        response.writeHead(403); response.end('Preview-only server'); return;
      }
      const file = resolve(root, name);
      if (!file.startsWith(root + '/')) {response.writeHead(403); response.end(); return;}
      const bytes = await readFile(file);
      response.writeHead(200, {'content-type': contentTypes[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
      response.end(bytes);
    } catch {
      response.writeHead(404); response.end('Preview asset not found');
    }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright[engine].launch({headless: true});
});
after(async () => {
  await writeFile(resolve(output, 'results.json'), JSON.stringify({engine, results}, null, 2));
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
});

async function contextFor(width) {
  const context = await browser.newContext({viewport: {width, height: 844}, isMobile: true,
    hasTouch: true, deviceScaleFactor: 1, locale: 'ja-JP', reducedMotion: 'reduce'});
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    return target.origin === base || ['data:', 'blob:'].includes(target.protocol)
      ? route.continue() : route.abort('blockedbyclient');
  });
  return context;
}

async function runCase(id, width, action) {
  const context = await contextFor(width);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await action(page);
    assert.deepEqual(errors, [], 'Uncaught browser script errors');
    results.push({id, status: 'passed'});
  } catch (error) {
    await page.screenshot({path: resolve(output, `${id}-failure.png`)}).catch(() => {});
    results.push({id, status: 'failed', error: error.message});
    throw error;
  } finally {
    await context.close();
  }
}

for (const width of widths) {
  for (const path of pages) {
    const id = `${width}-${path.replace('.html', '')}`;
    if (!selected(id)) continue;
    test(id, {timeout: 30000}, async () => runCase(id, width, async page => {
      const response = await page.goto(`${base}/${path}`, {waitUntil: 'load'});
      assert.equal(response.status(), 200);
      const body = await page.locator('body').innerText();
      assert.ok(body.trim().length > 30, 'Page must have visible content');
      assert.doesNotMatch(body, /Warning: truncated output|Total output lines:/, 'Tool diagnostics must not be published in the page');
      const layout = await page.evaluate(() => ({viewport: innerWidth, scroll: document.scrollingElement.scrollWidth,
        offenders: [...document.querySelectorAll('body *')].filter(el => {
          const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 2 && getComputedStyle(el).position !== 'fixed' && !el.closest('nav');
        }).slice(0, 6).map(el => `${el.tagName}.${el.className}`)}));
      assert.ok(layout.scroll <= width + 2, `Horizontal overflow: ${JSON.stringify(layout)}`);
      const background = await page.evaluate(async () => {
        const script = document.querySelector('script[src$="/mio-approved-background-guard.js"]');
        if (!script) return null;
        const name = script.dataset.mode === 'event' ? 'mio-bg-devil.jpg' : 'mio-bg-princess.jpg';
        const image = new Image(); image.src = `/assets/${name}`; await image.decode();
        return {name, width: image.naturalWidth, active: document.body.classList.contains('mio-approved-bg'),
          css: getComputedStyle(document.body, '::before').backgroundImage};
      });
      if (background) {
        assert.ok(background.width >= 100 && background.active, 'Approved background must be loaded');
        assert.ok(background.css.includes(background.name), 'Correct approved background must be selected');
      }
      if (path === 'home-portrait-next.html') {
        assert.equal(await page.evaluate(() => Math.round(scrollY)), 0, 'Top page must not auto-scroll past the face during background activation');
      }
      if (['news.html', 'schedule.html', 'home-updates-demo.html'].includes(path)) {
        const backings = await page.locator('.app>header .brand,.app>header .version,.app>header>p,.app>.hero>h1,.app>.hero>p').evaluateAll(elements => elements.map(el => ({
          label: el.textContent.trim().slice(0, 30), background: getComputedStyle(el).backgroundColor,
        })));
        assert.ok(backings.length >= 5);
        for (const block of backings) {
          const rgba = block.background.match(/[\d.]+/g)?.map(Number) || [];
          const alpha = rgba.length === 4 ? rgba[3] : rgba.length === 3 ? 1 : 0;
          assert.ok(alpha >= 0.75, `Text needs a local dark backing over bright artwork: ${JSON.stringify(block)}`);
        }
        if (path === 'home-updates-demo.html') {
          const lines = await page.locator('.app>.hero>h1').evaluate(el => {
            const s = getComputedStyle(el);
            return (el.getBoundingClientRect().height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) / parseFloat(s.lineHeight);
          });
          assert.ok(lines <= 2.1, `Preview heading must fit its intended two lines, observed ${lines}`);
        }
      }
      await page.screenshot({path: resolve(output, `${id}.png`)});
      if (path === 'home-portrait-next.html') {
        await page.locator('a[href="/mypage-deluxe-demo.html"]').scrollIntoViewIfNeeded();
        await page.screenshot({path: resolve(output, `${id}-scrolled.png`)});
      }
    }));
  }
  const id = `${width}-integrated-menu-navigation`;
  if (!selected(id)) continue;
  test(id, {timeout: 45000}, async () => runCase(id, width, async page => {
    await page.goto(`${base}/integrated-live-demo.html`, {waitUntil: 'load'});
    const parentLayers = await page.evaluate(() => ['::before', '::after'].map(p => getComputedStyle(document.body, p).backgroundImage));
    assert.deepEqual(parentLayers, ['none', 'none'], 'Parent shell must not duplicate the face background');
    await page.frameLocator('#frame').getByRole('link', {name: '💎 マイページ', exact: true}).tap();
    assert.match(await page.locator('#frame').getAttribute('src'), /mypage-deluxe-demo\.html$/);
    await page.frameLocator('#frame').locator('body').waitFor();
    assert.match(await page.locator('#direct').getAttribute('href'), /mypage-deluxe-demo\.html$/);
    await page.screenshot({path: resolve(output, `${id}.png`)});
  }));
}

 
// Broad non-gacha interaction sweep: internal destinations and safe visible controls.
// Auth mutations, ticket/draw actions, logout, reset/delete, and form submissions have
// dedicated isolated tests and are intentionally not triggered by this generic sweep.
const interactionPages = [
  'next-preview.html', 'home-portrait-next.html', 'home-top-demo.html',
  'home-updates-demo.html', 'news.html', 'schedule.html',
  'attendance-deluxe-demo.html', 'mypage-deluxe-demo.html', 'admin-center-demo.html',
  'community-demo.html', 'music-gallery-demo.html', 'login-recovery-demo.html',
  'login-id-settings-preview.html', 'device-sessions-preview.html', 'passkey-preview.html',
  'integrated-live-demo.html', 'integrated-functional-test.html',
  'release-readiness.html', 'mobile-checklist.html',
];
const actionSkip = /gacha|ガチャ|抽選|draw|logout|ログアウト|clear|削除|reset|リセット|初期化|grant|付与/i;

test('all non-gacha internal page links resolve', {timeout: 90000}, async () => {
  const context = await contextFor(390);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  try {
    for (const source of interactionPages) {
      const response = await page.goto(`${base}/${source}`, {waitUntil: 'load'});
      assert.equal(response.status(), 200, `${source} must load`);
      const hrefs = await page.locator('a[href]').evaluateAll(links => links.map(a => a.getAttribute('href')));
      for (const href of hrefs) {
        if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
        const target = new URL(href, `${base}/${source}`);
        if (target.origin !== base || (!/\.html?$/i.test(target.pathname) && target.pathname !== '/')) continue;
        const path = target.pathname === '/' ? '/next-preview.html' : target.pathname;
        const destination = await page.request.get(`${base}${path}`);
        assert.equal(destination.status(), 200, `${source} link ${href} must resolve`);
      }
    }
  } finally { await context.close(); }
});

for (const path of interactionPages) {
  if (['integrated-functional-test.html', 'device-sessions-preview.html'].includes(path)) continue;
  const id = `safe-controls-${path.replace('.html','')}`;
  if (!selected(id)) continue;
  test(id, {timeout: 60000}, async () => runCase(id, 390, async page => {
    await page.goto(`${base}/${path}`, {waitUntil: 'load'});
    const controls = page.locator('button:visible:not(:disabled)');
    const count = await controls.count();
    for (let i = 0; i < count; i++) {
      const button = controls.nth(i);
      const type = await button.getAttribute('type') || 'submit';
      const label = ((await button.innerText().catch(() => '')) || await button.getAttribute('aria-label') || '').trim();
      if (type === 'submit' || actionSkip.test(label)) continue;
      const before = await page.locator('body').innerHTML();
      const beforeUrl = page.url();
      await button.click();
      await page.waitForTimeout(120);
      assert.equal(page.url(), beforeUrl, `${path}: safe control unexpectedly navigated`);
      const after = await page.locator('body').innerHTML();
      assert.notEqual(after, before, `${path}: "${label || ('button ' + (i+1))}" did not change visible page state`);
    }
  }));
}
