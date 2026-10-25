/**
 * Frontend lost-response recovery test with a virtual production origin.
 * All navigation/assets/API are intercepted; ZERO external requests.
 * No actual Gacha API, GAS, sheet, or real user is touched.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const page=await ctx.newPage();
const origin='https://emuzii-mio-1st-web-v12.vercel.app';
const webId='MIO-W-'+'a'.repeat(24);
const reqs=[],draws=new Map();
let failedOnce=false;
const catalog=()=>({ok:true,participantId:webId,confirmed:true,remaining:5-draws.size,used:draws.size,nextOrdinal:draws.size+1,festEntitled:true,festUnlocked:false,festAvailableFrom:5,normalOpen:true,festOpen:false,gateConfigured:true,normal:{ready:true,message:'OK',prizes:[{name:'TEST',rarity:'N',chance:100,image:''}]},fest:{ready:false,message:'STOP',prizes:[]}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.origin!==origin)throw Error('Unexpected external URL '+u.href);
 if(u.pathname.startsWith('/api/')){
  const payload=route.request().postDataJSON()||{};
  reqs.push({path:u.pathname,action:payload.action,id:payload.drawId});
  let result;
  if(u.pathname==='/api/status')result={ok:true,participantId:webId,status:'承認済み',name:'SYNTHETIC'};
  else if(payload.action==='catalog')result=catalog();
  else if(payload.action==='history')result={ok:true,participantId:webId,history:[]};
  else if(payload.action==='draw'){
   let resultId=payload.drawId;
   assert.match(resultId,/^[a-f0-9]{32}$/);
   if(!draws.has(resultId))draws.set(resultId,{ok:true,participantId:webId,drawId:resultId,mode:payload.mode,prize:'TEST',rarity:'N',image:'',ordinal:draws.size+1,remaining:5-draws.size,replayed:false});
   if(!failedOnce){failedOnce=true;await route.abort('failed');return}
   result={...draws.get(resultId),replayed:true};
  }else result={ok:false,error:'unsupported'};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  return;
 }
 const file=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));
 const safe=resolve(process.cwd(),file);
 if(!safe.startsWith(process.cwd()+'/')||!existsSync(safe)){await route.fulfill({status:404,body:''});return}
 const extension=extname(safe);
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'}[extension]||'application/octet-stream';
 await route.fulfill({status:200,contentType:mime,body:readFileSync(safe)});
});
try {
 await page.goto(origin+'/gacha.html',{waitUntil:'load'});
 await page.locator('#drawNormal').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('#drawNormal').disabled);
 await page.locator('#drawNormal').click();
 await page.locator('#gachaConfirmYes').click();
 await page.waitForFunction(()=>document.querySelector('#retryDraw').hidden===false,{timeout:10000});
 assert.equal(draws.size,1,'first request must have already committed one server draw');
 const first=reqs.find(x=>x.action==='draw');
 const pending=await page.evaluate(id=>JSON.parse(localStorage.getItem('mio_pending_draw_'+id)),webId);
 assert.equal(pending.drawId,first.id,'browser persists original draw ID');
 await page.locator('#retryDraw').click();
 await page.waitForFunction(()=>document.querySelector('#drawResultCard').hidden===false,{timeout:10000});
 const attempts=reqs.filter(x=>x.action==='draw');
 assert.equal(attempts.length,2);
 assert.equal(attempts[0].id,attempts[1].id,'retry uses exact draw ID');
 assert.equal(draws.size,1,'only one server-side draw committed');
 assert.equal(await page.evaluate(id=>localStorage.getItem('mio_pending_draw_'+id),webId),null,'clears pending only after recovery');
 assert.match(await page.locator('#drawOrdinal').innerText(),/確認済み結果/);
 assert.deepEqual(errors,[]);
 console.log('GACHA_BROWSER_RECOVERY PASS: lost response, same drawId replay, 1 commit, pending cleared, JS errors 0');
}finally {await browser.close()}
