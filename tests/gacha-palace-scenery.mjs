/**
 * New-only regression: the SVG undersea palace is loaded behind the approved
 * royal whale artwork, while the interactive demo never makes draw requests.
 * It tests the static preview, not production GAS or real member draws.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = 'http://127.0.0.1:8765';
const asset = '/assets/mio-undersea-palace-stage.svg';
const browser = await chromium.launch({headless:true});
try {
  for (const width of [375,430]) {
    const page = await browser.newPage({
      viewport:{width,height:844},
      isMobile:true,hasTouch:true,reducedMotion:'reduce'
    });
    const errors = [], apiRequests = [], assets = [];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.url().includes('/api/'))apiRequests.push(r.url())});
    page.on('response',r=>{if(r.url().endsWith(asset))assets.push(r.status())});
    try {
      await page.goto(root+'/gacha.html?deluxeDemo=1',{waitUntil:'load'});
      await page.locator('.mio-stage-scenery').waitFor();
      const imageState = await page.evaluate(() => {
        const stage=document.getElementById('gachaStage');
        const decor=stage.querySelector('.mio-stage-scenery');
        const whale=stage.querySelector('.mio-stage-art');
        const dock=document.getElementById('drawResultCard');
        const s=stage.getBoundingClientRect();
        return {
          hasScenery:!!decor,
          stageClass:stage.className,
          palaceBackground:getComputedStyle(decor).backgroundImage,
          whaleBackground:getComputedStyle(whale).backgroundImage,
          whaleZ:Number(getComputedStyle(whale).zIndex),
          sceneryZ:Number(getComputedStyle(decor).zIndex),
          imageWidth:s.width,
          stageHeight:s.height,
          resultOutsideStage:!stage.contains(dock),
          documentWidth:document.documentElement.scrollWidth,
          viewportWidth:document.documentElement.clientWidth
        };
      });
      assert.ok(imageState.stageClass.includes('mio-scene-blended'),'deluxe scene must be present');
      assert.match(imageState.palaceBackground,/mio-undersea-palace-stage\.svg/);
      assert.match(imageState.whaleBackground,/mio-royal-whale-machine\.jpg/);
      assert.ok(imageState.whaleZ>imageState.sceneryZ,'whale must stand in front of scenery');
      assert.ok(imageState.resultOutsideStage,'result must stay in the dock below art');
      assert.ok(imageState.imageWidth>250&&imageState.stageHeight>250);
      assert.ok(imageState.documentWidth<=imageState.viewportWidth+2,'no horizontal overflow');
      assert.ok(assets.includes(200),'palace SVG must return HTTP 200: '+JSON.stringify(assets));

      // Change modes only in isolated demo; never click actual draw controls.
      await page.locator('#mio-deluxe-demo-rarity').selectOption('UR');
      await page.locator('.mio-deluxe-demo-actions button').nth(1).click();
      await page.locator('#drawResultCard').waitFor({state:'visible',timeout:5500});
      const result = await page.evaluate(()=>{
        const stage=document.getElementById('gachaStage');
        const card=document.getElementById('drawResultCard');
        return {festival:stage.classList.contains('is-fest'),
          festBackground:getComputedStyle(stage.querySelector('.mio-stage-scenery')).backgroundImage,
          cardTop:card.getBoundingClientRect().top,
          stageBottom:stage.getBoundingClientRect().bottom};
      });
      assert.equal(result.festival,true);
      assert.match(result.festBackground,/mio-undersea-palace-stage\.svg/);
      assert.ok(result.cardTop>=result.stageBottom-2,'result card must remain below palace scene');
      assert.equal(apiRequests.length,0,'rehearsal must not request any production API');
      assert.deepEqual(errors,[],'zero unhandled JS errors');
      console.log('PALACE_SCENERY PASS '+width+'px — normal+festival, SVG 200, artwork intact, dock below, API=0');
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
