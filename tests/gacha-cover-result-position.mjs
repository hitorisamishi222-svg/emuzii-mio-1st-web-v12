/**
 * Focused regression for user-reported royal cover/result overlap.
 * Tests that result appears BELOW the complete whale artwork, not over it.
 * Local static preview only, never accesses real draw APIs.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 for(const width of [375,390,430]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const requests=[],errors=[];
  page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url())});
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:8765/gacha.html?deluxeDemo=1',{waitUntil:'load'});
   await page.locator('.mio-deluxe-demo').waitFor();
   await page.locator('#mio-deluxe-demo-rarity').selectOption('UR');
   await page.locator('.mio-deluxe-demo-actions button').first().click();
   await page.locator('#drawResultCard').waitFor({state:'visible',timeout:5500});
   const placement=await page.evaluate(()=>{
    const st=document.getElementById('gachaStage'),result=document.getElementById('drawResultCard');
    const a=st.getBoundingClientRect(),b=result.getBoundingClientRect();
    const bg=getComputedStyle(st).backgroundImage;
    return {
      stageTop:a.top,stageBottom:a.bottom,
      resultTop:b.top,resultBottom:b.bottom,resultWidth:b.width,
      stageWidth:a.width,stageHeight:a.height,
      cardIsChildOfStage:st.contains(result),
      cardParentId:result.parentElement.id,
      color:getComputedStyle(result).backgroundColor,
      backgroundImage:bg, horizontalScroll:document.documentElement.scrollWidth,
      innerWidth:document.documentElement.clientWidth
    }
   });
   assert.equal(placement.cardIsChildOfStage,false,'result must not obscure machine art');
   assert.ok(placement.resultTop>=placement.stageBottom-2,'result must start below artwork: '+JSON.stringify(placement));
   assert.ok(placement.stageHeight>250 && placement.stageWidth>250,'artwork remains sizeable');
   assert.match(placement.backgroundImage,/mio-royal-whale-machine.jpg/,'original cover art remains');
   assert.ok(placement.resultWidth>220 && placement.resultWidth<=placement.innerWidth+2,'result readable within phone');
   assert.ok(placement.horizontalScroll<=placement.innerWidth+2,'no horizontal clipping');
   assert.match(await page.locator('#drawRarity').innerText(),/UR.*DEMO/);
   assert.match(await page.locator('#drawOrdinal').innerText(),/抽選・当選はしていません/);
   assert.equal(requests.length,0,'demo must not reach API');
   assert.deepEqual(errors,[],'page JS errors');
   console.log('GACHA_COVER_DOCK PASS '+width+'px: art unobscured, result below stage');
  }finally{await page.close()}
 }
}finally{await browser.close()}
