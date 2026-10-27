import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const requests=[];
page.on('request',r=>{if(r.url().includes('/api/gacha'))requests.push(r.url())});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const origin='http://127.0.0.1:8765';
const url=origin+'/gacha.html?deluxeDemo=1';
try {
  await page.goto(url,{waitUntil:'load'});
  await page.locator('.mio-deluxe-demo').waitFor();
  assert.match(await page.locator('#gachaUserMessage').innerText(),/プレビュー/);
  assert.equal(await page.locator('#drawNormal').isDisabled(),true);
  assert.equal(await page.locator('#drawFest').isDisabled(),true);
  assert.equal(await page.locator('.mio-deluxe-demo').count(),1);
  const buttons=page.locator('.mio-deluxe-demo-actions button');
  await buttons.nth(0).click();
  await page.locator('.mio-deluxe-demo-skip').waitFor({state:'visible'});
  await page.locator('.mio-deluxe-demo-skip').click();
  await page.locator('#drawResultCard').waitFor({state:'visible'});
  assert.match(await page.locator('#drawOrdinal').innerText(),/抽選・当選はしていません/);
  await buttons.nth(1).click();
  await page.locator('.mio-deluxe-demo-status').getByText('デモ完了。抽選回数・履歴は変わっていません。').waitFor({timeout:10000});
  assert.equal(await page.locator('#drawNormal').isDisabled(),true);
  assert.equal(await page.locator('#drawFest').isDisabled(),true);
  assert.equal(requests.length,0,'preview must not call draw API');
  assert.deepEqual(errors,[], 'no browser JS errors allowed');
  console.log('GACHA_VISUAL_PREVIEW PASS: mobile viewport, 2 modes, skip, result, no API traffic');
} finally {await browser.close()}
