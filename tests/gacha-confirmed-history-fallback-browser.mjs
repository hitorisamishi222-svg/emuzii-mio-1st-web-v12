/**
 * NEW FOCUSED BROWSER TEST: recovery from a CONFIRMED history row after
 * draw-response loss. Unrelated older replay tests are not rerun.
 * Local HTTP files + synthetic /api routes ONLY. Zero production calls.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const origin='http://127.0.0.1:8767';
const src=readFileSync('gacha-page.js','utf8');
const marker="const isPreview=location.hostname!=='emuzii-mio-1st-web-v12.vercel.app';";
assert.ok(src.includes(marker),'Preview guard changed; review test before running');
const browserSrc=src.replace(marker,'const isPreview=false; // MOCKED localhost browser test only')
 .replace('window.setInterval(refreshOpenState,30000);','/* Test: no periodic refresh */')
 .replace("window.addEventListener('focus',refreshOpenState);",'/* Test: no focus refresh */')
 .replace("document.addEventListener('visibilitychange',refreshOpenState);",'/* Test: no visibility refresh */')
 .replace("window.addEventListener('pageshow',refreshOpenState);",'/* Test: no page-show refresh */');
const participant='MOCK-WEB-HISTORY-RECOVERY';
const catalog=(n)=>({ok:true,participantId:participant,confirmed:true,used:n,remaining:5-n,nextOrdinal:n+1,
 webDrawsUsed:n,festEntitled:true,festUnlocked:n>=4&&n<5,festAvailableFrom:5,
 normalOpen:true,festOpen:false,
 normal:{ready:true,message:'mock draw',total:100,prizes:[{id:'MOCK',name:'架空の景品',rarity:'R',chance:100,image:''}]},
 fest:{ready:true,message:'mock festival',total:100,prizes:[{id:'MOCK-F',name:'架空の祭典景品',rarity:'R',chance:100,image:''}]}});
const browser=await chromium.launch({headless:true,...(process.env.MIO_SYSTEM_CHROME==='1'?{channel:'chrome'}:{})});
const scenarios=[
 {name:'committed result response lost, recovered from history',kind:'confirmed',expectRecovered:true},
 {name:'failed request with NO confirmed history never invents a win',kind:'not-committed',expectRecovered:false},
 {name:'history with mismatched draw ID and mode does NOT resolve pending',kind:'different-row',expectRecovered:false},
 {name:'history service unavailable leaves original draw ID pending',kind:'history-down',expectRecovered:false}
];
let passed=0;
try{
 for(const width of [375,430]){
  for(const scenario of scenarios){
   const ctx=await browser.newContext({viewport:{width,height:840},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
   const page=await ctx.newPage(),errors=[],attempts=[],events=[];
   let stored=null,historyCalls=0,catalogCalls=0;
   page.on('pageerror',e=>errors.push(String(e)));
   await page.route(origin+'/**',async route=>{
    const req=route.request(),pathname=new URL(req.url()).pathname;
    if(pathname==='/gacha-page.js')return route.fulfill({status:200,contentType:'text/javascript',body:browserSrc});
    if(pathname==='/api/status'){
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,participantId:participant,status:'承認済み',name:'架空ユーザー'})});
    }
    if(pathname==='/api/gacha'){
     const b=req.postDataJSON(),op=b?.action;
     events.push(op);
     if(op==='catalog'){
      catalogCalls++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog(stored?1:0))});
     }
     if(op==='history'){
      historyCalls++;
      if(scenario.kind==='history-down'&&historyCalls===2){
       return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'SYNTHETIC_HISTORY_ERROR'})});
      }
      let entries=[];
      if(stored&&scenario.kind==='confirmed')entries=[stored];
      if(stored&&scenario.kind==='history-down')entries=[stored];
      if(stored&&scenario.kind==='different-row')entries=[
        {...stored,drawId:'0'.repeat(32)},{...stored,mode:'ラキフェス'}
      ];
      return route.fulfill({status:200,contentType:'application/json',
       body:JSON.stringify({ok:true,participantId:participant,history:entries})});
     }
     if(op==='draw'){
      attempts.push(b.drawId);
      assert.equal(attempts.length,1,'No second or new draw request for recovery');
      assert.match(b.drawId,/^[a-f0-9]{32}$/);
      if(scenario.kind!=='not-committed'){
       stored={drawId:b.drawId,mode:b.mode,prize:'架空の景品',ordinal:1,
         rarity:'SR',image:'',date:'2026-10-27T00:00:00Z'};
      }
      // Simulate network failure after backend may have committed a draw.
      return route.abort('failed');
     }
     throw Error('Unrecognized fake operation '+op);
    }
    return route.continue();
   });
   try{
    await page.goto(origin+'/gacha.html',{waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelector('#drawNormal')?.disabled===false,{timeout:12000});
    await page.locator('#drawNormal').click();
    await page.locator('#gachaConfirmYes').click();
    if(scenario.expectRecovered){
     await page.waitForFunction(()=>document.querySelector('#drawResultCard')?.hidden===false,{timeout:12000});
     assert.equal(await page.locator('#drawPrizeName').innerText(),'架空の景品');
     assert.match(await page.locator('#drawOrdinal').innerText(),/確認済み結果/);
     assert.match(await page.locator('#drawMessage').innerText(),/当選履歴から復元/);
     assert.equal(await page.evaluate(id=>localStorage.getItem('mio_pending_draw_'+id),participant),null,
      'clear pending ONLY with matching confirmed history');
     assert.equal(await page.locator('#retryDraw').isHidden(),true);
    }else{
     await page.waitForFunction(()=>!document.querySelector('#retryDraw')?.hidden,{timeout:12000});
     assert.equal(await page.locator('#drawResultCard').isHidden(),true,'no invented result');
     const pending=await page.evaluate(id=>JSON.parse(localStorage.getItem('mio_pending_draw_'+id)),participant);
     assert.equal(pending.drawId,attempts[0],'same pending draw ID is retained');
    }
    assert.equal(attempts.length,1,'never send a second draw request');
    assert.ok(historyCalls>=2,'always query read-only history after draw response error');
    assert.deepEqual(errors,[],'no browser JavaScript exceptions');
    console.log('HISTORY_RECOVERY PASS '+width+'px '+scenario.name+' (draw calls=1)');
    passed++;
   }finally{await ctx.close()}
  }
 }
 assert.equal(passed,8);
 console.log('GACHA HISTORY RECOVERY 8/8 PASS; MOCK data, zero real draws');
}finally{await browser.close()}
