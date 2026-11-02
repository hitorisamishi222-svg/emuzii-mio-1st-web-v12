// Standalone real Chromium smoke for the OFFLINE museum phone diagnostic.
// Serves an explicit static allowlist on 127.0.0.1 only. No real accounts, APIs, DB or uploads.
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,access,mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const cwd=process.cwd(),allowed=new Map([
 ['/museum-device-check.html',['museum-device-check.html','text/html']],
 ['/museum-device-check.js',['museum-device-check.js','text/javascript']],
 ['/museum-image-client.js',['museum-image-client.js','text/javascript']],
 ['/museum-approved-gallery.html',['museum-approved-gallery.html','text/html']],
 ['/museum-approved-gallery.js',['museum-approved-gallery.js','text/javascript']],
 ['/museum-archive.html',['museum-archive.html','text/html']],
 ['/museum-archive.js',['museum-archive.js','text/javascript']],
 ['/mio-admin-rehearsal.html',['mio-admin-rehearsal.html','text/html']],
 ['/gacha-web-gate.html',['gacha-web-gate.html','text/html']],
 ['/mio-admin-rehearsal.js',['mio-admin-rehearsal.js','text/javascript']],
 ['/mio-gas-local-check.html',['mio-gas-local-check.html','text/html']],
 ['/mio-gas-local-check.js',['mio-gas-local-check.js','text/javascript']],
 ['/museum.css',['museum.css','text/css']],
 ['/museum-archive.css',['museum-archive.css','text/css']],
 ['/gallery-items.js',['gallery-items.js','text/javascript']],
 ['/assets/gallery-emuzii-mio-cover.svg',['assets/gallery-emuzii-mio-cover.svg','image/svg+xml']]
]);
const requests=[],writes=[],exceptions=[];
let chrome,ws,server;
const temp=await mkdtemp(join(tmpdir(),'mio-offline-mobile-'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,ms=18000){
 const end=Date.now()+ms;
 while(Date.now()<end){try{const x=await fn();if(x)return x}catch{}await pause(120)}
 throw Error('timed out waiting for local Chrome');
}
server=http.createServer(async(req,res)=>{
 try{
  requests.push({method:req.method,url:req.url});
  if(req.method!=='GET'){writes.push(req.url);res.writeHead(405);res.end();return}
  const p=new URL(req.url,'http://127.0.0.1').pathname,found=allowed.get(p);
  if(!found){res.writeHead(404);res.end('Not part of offline fixture');return}
  const bytes=await readFile(resolve(cwd,found[0]));
  res.writeHead(200,{'Content-Type':found[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(bytes);
 }catch{res.writeHead(500);res.end('Read failed')}
});
try{
 await new Promise((yes,no)=>server.once('error',no).listen(0,'127.0.0.1',yes));
 const root='http://127.0.0.1:'+server.address().port;
 let binary=process.env.CHROME_BIN||'';
 if(!binary)for(const name of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']){
  try{await access(name);binary=name;break}catch{}
 }
 assert.ok(binary,'Chrome/Chromium required for offline browser tests');
 chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--disable-background-networking','--no-first-run','--no-default-browser-check',
  '--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+join(temp,'profile'),'about:blank'],{stdio:'ignore'});
 const portFile=join(temp,'profile','DevToolsActivePort');
 const debugPort=await poll(async()=>Number((await readFile(portFile,'utf8')).split(String.fromCharCode(10))[0])||null);
 const page=await poll(async()=>{
  const r=await fetch('http://127.0.0.1:'+debugPort+'/json/list');
  const items=await r.json();return items.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
 });
 ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',fail,{once:true})});
 let counter=0;
 const pending=new Map(),network=[];
 ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails?.text||'browser exception');
  if(m.method==='Network.requestWillBeSent')network.push(m.params.request.url);
  const waiter=pending.get(m.id);
  if(waiter){pending.delete(m.id);clearTimeout(waiter.timer);m.error?waiter.reject(Error(JSON.stringify(m.error))):waiter.resolve(m.result)}
 });
 const cdp=(method,params={})=>new Promise((yes,no)=>{
  const id=++counter,timer=setTimeout(()=>{pending.delete(id);no(Error('CDP timeout '+method))},18000);
  pending.set(id,{resolve:yes,reject:no,timer});ws.send(JSON.stringify({id,method,params}));
 });
 async function evaluate(expression){
  const data=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(data.exceptionDetails)throw Error('Chrome script failed: '+data.exceptionDetails.text);
  return data.result.value;
 }
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
 const summary=[];
 for(const width of [320,375,390,430]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
  await cdp('Page.navigate',{url:root+'/museum-device-check.html'});
  await poll(()=>evaluate("document.readyState==='complete'&&!!document.querySelector('#runAuto')"));
  const before=await evaluate(`(()=>({width:innerWidth,docWidth:document.documentElement.scrollWidth,buttonHeight:document.querySelector('#runAuto').getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(document.querySelector('#localPhoto')).fontSize)}))()`);
  assert.ok(before.docWidth<=before.width+2,'horizontal overflow '+JSON.stringify(before));
  assert.ok(before.buttonHeight>=48&&before.fontSize>=16,'inaccessible controls '+JSON.stringify(before));
  await evaluate("document.querySelector('#runAuto').click()");
  await poll(()=>evaluate("document.querySelector('#autoStatus')?.textContent.includes('合格しました')"),18000);
  const output=await evaluate(`(()=>({ok:document.querySelector('#autoStatus').textContent.includes('合格しました'),details:!document.querySelector('#autoDetails').hidden,download:!document.querySelector('#saveReport').disabled}))()`);
  assert.deepEqual(output,{ok:true,details:true,download:true});
  if(width===390){
   // Create a synthetic photo only in this isolated browser. No permission, filesystem or external API.
   await evaluate(`(()=>{const c=document.createElement('canvas');c.width=500;c.height=300;
    const ctx=c.getContext('2d');ctx.fillStyle='#124a78';ctx.fillRect(0,0,500,300);
    return new Promise(ok=>c.toBlob(b=>{const dt=new DataTransfer();
     dt.items.add(new File([b],'synthetic-only.png',{type:'image/png'}));
     const input=document.querySelector('#localPhoto');input.files=dt.files;
     input.dispatchEvent(new Event('change',{bubbles:true}));
     document.querySelector('#tryPhoto').click();ok(true)},'image/png'))})()`);
   await poll(()=>evaluate("document.querySelector('#photoStatus')?.textContent.includes('成功しました')"));
   assert.equal(await evaluate("document.querySelector('#photoPreview').naturalWidth>0"),true);
   // Intercept the local JSON download; inspect the actual report bytes without downloading or uploading.
   const report=await evaluate(`(async()=>{
    const originalUrl=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;
    let reportBlob=null;
    URL.createObjectURL=function(blob){
     if(blob.type==='application/json'){reportBlob=blob;return 'blob:offline-diagnostic-report'}
     return originalUrl.call(URL,blob)
    };
    HTMLAnchorElement.prototype.click=function(){};
    try{
     document.querySelector('#saveReport').click();
     if(!reportBlob)throw Error('report JSON was never generated');
     return JSON.parse(await reportBlob.text());
    }finally{URL.createObjectURL=originalUrl;HTMLAnchorElement.prototype.click=originalClick}
   })()`);
   assert.equal(report.schema,'mio-museum-device-check-v1');
   assert.equal(report.browserTestOnly,true);
   assert.equal(report.serverUploadTested,false);
   assert.equal(report.realAdminLoginTested,false);
   assert.equal(report.synthetic?.ok,true);
   assert.equal(report.photo?.ok,true);
   // Emulate Safari returning null for WebP canvas.toBlob and verify actual
   // Chrome falls back to JPEG without sending the selected photo anywhere.
   const fallback=await evaluate(`(async()=>{
    const proto=HTMLCanvasElement.prototype,original=proto.toBlob;
    let webpAttempts=0;
    proto.toBlob=function(done,type,quality){
     if(type==='image/webp'){webpAttempts++;queueMicrotask(()=>done(null));return}
     return original.call(this,done,type,quality)
    };
    try{
     const file=document.querySelector('#localPhoto').files[0];
     const r=await window.MioMuseumImage.encode(file);
     return {format:r.format,bytes:r.bytes,webpAttempts};
    }finally{proto.toBlob=original}
   })()`);
   assert.equal(fallback.format,'jpeg','Safari WebP failure must fallback to JPEG');
   assert.ok(fallback.bytes>0&&fallback.bytes<=700000);
   assert.ok(fallback.webpAttempts>=1);
   assert.ok(!JSON.stringify(report).includes('synthetic-only.png'),'photo filename leaked into report');
   assert.deepEqual(Object.keys(report).sort(),
     ['schema','screen','synthetic','photo','browserTestOnly','serverUploadTested','realAdminLoginTested'].sort());
   await mkdir('artifacts',{recursive:true});
   await evaluate("document.querySelector('#photoPreview').scrollIntoView({block:'center',behavior:'instant'})");
   const photoShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile('artifacts/mio-offline-mobile-photo-390.png',Buffer.from(photoShot.data,'base64'));
   await evaluate("document.querySelector('#clearPhoto').click()");
   assert.deepEqual(await evaluate(`(()=>({hidden:document.querySelector('#photoPreview').hidden,files:document.querySelector('#localPhoto').files.length}))()`),{hidden:true,files:0});
   await evaluate("window.scrollTo(0,0)");
   const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile('artifacts/mio-offline-mobile-390.png',Buffer.from(shot.data,'base64'));
  }
  summary.push({width,passed:true,photoChecked:width===390});
 }
 // Drive the actual static museum exhibit UI in the same isolated Chrome.
 // Do not visit external video links or load live APIs.
 for(const width of [320,375,390,430]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
  await cdp('Page.navigate',{url:root+'/museum-approved-gallery.html'});
  await poll(()=>evaluate("document.querySelector('#approvedGalleryStatus')?.textContent.includes('件の承認済み作品')"),18000);
  const gallery=await evaluate(`(()=>({
   width:innerWidth,doc:document.documentElement.scrollWidth,
   cards:document.querySelectorAll('.museum-approved-card').length,
   songs:document.querySelectorAll('.museum-approved-card audio[src="/mio-awakening.mp3"]').length,
   videos:[...document.querySelectorAll('.museum-approved-card a[href^="https://"]')].map(a=>({url:a.href,rel:a.rel,target:a.target}))
  }))()`);
  assert.ok(gallery.doc<=gallery.width+2,'approved gallery horizontal overflow '+JSON.stringify(gallery));
  assert.equal(gallery.cards,2,'previously approved works were lost');
  assert.equal(gallery.songs,1,'original memorial music disappeared');
  assert.deepEqual(gallery.videos,[{url:'https://vt.tiktok.com/ZSgFvmy7Q/',rel:'noopener noreferrer',target:'_blank'}]);
  // The audio DOM node must survive search and category changes. The element
  // remains mounted while visible, and is paused exactly when filtered out.
  await evaluate(`(()=>{
   window.__mioMusic=document.querySelector('.museum-approved-card audio');
   window.__pauseCount=0;
   window.__mioMusic.pause=()=>{window.__pauseCount++};
  })()`);
  // New local-only viewer controls must not expose unpublished content or change account state.
  await evaluate("document.querySelector('[data-gallery-kind=\\\"動画\\\"]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.museum-approved-card:not([hidden])').length"),1);
  assert.equal(await evaluate("document.querySelectorAll('.museum-approved-card:not([hidden]) audio').length"),0);
  assert.deepEqual(await evaluate(`(()=>({
   sameNode:window.__mioMusic===document.querySelector('.museum-approved-card audio'),
   paused:window.__pauseCount,
   hidden:window.__mioMusic.closest('.museum-approved-card').hidden,
   cssHidden:getComputedStyle(window.__mioMusic.closest('.museum-approved-card')).display==='none'
  }))()`),{sameNode:true,paused:1,hidden:true,cssHidden:true});
  await evaluate(`(()=>{const i=document.querySelector('#approvedGallerySearch');i.value='存在しない秘密の作品';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.equal(await evaluate("document.querySelectorAll('.museum-approved-card:not([hidden])').length"),0);
  assert.equal(await evaluate("document.querySelector('#approvedGalleryStatus').textContent.includes('一致する公開作品はありません')"),true);
  await evaluate(`(()=>{const i=document.querySelector('#approvedGallerySearch');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-gallery-kind=all]').click()})()`);
  assert.equal(await evaluate("document.querySelectorAll('.museum-approved-card:not([hidden])').length"),2);
  assert.deepEqual(await evaluate(`(()=>({
   sameNode:window.__mioMusic===document.querySelector('.museum-approved-card audio'),
   paused:window.__pauseCount,
   visible:!window.__mioMusic.closest('.museum-approved-card').hidden
  }))()`),{sameNode:true,paused:1,visible:true});
  // Category selection must create a shareable URL; browser back restores
  // the previous filter without replacing or reloading the playing audio node.
  await evaluate("document.querySelector('[data-gallery-kind=\\\"音声・楽曲\\\"]').click()");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('kind')"),'music');
  assert.equal(await evaluate("document.querySelectorAll('.museum-approved-card:not([hidden])').length"),1);
  await evaluate("history.back()");
  await poll(()=>evaluate("document.querySelector('[data-gallery-kind=all]')?.getAttribute('aria-pressed')==='true'"));
  assert.equal(await evaluate("window.__mioMusic===document.querySelector('.museum-approved-card audio')"),true);
  if(width===390){
   // Loading a shareable URL directly must show only approved music.
   await cdp('Page.navigate',{url:root+'/museum-approved-gallery.html?kind=music'});
   await poll(()=>evaluate("document.querySelector('#approvedGalleryStatus')?.textContent.includes('件の承認済み作品')"),18000);
   assert.equal(await evaluate("document.querySelectorAll('.museum-approved-card:not([hidden])').length"),1);
   assert.equal(await evaluate("document.querySelector('[data-gallery-kind=\\\"音声・楽曲\\\"]').getAttribute('aria-pressed')"),'true');
   await cdp('Page.navigate',{url:root+'/museum-approved-gallery.html'});
   await poll(()=>evaluate("document.querySelector('#approvedGalleryStatus')?.textContent.includes('件の承認済み作品')"),18000);
  }
  if(width===390){
   await mkdir('artifacts',{recursive:true});
   const galleryShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile('artifacts/mio-museum-approved-gallery-390.png',Buffer.from(galleryShot.data,'base64'));
  }

  await cdp('Page.navigate',{url:root+'/museum-archive.html?kind=icons'});
  await poll(()=>evaluate("document.querySelector('#archiveStatus')?.textContent.includes('準備中')"),18000);
  const archive=await evaluate(`(()=>({
   width:innerWidth,doc:document.documentElement.scrollWidth,
   items:document.querySelectorAll('.archive-entry').length,
   selected:[...document.querySelectorAll('.archive-filter[aria-pressed="true"]')].map(x=>x.dataset.kind),
   status:document.querySelector('#archiveStatus')?.textContent
  }))()`);
  assert.ok(archive.doc<=archive.width+2,'archive horizontal overflow '+JSON.stringify(archive));
  assert.deepEqual(archive.selected,['icons']);
  assert.equal(archive.items,0,'unverified or private exhibit appeared in staging');
  assert.ok(archive.status.includes('準備中'),'offline exhibit must say that content is not connected');
  if(width===390){
   await mkdir('artifacts',{recursive:true});
   const archiveShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile('artifacts/mio-museum-archive-390.png',Buffer.from(archiveShot.data,'base64'));
  }
  await evaluate("document.querySelector('.archive-filter[data-kind=events]').click()");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('kind')"),'events');
  assert.equal(await evaluate("document.querySelector('.archive-filter[aria-pressed=true]').dataset.kind"),'events');
  await evaluate("history.back()");
  await poll(()=>evaluate("document.querySelector('.archive-filter[aria-pressed=true]')?.dataset.kind==='icons'"));
 }
 // Entire operator workflow is a fictional, disconnected rehearsal: real Chrome clicks.
 for(const width of [320,375,390,430]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
  await cdp('Page.navigate',{url:root+'/mio-admin-rehearsal.html'});
  await poll(()=>evaluate("document.readyState==='complete'&&document.querySelector('#demoPendingCount')?.textContent==='2'"),18000);
  const dims=await evaluate(`(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
   pending:document.querySelector('#demoPendingCount').textContent,
   cards:document.querySelectorAll('#demoPending .entry').length}))()`);
  assert.ok(dims.scroll<=dims.width+2,'operator demo horizontal overflow '+JSON.stringify(dims));
  assert.equal(dims.pending,'2');assert.equal(dims.cards,2);
  if(width===390){
   await evaluate("document.querySelector('#demoPending .entry button').click()");
   assert.equal(await evaluate("document.querySelector('#demoPendingCount').textContent"),'1');
   await evaluate(`(()=>{
    const search=document.querySelector('#demoSearch');search.value='DEMO-01';
    search.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#demoRoster button').click();
    document.querySelector('#demoGrantAmount').value='2';
    document.querySelector('#demoGrant').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoRoster').textContent.includes('残数 5回')"),true);
   assert.equal(await evaluate("document.querySelector('#demoAuditCount').textContent"),'2');
   await evaluate("document.querySelector('#demoGrant').click()");
   assert.equal(await evaluate("document.querySelector('#demoAuditCount').textContent"),'2','repeated operation ID must not grant again');
   await evaluate("document.querySelector('#demoGrantAmount').value='3';document.querySelector('#demoGrant').click()");
   assert.equal(await evaluate("document.querySelector('#demoRoster').textContent.includes('残数 5回')"),true,'same ID/different amount must reject');
   await evaluate("document.querySelector('#demoIncidents .entry button').click()");
   await evaluate("document.querySelector('#demoIncidents .entry button').click()");
   assert.equal(await evaluate("document.querySelector('#demoIncidentCount').textContent"),'0');
   assert.equal(await evaluate("document.querySelector('#demoAuditCount').textContent"),'4');
   await mkdir('artifacts',{recursive:true});
   const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile('artifacts/mio-admin-rehearsal-390.png',Buffer.from(shot.data,'base64'));
   await evaluate("document.querySelector('#demoReset').click()");
   assert.deepEqual(await evaluate(`(()=>({
    pending:document.querySelector('#demoPendingCount').textContent,
    audits:document.querySelector('#demoAuditCount').textContent,
    tickets:document.querySelector('#demoRoster').textContent.includes('残数 3回')
   }))()`),{pending:'2',audits:'0',tickets:true});
   // Rejecting an application must not create a participant. Invalid quantities
   // and non-demo operation IDs must not increment the balance or audit trail.
   await evaluate("document.querySelector('#demoPending .entry:last-child button.secondary').click()");
   assert.equal(await evaluate("document.querySelector('#demoPendingCount').textContent"),'1');
   assert.equal(await evaluate("document.querySelector('#demoRoster').textContent.includes('デモ申請者B')"),false);
   await evaluate("document.querySelector('#demoRoster button').click()");
   for(const bad of ['0','51','1.5','-1']){
    await evaluate(`(()=>{document.querySelector('#demoGrantAmount').value=${JSON.stringify(bad)};document.querySelector('#demoGrant').click()})()`);
    assert.equal(await evaluate("document.querySelector('#demoRoster').textContent.includes('残数 3回')"),true,'invalid quantity changed tickets');
   }
   await evaluate(`(()=>{document.querySelector('#demoGrantAmount').value='2';document.querySelector('#demoOperationId').value='LIVE-OPS-1000';document.querySelector('#demoGrant').click()})()`);
   assert.equal(await evaluate("document.querySelector('#demoRoster').textContent.includes('残数 3回')"),true,'non-demo ID changed tickets');
   assert.equal(await evaluate("document.querySelector('#demoAuditCount').textContent"),'1','only rejection should be audited');
   // Lost-after-commit: source updates once, but the operator only sees an
   // uncertain result. New operation IDs are blocked until the same ID is checked.
   await evaluate(`(()=>{
    document.querySelector('#demoGrantAmount').value='2';
    document.querySelector('#demoOperationId').value='DEMO-OP-LOSS1';
    document.querySelector('#demoDropReply').checked=true;
    document.querySelector('#demoGrant').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoRoster').textContent.includes('残数 5回')"),true);
   assert.equal(await evaluate("document.querySelector('#demoAuditCount').textContent"),'2');
   assert.equal(await evaluate("document.querySelector('#demoVerify').disabled"),false);
   assert.equal(await evaluate("document.querySelector('#demoMessage').textContent.includes('応答途絶')"),true);
   await evaluate("document.querySelector('#demoOperationId').value='DEMO-OP-NEW2';document.querySelector('#demoGrant').click()");
   assert.equal(await evaluate("document.querySelector('#demoAuditCount').textContent"),'2','new operation must be blocked while old result uncertain');
   await evaluate("document.querySelector('#demoVerify').click()");
   assert.equal(await evaluate("document.querySelector('#demoVerify').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoMessage').textContent.includes('再付与していません')"),true);
   assert.equal(await evaluate("document.querySelector('#demoRoster').textContent.includes('残数 5回')"),true);
   await evaluate("document.querySelector('#demoOperationId').value='DEMO-OP-LOSS1';document.querySelector('#demoGrant').click()");
   assert.equal(await evaluate("document.querySelector('#demoAuditCount').textContent"),'2','post-confirmation replay must not double credit');
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelector('#demoRoster').textContent.includes('残数 3回')"),true);
   assert.equal(await evaluate("document.querySelector('#demoVerify').disabled"),true);

  }
 }
 // Browser-only examination of intentionally synthetic GAS files: never upload secrets.
 for(const width of [320,375,390,430]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
  await cdp('Page.navigate',{url:root+'/mio-gas-local-check.html'});
  await poll(()=>evaluate("document.readyState==='complete'&&typeof MioGasLocalCheck?.inspect==='function'"),18000);
  const size=await evaluate(`(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))()`);
  assert.ok(size.scroll<=size.width+2,'local GAS checker horizontal overflow '+JSON.stringify(size));
  if(width===390){
   const pass=await evaluate(`(async()=>{
    const file=new File(['function doPost(e) { return {ok:true}; }'],'Code.gs',{type:'text/plain'});
    const d=new DataTransfer();d.items.add(file);
    document.querySelector('#gasSources').files=d.files;
    document.querySelector('#gasCheck').click();
    for(let i=0;i<150;i++){
     if(!document.querySelector('#gasCheck').disabled)break;
     await new Promise(resolve=>setTimeout(resolve,15));
    }
    return {files:document.querySelector('#gasFiles').textContent,
     ops:document.querySelector('#gasOps').textContent,
     doPost:document.querySelector('#gasPost').textContent,
     canExport:!document.querySelector('#gasExport').disabled,
     status:document.querySelector('#gasStatus').textContent,
     inputEmpty:document.querySelector('#gasSources').value===''};
   })()`);
   assert.equal(pass.files,'1');assert.equal(pass.ops,'0/19');
   assert.equal(pass.doPost,'1');assert.equal(pass.canExport,true);
   assert.equal(pass.inputEmpty,true);
   assert.ok(pass.status.includes('追加の許可ではありません'));
   const blocked=await evaluate(`(async()=>{
    const secret='FAKE-SECRET-EXACTLY-PRIVATE-12345';
    const source='function doPost(e){}'+String.fromCharCode(10)+
     'function doPost(e){}'+String.fromCharCode(10)+
     'function mioAdminOps_(){}'+String.fromCharCode(10)+'// '+secret;
    const dt=new DataTransfer();dt.items.add(new File([source],'PRIVATE_BACKUP_Code.gs',{type:'text/plain'}));
    document.querySelector('#gasSources').files=dt.files;
    document.querySelector('#gasCheck').click();
    for(let i=0;i<150;i++){
     if(!document.querySelector('#gasCheck').disabled)break;
     await new Promise(resolve=>setTimeout(resolve,15));
    }
    const body=document.body.textContent;
    const previous=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
    let reportBlob=null;
    URL.createObjectURL=b=>{reportBlob=b;return 'blob:local-redacted-report'};
    HTMLAnchorElement.prototype.click=function(){};
    try{
     document.querySelector('#gasExport').click();
     const report=JSON.parse(await reportBlob.text());
     return {status:document.querySelector('#gasStatus').textContent,
      posts:document.querySelector('#gasPost').textContent,
      duplicate:document.querySelector('#gasDup').textContent,
      leaked:body.includes(secret)||body.includes('PRIVATE_BACKUP_Code.gs')||
       JSON.stringify(report).includes(secret)||JSON.stringify(report).includes('PRIVATE_BACKUP_Code.gs'),
      exportAllowed:!report.liveAdminWriteAllowed,
      classification:report.classification,
      blocked:report.blockingReasons};
    }finally{URL.createObjectURL=previous;HTMLAnchorElement.prototype.click=click}
   })()`);
   assert.equal(blocked.status.includes('導入停止'),true);
   assert.equal(blocked.posts,'2');assert.equal(blocked.duplicate,'1');
   assert.equal(blocked.leaked,false,'source code or filenames leaked into UI/report');
   assert.equal(blocked.exportAllowed,true);
   assert.equal(blocked.classification,'BLOCKED_REVIEW');
   assert.ok(blocked.blocked.includes('DUPLICATE_FUNCTION_DECLARATIONS'));
   // New source selection must erase the previous report immediately, before
   // the user runs an inspection. A stale "validated" export is unsafe.
   const changedSource=await evaluate(`(()=>{
    const input=document.querySelector('#gasSources'),dt=new DataTransfer();
    dt.items.add(new File(['function doPost(e){}'],'DIFFERENT_Code.gs',{type:'text/plain'}));
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    return {unverified:document.querySelector('#gasStatus').textContent.includes('未検査'),
     exportDisabled:document.querySelector('#gasExport').disabled,
     noOldCount:document.querySelector('#gasPost').textContent==='—',
     newSelection:input.files.length===1};
   })()`);
   assert.deepEqual(changedSource,{unverified:true,exportDisabled:true,noOldCount:true,newSelection:true});
   await evaluate("document.querySelector('#gasClear').click()");
   assert.equal(await evaluate("document.querySelector('#gasExport').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#gasFiles').textContent"),'—');
   const cancelRace=await evaluate(`(async()=>{
    const old=File.prototype.text;
    let release;
    File.prototype.text=function(){return new Promise(resolve=>{release=resolve})};
    try{
     const dt=new DataTransfer();
     dt.items.add(new File(['function doPost(e){}'],'Code.gs',{type:'text/plain'}));
     document.querySelector('#gasSources').files=dt.files;
     document.querySelector('#gasCheck').click();
     if(typeof release!=='function')throw Error('source read never started');
     document.querySelector('#gasClear').click();
     release('function doPost(e){}');
     await new Promise(resolve=>setTimeout(resolve,40));
     return {cleared:document.querySelector('#gasStatus').textContent.includes('消去しました'),
      reportDisabled:document.querySelector('#gasExport').disabled,
      noFileCount:document.querySelector('#gasFiles').textContent==='—',
      inspectEnabled:!document.querySelector('#gasCheck').disabled};
    }finally{File.prototype.text=old}
   })()`);
   assert.deepEqual(cancelRace,{cleared:true,reportDisabled:true,noFileCount:true,inspectEnabled:true},
    'cleared source must not reappear when an old file-read promise later resolves');
   const scanReselection=await evaluate(`(async()=>{
    const fileInput=document.querySelector('#gasSources');
    const checkButton=document.querySelector('#gasCheck');
    const previous=File.prototype.text;
    let done;
    File.prototype.text=function(){return new Promise(resolve=>{done=resolve})};
    const choose=name=>{
     const selection=new DataTransfer();
     selection.items.add(new File(['function doPost(e){}'],name,{type:'text/plain'}));
     fileInput.files=selection.files;
     fileInput.dispatchEvent(new Event('change',{bubbles:true}));
    };
    try{
     choose('FIRST_Code.gs');checkButton.click();
     if(typeof done!=='function')throw Error('first source read was not started');
     choose('SECOND_Code.gs');
     done('function doPost(e){}');
     await new Promise(resolve=>setTimeout(resolve,50));
     return {unverified:document.querySelector('#gasStatus').textContent.includes('未検査'),
      reportDisabled:document.querySelector('#gasExport').disabled,
      emptyCount:document.querySelector('#gasFiles').textContent==='—',
      canInspect:!checkButton.disabled,stillSelected:fileInput.files[0]?.name==='SECOND_Code.gs'};
    }finally{File.prototype.text=previous}
   })()`);
   assert.deepEqual(scanReselection,{unverified:true,reportDisabled:true,emptyCount:true,
    canInspect:true,stillSelected:true},'new source must supersede late results from the old selection');
   // Two LOCAL file sets, same names and bytes. This is not a deployed GAS proof.
   const backupProof=await evaluate(`(async()=>{
    const src=document.querySelector('#gasBackupOriginal');
    const copy=document.querySelector('#gasBackupCopy');
    const button=document.querySelector('#gasBackupCompare');
    const status=document.querySelector('#gasBackupStatus');
    const data='function doPost(e){}'+String.fromCharCode(10)+'// SECRET_FAKE_DO_NOT_EXPORT_900';
    const assign=(el,text)=>{
     const dt=new DataTransfer();
     dt.items.add(new File([text],'Code.gs',{type:'text/plain'}));
     el.files=dt.files;
    };
    const run=async text=>{
     assign(src,data);assign(copy,text);button.click();
     for(let i=0;i<150;i++){
      if(!button.disabled)break;
      await new Promise(done=>setTimeout(done,15));
     }
     return {status:status.textContent,
      originalCleared:src.value==='',backupCleared:copy.value===''};
    };
    const matching=await run(data);
    const different=await run(data.replace('doPost','doNotPost'));
    const leaked=document.body.textContent.includes('SECRET_FAKE_DO_NOT_EXPORT_900');
    document.querySelector('#gasBackupClear').click();
    return {matching,different,leaked,
     cleared:status.textContent.includes('消去しました')};
   })()`);
   assert.equal(backupProof.matching.status.includes('完全一致しました'),true);
   assert.equal(backupProof.different.status.includes('不一致'),true);
   assert.equal(backupProof.matching.originalCleared,true);
   assert.equal(backupProof.matching.backupCleared,true);
   assert.equal(backupProof.different.originalCleared,true);
   assert.equal(backupProof.different.backupCleared,true);
   assert.equal(backupProof.leaked,false,'backup test exposed source content in the UI');
   assert.equal(backupProof.cleared,true);
   // A deployable Apps Script backup is multi-file, not merely Code.gs.
   // Check HTMLService and appsscript.json, unordered files, missing files,
   // duplicate names, and case-only collisions in the actual Chrome UI.
   const multi=await evaluate(`(async()=>{
    const source=document.querySelector('#gasBackupOriginal');
    const copy=document.querySelector('#gasBackupCopy');
    const button=document.querySelector('#gasBackupCompare');
    const status=document.querySelector('#gasBackupStatus');
    const original=[
     ['Code.gs','function doPost(e){}'],
     ['Index.html','<h1>会員向け画面</h1>'],
     ['appsscript.json','{"timeZone":"Asia/Tokyo"}']
    ];
    const fill=(el,rows)=>{
     const dt=new DataTransfer();
     for(const [name,body] of rows)dt.items.add(new File([body],name,{type:'text/plain'}));
     el.files=dt.files;
    };
    const check=async (first,second)=>{
     fill(source,first);fill(copy,second);button.click();
     for(let i=0;i<150;i++){
      if(!button.disabled)break;
      await new Promise(ok=>setTimeout(ok,12));
     }
     return status.textContent;
    };
    const reordered=await check(original,[original[2],original[0],original[1]]);
    const omitted=await check(original,original.slice(0,2));
    const duplicate=await check(original,[original[0],original[0],original[1]]);
    const collision=await check([original[0],['code.GS','different']],original.slice(0,2));
    const altered=await check(original,[original[0],original[1],['appsscript.json','{"timeZone":"UTC"}']]);
    return {reordered,omitted,duplicate,collision,altered};
   })()`);
   assert.ok(multi.reordered.includes('完全一致しました'),'3 files including HTML/JSON must match regardless of order');
   assert.ok(multi.omitted.includes('不一致'),'missing HTML/JSON file must fail');
   assert.ok(multi.duplicate.includes('重複'),'duplicate filename cannot be called a verified backup');
   assert.ok(multi.collision.includes('重複'),'case-insensitive filename collision cannot be accepted');
   assert.ok(multi.altered.includes('不一致'),'a changed appsscript.json must be detected');
   // Selecting a different backup after a valid match must invalidate that
   // verdict. It must never remain labelled "完全一致" for the new files.
   const reselection=await evaluate(`(async()=>{
    const original=document.querySelector('#gasBackupOriginal');
    const backup=document.querySelector('#gasBackupCopy');
    const button=document.querySelector('#gasBackupCompare');
    const status=document.querySelector('#gasBackupStatus');
    const choose=(el,text)=>{
     const files=new DataTransfer();
     files.items.add(new File([text],'Code.gs',{type:'text/plain'}));
     el.files=files.files;
     el.dispatchEvent(new Event('change',{bubbles:true}));
    };
    choose(original,'same');choose(backup,'same');button.click();
    for(let i=0;i<150;i++){
     if(!button.disabled)break;
     await new Promise(resolve=>setTimeout(resolve,15));
    }
    const didMatch=status.textContent.includes('完全一致しました');
    choose(backup,'NEW UNCHECKED FILE');
    return {didMatch,newSelectionUnverified:status.textContent.includes('未照合'),
     falseSuccessRetained:status.textContent.includes('完全一致しました'),
     selectedFiles:backup.files.length};
   })()`);
   assert.deepEqual(reselection,{didMatch:true,newSelectionUnverified:true,
    falseSuccessRetained:false,selectedFiles:1});
   // Cancellation is a privacy property: clearing midway must never display
   // a hash comparison outcome from an old asynchronous file read.
   const backupRace=await evaluate(`(async()=>{
    const source=document.querySelector('#gasBackupOriginal');
    const copy=document.querySelector('#gasBackupCopy');
    const button=document.querySelector('#gasBackupCompare');
    const status=document.querySelector('#gasBackupStatus');
    const previous=File.prototype.arrayBuffer;
    const releases=[];
    File.prototype.arrayBuffer=function(){return new Promise(resolve=>{releases.push(resolve)})};
    const assign=el=>{
     const data=new DataTransfer();
     data.items.add(new File(['function doPost(e){}'],'Code.gs',{type:'text/plain'}));
     el.files=data.files;
    };
    try{
     assign(source);assign(copy);button.click();
     if(releases.length!==2)throw Error('both file reads must begin');
     document.querySelector('#gasBackupClear').click();
     releases.forEach(resolve=>resolve(new Uint8Array([1,2,3]).buffer));
     await new Promise(resolve=>setTimeout(resolve,50));
     return {cleared:status.textContent.includes('消去しました'),
      emptySource:source.value==='',emptyBackup:copy.value==='',
      enabled:!button.disabled};
    }finally{File.prototype.arrayBuffer=previous}
   })()`);
   assert.deepEqual(backupRace,{cleared:true,emptySource:true,emptyBackup:true,enabled:true},
    'a late backup hash must never restore a cleared outcome');
   const backupReselectionRace=await evaluate(`(async()=>{
    const source=document.querySelector('#gasBackupOriginal');
    const copy=document.querySelector('#gasBackupCopy');
    const button=document.querySelector('#gasBackupCompare');
    const previous=File.prototype.arrayBuffer;
    const completes=[];
    File.prototype.arrayBuffer=function(){return new Promise(resolve=>{completes.push(resolve)})};
    const choose=(el,name)=>{
     const files=new DataTransfer();
     files.items.add(new File(['safe sample'],name,{type:'text/plain'}));
     el.files=files.files;
     el.dispatchEvent(new Event('change',{bubbles:true}));
    };
    try{
     choose(source,'Code.gs');choose(copy,'Code.gs');button.click();
     if(completes.length!==2)throw Error('both old hash reads were not started');
     choose(copy,'UPDATED_Code.gs');
     completes.forEach(resolve=>resolve(new Uint8Array([9,8,7]).buffer));
     await new Promise(resolve=>setTimeout(resolve,50));
     const status=document.querySelector('#gasBackupStatus').textContent;
     return {unverified:status.includes('未照合'),noStalePass:!status.includes('完全一致'),
      ready:!button.disabled,newFileSelected:copy.files[0]?.name==='UPDATED_Code.gs'};
    }finally{File.prototype.arrayBuffer=previous}
   })()`);
   assert.deepEqual(backupReselectionRace,{unverified:true,noStalePass:true,ready:true,
    newFileSelected:true},'new backup must supersede late SHA-256 from the old selection');
   await mkdir('artifacts',{recursive:true});
   const proof=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile('artifacts/mio-gas-local-check-390.png',Buffer.from(proof.data,'base64'));
  }
 }
 // The real management landing page remains disconnected; test its three
 // queue placeholders without invoking production switches or Web APIs.
 for(const width of [320,375,390,430]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
  await cdp('Page.navigate',{url:root+'/gacha-web-gate.html'});
  await poll(()=>evaluate("document.readyState==='complete'&&!!document.querySelector('#opsPendingSimpleCount')"),18000);
  const gate=await evaluate(`(()=>({
   viewport:innerWidth,scroll:document.documentElement.scrollWidth,
   queueIds:['opsPendingNewCount','opsPendingIdentityCount','opsPendingSimpleCount']
    .map(id=>document.getElementById(id)?.textContent),
   reloadDisabled:document.getElementById('opsReload').disabled,
   grantDisabled:document.getElementById('opsGrant').disabled,
   unknownText:document.getElementById('opsUnknownState').textContent
  }))()`);
  assert.ok(gate.scroll<=gate.viewport+2,'admin preview horizontal overflow '+JSON.stringify(gate));
  assert.ok(gate.queueIds.every(x=>x&&x.includes('未接続')&&x.includes('0人とは限りません')),
   'a disconnected administrator must never receive a false zero');
  assert.equal(gate.reloadDisabled,true);
  assert.equal(gate.grantDisabled,true);
  assert.ok(gate.unknownText.includes('未分類の登録状態'));
  if(width===390){
   await mkdir('artifacts',{recursive:true});
   const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile('artifacts/mio-management-queue-390.png',Buffer.from(shot.data,'base64'));
  }
 }
 assert.equal(writes.length,0,'no HTTP writes permitted');
 assert.ok(requests.length>=12,'local static fixtures were not exercised');
 assert.ok(requests.every(x=>x.method==='GET'&&!x.url.startsWith('/api/')),'unexpected local server request');
 assert.ok(network.every(x=>x.startsWith(root+'/')||x==='about:blank'||x.startsWith('data:')||x.startsWith('blob:')),
  'unexpected external network request from local diagnostic');
 assert.deepEqual(exceptions,[],'unhandled browser exception');
 console.log('MIO_OFFLINE_MOBILE_CHROME_PASS '+JSON.stringify({summary,networkOnlyLocal:true,writes:0,realPhoneTested:false}));
}finally{
 if(ws&&ws.readyState===WebSocket.OPEN)ws.close();
 if(chrome){chrome.kill('SIGKILL');await pause(300)}
 if(server){server.closeAllConnections();await new Promise(done=>server.close(done))}
 await rm(temp,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
