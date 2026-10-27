/**
 * Previously passed 390px interaction test is deliberately not re-run.
 * This only checks two untested mobile widths (375 and 430), including
 * text geometry, reduced-motion demo and real-draw blocking.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try {
 for (const width of [375,430]) {
  const page=await browser.newPage({
   viewport:{width,height:812},isMobile:true,hasTouch:true,
   reducedMotion:'reduce'
  });
  const sent=[];
  page.on('request',r=>{if(r.url().includes('/api/gacha'))sent.push(r.url())});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  try {
   await page.goto('http://127.0.0.1:8765/gacha.html?deluxeDemo=1',{waitUntil:'load'});
   await page.locator('.mio-deluxe-demo').waitFor();
   const m=await page.evaluate(()=>{
    const box=s=>document.querySelector(s)?.getBoundingClientRect();
    const v=visualViewport?.width||innerWidth;
    const selectors=['.mio-deluxe-masthead','.royal-gacha-controls','#gachaStage','.mio-deluxe-demo','.mio-deluxe-demo-actions'];
    return {screen:v,docWidth:document.documentElement.scrollWidth,
     items:selectors.map(s=>({selector:s,r:box(s)&&{left:box(s).left,right:box(s).right,width:box(s).width}}))};
   });
   assert.ok(m.docWidth<=m.screen+2,'horizontal overflow at '+width+': '+JSON.stringify(m));
   for (const {selector,r} of m.items) {
    assert.ok(r && r.width>0,'missing '+selector+' at '+width);
    assert.ok(r.left>=-2 && r.right<=m.screen+2,'off-screen '+selector+' at '+width+': '+JSON.stringify(r));
   }
   assert.equal(await page.locator('#drawNormal').isDisabled(),true);
   assert.equal(await page.locator('#drawFest').isDisabled(),true);
   await page.locator('.mio-deluxe-demo-actions button').first().click();
   await page.getByText('デモ完了。抽選回数・履歴は変わっていません。').waitFor({timeout:4000});
   assert.equal(sent.length,0);
   assert.deepEqual(errors,[]);
   console.log('GACHA_MOBILE_LAYOUT PASS '+width+'px reduced-motion demonstration');
  } finally {await page.close()}
 }
} finally {await browser.close()}
