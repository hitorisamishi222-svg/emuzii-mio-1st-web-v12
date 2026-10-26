/**
 * Focused tests for the new frontend acknowledgment safety guard.
 * NO network traffic leaves Chromium: all requests including HTML/assets
 * are fulfilled from checked-out repository files or mocked API responses.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';

const browser=await chromium.launch({headless:true});
const origin='https://emuzii-mio-1st-web-v12.vercel.app';
const participantId='MIO-W-'+'a'.repeat(24);
const variants=[
 {label:'HTTP 200 with ok:false is NOT success', response:({id})=>({ok:false,error:'管理者側で受付停止中'}),error:/受付停止中/,keepPending:true},
 {label:'HTTP 200 with mismatched drawId cannot clear pending',response:({id})=>({ok:true,drawId:'e'.repeat(32),mode:'通常',prize:'SYNTHETIC',ordinal:1,remaining:4}),error:/整合性/,keepPending:true},
 {label:'HTTP 200 with missing prize cannot clear pending',response:({id})=>({ok:true,drawId:id,mode:'通常',ordinal:1,remaining:4}),error:/整合性/,keepPending:true},
 {label:'HTTP 200 with mismatched mode cannot clear pending',response:({id})=>({ok:true,drawId:id,mode:'ラキフェス',prize:'SYNTHETIC',ordinal:1,remaining:4}),error:/整合性/,keepPending:true},
 {label:'HTTP 200 with a complete matching result succeeds',response:({id})=>({ok:true,drawId:id,mode:'通常',prize:'SYNTHETIC',ordinal:1,remaining:4,rarity:'N',image:''}),error:null,keepPending:false},
 {label:'mismatched participantId fails closed',response:({id})=>({ok:true,participantId:'MIO-W-'+ 'b'.repeat(24),drawId:id,mode:'通常',prize:'SYNTHETIC',ordinal:1,remaining:4}),error:/整合性/,keepPending:true},
 {label:'missing participant identity fails closed',response:({id})=>({ok:true,participantId:null,drawId:id,mode:'通常',prize:'SYNTHETIC',ordinal:1,remaining:4}),error:/整合性/,keepPending:true},
 {label:'negative remaining count fails closed',response:({id})=>({ok:true,drawId:id,mode:'通常',prize:'SYNTHETIC',ordinal:1,remaining:-1}),error:/整合性/,keepPending:true},
 {label:'string ordinal fails closed',response:({id})=>({ok:true,drawId:id,mode:'通常',prize:'SYNTHETIC',ordinal:'1',remaining:4}),error:/整合性/,keepPending:true},
 {label:'missing optional remaining count does not invent 0',response:({id})=>({ok:true,drawId:id,mode:'通常',prize:'SYNTHETIC',ordinal:1}),error:null,keepPending:false},
];

try {
 for(const scenario of variants){
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await ctx.newPage();
  const requests=[],pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   assert.equal(u.origin,origin,'all requests must remain intercepted');
   if(u.pathname.startsWith('/api/')){
    const data=route.request().postDataJSON()||{};
    requests.push({action:data.action,drawId:data.drawId});
    let body;
    if(u.pathname==='/api/status')body={ok:true,participantId,status:'承認済み',name:'SYNTHETIC'};
    else if(data.action==='catalog')body={ok:true,participantId,confirmed:true,remaining:5,used:0,normalOpen:true,festOpen:false,gateConfigured:true,festAvailableFrom:5,festEntitled:true,festUnlocked:false,normal:{ready:true,prizes:[{name:'SYNTHETIC',chance:100}]},fest:{ready:false,prizes:[]}};
    else if(data.action==='history')body={ok:true,participantId,history:[]};
    else if(data.action==='draw'){body=scenario.response({id:data.drawId});if(body.ok===true&&!Object.hasOwn(body,'participantId'))body.participantId=participantId;}
    else throw Error('unexpected API action '+data.action);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    return;
   }
   const file=decodeURIComponent(u.pathname.slice(1))||'index.html';
   const local=resolve(process.cwd(),file);
   assert.ok(local.startsWith(process.cwd()+'/'),'prevent file traversal');
   if(!existsSync(local)){await route.fulfill({status:404,body:''});return}
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'}[extname(local)]||'application/octet-stream';
   await route.fulfill({status:200,contentType:mime,body:readFileSync(local)});
  });
  try{
   await page.goto(origin+'/gacha.html',{waitUntil:'load'});
   await page.waitForFunction(()=>!document.querySelector('#drawNormal')?.disabled);
   await page.locator('#drawNormal').click();
   await page.locator('#gachaConfirmYes').click();
   const pkey='mio_pending_draw_'+participantId;
   if(scenario.keepPending){
    await page.locator('#retryDraw').waitFor({state:'visible',timeout:12000});
    const note=await page.locator('#drawMessage').innerText();
    assert.match(note,scenario.error);
    assert.equal(await page.locator('#drawResultCard').isHidden(),true,'must not show a fake winner');
    const pending=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),pkey);
    assert.match(pending.drawId,/^[a-f0-9]{32}$/);
    assert.equal(pending.mode,'通常');
    assert.equal(await page.locator('#drawNormal').isDisabled(),true,'new draws blocked during uncertainty');
   }else{
    await page.locator('#drawResultCard').waitFor({state:'visible',timeout:12000});
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),pkey),null,'pending removed only on validated success');
    assert.equal(await page.locator('#drawPrizeName').innerText(),'SYNTHETIC');
   }
   assert.equal(requests.filter(x=>x.action==='draw').length,1,'only one draw request for this scenario');
   assert.deepEqual(pageErrors,[]);
   console.log('GACHA_ACK_CONTRACT PASS: '+scenario.label);
  }finally{await ctx.close()}
 }
}finally{await browser.close()}
