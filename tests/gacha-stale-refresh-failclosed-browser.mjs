/**
 * NEW ONLY: stale catalog fail-closed in real local Chromium browser.
 * 2 failure cases x 2 mobile sizes = 4 focused tests.
 * All /api routes are intercepted and synthetic. No deployed GAS, rights, or
 * Vercel production are contacted. This is NOT the old 12-case test rerun.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const origin='http://127.0.0.1:8765';
const source=readFileSync('gacha-page.js','utf8');
const previewLiteral="const isPreview=location.hostname!=='emuzii-mio-1st-web-v12.vercel.app';";
assert.ok(source.includes(previewLiteral),'preview handling changed; stop before simulating');
// Disable ONLY automatic focus/pageshow/timer refresh in the served local
// test copy so this regression isolates the explicit refresh button.
// Production source, API guards, and draw behavior are never altered.
const browserSource=source.replace(previewLiteral,'const isPreview=false; // local intercepted-API test only')
 .replace('window.setInterval(refreshOpenState,30000);','/* mock E2E: no periodic background refresh */')
 .replace("window.addEventListener('focus',refreshOpenState);",'/* mock E2E: no focus refresh */')
 .replace("document.addEventListener('visibilitychange',refreshOpenState);",'/* mock E2E: no visibility refresh */')
 .replace("window.addEventListener('pageshow',refreshOpenState);",'/* mock E2E: no pageshow refresh */');
const browser=await chromium.launch({headless:true,...(process.env.MIO_SYSTEM_CHROME==='1'?{channel:'chrome'}:{})});
const participant='MOCK-WEB-SAFE-NO-LIVE-DATA';
const catalog={
 ok:true,participantId:participant,confirmed:true,
 used:0,remaining:5,nextOrdinal:1,webDrawsUsed:0,
 festAvailableFrom:5,festEntitled:true,festUnlocked:false,
 normalOpen:true,festOpen:true,
 normal:{ready:true,message:'架空景品',total:100,prizes:[{id:'MEM-FAKE',name:'架空景品',rarity:'R',chance:100}]},
 fest:{ready:true,message:'架空景品',total:100,prizes:[{id:'LF-FAKE',name:'架空の祭典景品',rarity:'R',chance:100}]}
};
const cases=[
 {label:'catalog refresh fails after initial successful catalog',fail:'catalog'},
 {label:'history refresh fails after a fresh catalog',fail:'history'}
];

try{
 let passes=0;
 for(const width of [375,430]){
  for(const testcase of cases){
   const ctx=await browser.newContext({viewport:{width,height:840},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
   const page=await ctx.newPage(),count={status:0,catalog:0,history:0,draw:0},errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route(origin+'/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path==='/gacha-page.js')return route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:browserSource});
    if(path==='/api/status'){
      count.status++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,participantId:participant,status:'承認済み',name:'SYNTHETIC'})});
    }
    if(path==='/api/gacha'){
      const op=req.postDataJSON()?.action;
      assert.ok(Object.hasOwn(count,op),'unexpected mock API call: '+op);
      count[op]++;
      const fail=(op===testcase.fail&&count[op]===2);
      return route.fulfill({status:fail?503:200,contentType:'application/json',
       body:JSON.stringify(fail?{ok:false,error:'SYNTHETIC_REFRESH_FAILED'}:
        op==='catalog'?catalog:op==='history'?{ok:true,participantId:participant,history:[]}:
         {ok:false,error:'NO_DRAWS_ALLOWED'})});
    }
    return route.continue();
   });
   try{
    await page.goto(origin+'/gacha.html',{waitUntil:'load'});
    await page.waitForFunction(()=>document.getElementById('drawNormal')?.disabled===false,{timeout:10000});
    assert.equal(await page.locator('#drawFest').isDisabled(),true,'festival still locked before four Web draws');
    assert.equal(count.catalog,1);
    assert.equal(count.history,1);
    await page.locator('#reloadGacha').click();
    await page.getByText('SYNTHETIC_REFRESH_FAILED',{exact:false}).waitFor({timeout:10000});
    assert.equal(await page.locator('#drawNormal').isDisabled(),true,'stale normal draw must remain disabled');
    assert.equal(await page.locator('#drawFest').isDisabled(),true,'stale festival draw must remain disabled');
    assert.equal(count.draw,0,'no mutation/draw ever called');
    // A NEW valid response should recover; stale cache alone must not.
    await page.locator('#reloadGacha').click();
    await page.waitForFunction(()=>document.getElementById('drawNormal')?.disabled===false,{timeout:10000});
    assert.equal(await page.locator('#drawFest').isDisabled(),true);
    assert.equal(count.catalog,3,'explicit retry must fetch a new catalog');
    assert.equal(count.draw,0,'even recovery must never call real draw');
    assert.deepEqual(errors,[],'no console-execution exception');
    console.log('GACHA_STALE_REFRESH PASS '+width+'px — '+testcase.label);
    passes++;
   }finally{await ctx.close();}
  }
 }
 assert.equal(passes,4);
 console.log('GACHA_STALE_REFRESH total PASS '+passes+'/4; no live network or draws');
}finally{await browser.close();}
