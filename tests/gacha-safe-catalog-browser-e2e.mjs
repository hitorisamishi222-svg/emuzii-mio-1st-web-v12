/**
 * New-only Playwright E2E contract check.
 * Browser visits a LOCAL HTTP server. We replace just the "isPreview" constant
 * in the served in-memory JavaScript so the authenticated UI flow can run,
 * then intercept and mock every /api/ request. The repository and any real
 * Apps Script / live domain remain completely untouched.
 *
 * DO NOT point this file at a production deployment.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const origin='http://127.0.0.1:8765';
const js=readFileSync('gacha-page.js','utf8');
const sourcePreview="const isPreview=location.hostname!=='emuzii-mio-1st-web-v12.vercel.app';";
assert.ok(js.includes(sourcePreview),'Preview mode switch was modified; halt without test-time override');
const testJs=js.replace(sourcePreview,'const isPreview=false; // LOCAL E2E IN-MEMORY OVERRIDE ONLY');
const browser=await chromium.launch({headless:true});
const id='MOCK-WEB-ONLY';
const valid=overrides=>({
 ok:true,participantId:id,confirmed:true,
 used:0,remaining:5,nextOrdinal:1,webDrawsUsed:0,
 festAvailableFrom:5,festEntitled:true,festUnlocked:false,
 normalOpen:true,festOpen:true,
 normal:{ready:true,message:'通常景品あり',total:100,prizes:[{id:'MEM-MOCK',name:'テスト景品',rarity:'R',chance:100}]},
 fest:{ready:true,message:'祭典景品あり',total:100,prizes:[{id:'LF-MOCK',name:'テスト宝物',rarity:'R',chance:100}]},
 ...overrides
});
function withoutFields(){
 const c=valid();
 delete c.festEntitled;delete c.webDrawsUsed;delete c.nextOrdinal;
 return c;
}
const cases=[
 {label:'old GAS response is blocked',catalog:withoutFields(),normal:false,festival:false,error:true},
 {label:'modern catalog; only normal allowed before fourth draw',catalog:valid(),normal:true,festival:false},
 {label:'both administrative gates off',catalog:valid({normalOpen:false,festOpen:false}),normal:false,festival:false},
 {label:'at fourth confirmed web draw, fifth festival becomes selectable',catalog:valid({used:4,webDrawsUsed:4,nextOrdinal:5,remaining:1,festUnlocked:true}),normal:true,festival:true},
 {label:'impossible unlocked festival state is rejected',catalog:valid({festUnlocked:true}),normal:false,festival:false,error:true},
 {label:'no remaining rights keeps both disabled',catalog:valid({used:5,webDrawsUsed:5,nextOrdinal:6,remaining:0,festUnlocked:false}),normal:false,festival:false}
];
try{
 let passed=0;
 for(const width of [375,430]){
  for(const testcase of cases){
   const context=await browser.newContext({viewport:{width,height:840},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
   const page=await context.newPage();
   const counts={status:0,catalog:0,history:0,draw:0};
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route(origin+'/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/gacha-page.js'){
      return route.fulfill({status:200,body:testJs,contentType:'text/javascript; charset=utf-8'});
    }
    if(url.pathname==='/api/status'){
      counts.status++;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,participantId:id,status:'承認済み',name:'SYNTHETIC'})});
    }
    if(url.pathname==='/api/gacha'){
      const body=request.postDataJSON()||{},action=body.action;
      if(!(action in counts))throw Error('Unexpected API '+action);
      counts[action]++;
      let response;
      if(action==='catalog')response=testcase.catalog;
      else if(action==='history')response={ok:true,participantId:id,history:[]};
      else response={ok:false,error:'TEST WOULD NOT PERMIT A DRAW'};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
    }
    return route.continue();
   });
   try{
    await page.goto(origin+'/gacha.html',{waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelector('#drawPanel')?.hidden===false,{timeout:7000});
    // The UI renders asynchronously after response; this assertion is itself a
    // browser-visible indicator and never requires pressing draw.
    if(testcase.error)await page.getByText(/ガチャの安全確認が完了していません/).first().waitFor();
    else await page.getByText(/ガチャ残り/).first().waitFor();
    const state=await page.evaluate(()=>{
      const d=id=>document.getElementById(id);
      return {
        normal:d('drawNormal').disabled,
        festival:d('drawFest').disabled,
        msg:d('drawMessage').textContent,
        noticeHidden:d('previewNotice').hidden,
        viewportWidth:document.documentElement.clientWidth,
        documentWidth:document.documentElement.scrollWidth
      };
    });
    assert.equal(state.normal,!testcase.normal,testcase.label+' normal gate '+width);
    assert.equal(state.festival,!testcase.festival,testcase.label+' festival gate '+width);
    assert.equal(state.noticeHidden,true,'server-flow test should not use demo UI');
    assert.equal(counts.draw,0,'NO draw is ever requested in this test');
    assert.equal(counts.status,1,'single fake session');
    assert.equal(counts.catalog,1,'single fake catalog read');
    assert.ok(state.documentWidth<=state.viewportWidth+2,'no horizontal page scroll');
    assert.deepEqual(errors,[],'no browser exceptions: '+testcase.label);
    console.log('GACHA_BROWSER_CONTRACT PASS '+width+'px — '+testcase.label);
    passed++;
   }finally{await context.close();}
  }
 }
 assert.equal(passed,12);
 console.log('GACHA_BROWSER_CONTRACT total PASS '+passed+'/12, no live API or draw');
}finally{
 await browser.close();
}
