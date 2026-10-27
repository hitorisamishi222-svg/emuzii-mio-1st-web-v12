/**
 * Only NEW browser recovery edge cases:
 * 1. Replay after full navigation reload following lost response.
 * 2. Refuse a draw if localStorage cannot persist idempotency key.
 *
 * Requests to production-looking origin are ALWAYS intercepted inside Playwright.
 * No network request, production GAS, external session, or real draw is involved.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';

const origin='https://emuzii-mio-1st-web-v12.vercel.app';
const webId='MIO-W-'+'a'.repeat(24);
const browser=await chromium.launch({headless:true});

async function fixture({storageDenied=false,lostResponse=false}={}){
 const context=await browser.newContext({viewport:{width:375,height:812},reducedMotion:'reduce'});
 if(storageDenied)await context.addInitScript(()=>{
  const native=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){
   if(String(k).startsWith('mio_pending_draw_'))throw new DOMException('Synthetic storage blocked','QuotaExceededError');
   return native.call(this,k,v)
  }
 });
 const page=await context.newPage(),sent=[],draws=new Map(),errors=[];
 let aborted=false;
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  assert.equal(u.origin,origin,'never allow external or live request');
  if(u.pathname.startsWith('/api/')){
   const data=route.request().postDataJSON()||{};
   sent.push({endpoint:u.pathname,action:data.action,id:data.drawId});
   let response;
   if(u.pathname==='/api/status')response={ok:true,participantId:webId,name:'SYNTHETIC_ONLY',status:'承認済み'};
   else if(data.action==='catalog')response={ok:true,participantId:webId,confirmed:true,remaining:5-draws.size,used:draws.size,nextOrdinal:draws.size+1,festEntitled:true,festUnlocked:false,festAvailableFrom:5,normalOpen:true,festOpen:false,gateConfigured:true,normal:{ready:true,message:'OK',prizes:[{name:'TEST',chance:100,rarity:'N'}]},fest:{ready:false,message:'OFF',prizes:[]}};
   else if(data.action==='history')response={ok:true,participantId:webId,history:[]};
   else if(data.action==='draw'){
    assert.match(data.drawId,/^[a-f0-9]{32}$/);
    if(!draws.has(data.drawId)){
     draws.set(data.drawId,{ok:true,participantId:webId,drawId:data.drawId,mode:data.mode,prize:'TEST',ordinal:draws.size+1,remaining:5-draws.size,rarity:'N',image:'',replayed:false})
    }
    if(lostResponse&&!aborted){aborted=true;await route.abort('failed');return}
    response={...draws.get(data.drawId),replayed:true};
   }else throw Error('unexpected API action '+data.action);
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
   return;
  }
  const pathname=decodeURIComponent(u.pathname.slice(1))||'index.html';
  const local=resolve(process.cwd(),pathname);
  assert.ok(local.startsWith(process.cwd()+'/'),'block arbitrary file traversal');
  if(!existsSync(local)){await route.fulfill({status:404,body:''});return}
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'}[extname(local)]||'application/octet-stream';
  await route.fulfill({status:200,contentType:type,body:readFileSync(local)});
 });
 await page.goto(origin+'/gacha.html',{waitUntil:'load'});
 await page.waitForFunction(()=>{const b=document.querySelector('#drawNormal');return b && !b.disabled});
 return {page,context,sent,draws,errors};
}
async function confirmOne(page){
 await page.locator('#drawNormal').click();
 await page.locator('#gachaConfirmYes').click();
}
try {
 const f=await fixture({lostResponse:true});
 try{
  await confirmOne(f.page);
  await f.page.locator('#retryDraw').waitFor({state:'visible'});
  const pending=await f.page.evaluate(id=>JSON.parse(localStorage.getItem('mio_pending_draw_'+id)),webId);
  assert.equal(f.draws.size,1);
  await f.page.reload({waitUntil:'load'});
  await f.page.locator('#retryDraw').waitFor({state:'visible'});
  assert.equal(await f.page.locator('#drawNormal').isDisabled(),true,'new draw remains locked while pending exists');
  await f.page.locator('#retryDraw').click();
  await f.page.locator('#drawResultCard').waitFor({state:'visible'});
  const attempts=f.sent.filter(x=>x.action==='draw');
  assert.equal(attempts.length,2);
  assert.equal(attempts[0].id,pending.drawId);
  assert.equal(attempts[1].id,pending.drawId);
  assert.equal(f.draws.size,1,'reload retry does not spend a second right');
  assert.equal(await f.page.evaluate(id=>localStorage.getItem('mio_pending_draw_'+id),webId),null);
  assert.deepEqual(f.errors,[]);
  console.log('GACHA_RELOAD_RECOVERY PASS: hard reload replays original draw ID');
 }finally{await f.context.close()}

 const f2=await fixture({storageDenied:true});
 try {
  await confirmOne(f2.page);
  await f2.page.getByText('端末に抽選確認情報を保存できないため開始しません。').waitFor();
  assert.equal(f2.draws.size,0);
  assert.equal(f2.sent.filter(x=>x.action==='draw').length,0);
  assert.deepEqual(f2.errors,[]);
  console.log('GACHA_STORAGE_DENIAL PASS: no draw attempted when drawId persistence fails');
 }finally{await f2.context.close()}
}finally{await browser.close()}
