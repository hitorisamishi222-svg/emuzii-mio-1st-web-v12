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
 ['/museum-curator-preview.html',['museum-curator-preview.html','text/html']],
 ['/museum-curator-preview.css',['museum-curator-preview.css','text/css']],
 ['/museum-curator-preview.js',['museum-curator-preview.js','text/javascript']],
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
 // On shared CI runners Chrome's DevToolsActivePort can appear after 18 seconds.
 // Extend only cold-start readiness; retain normal UI/action poll deadlines.
 const debugPort=await poll(async()=>Number((await readFile(portFile,'utf8')).split(String.fromCharCode(10))[0])||null,45000);
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
   // One-item share links are formed from the *approved static IDs* only.
   await cdp('Page.navigate',{url:root+'/museum-approved-gallery.html?work=mio-awakening-song'});
   await poll(()=>evaluate("document.querySelector('#approvedGalleryStatus')?.textContent.includes('指定された承認済み作品1件')"),18000);
   assert.deepEqual(await evaluate(`(()=>({
    visible:[...document.querySelectorAll('.museum-approved-card:not([hidden])')].map(x=>x.dataset.exhibitId),
    links:[...document.querySelectorAll('.museum-approved-permalink')].map(x=>x.getAttribute('href')),
    focused:!document.querySelector('#approvedGalleryFocus').hidden
   }))()`),{
    visible:['mio-awakening-song'],
    links:['/museum-approved-gallery.html?work=mio-awakening-video',
     '/museum-approved-gallery.html?work=mio-awakening-song'],
    focused:true
   });
   // Navigating to a nonapproved, unknown work ID must never reveal it.
   await cdp('Page.navigate',{url:root+'/museum-approved-gallery.html?work=unapproved-secret-id'});
   await poll(()=>evaluate("document.querySelector('#approvedGalleryFocusText')?.textContent.includes('公開一覧で確認できません')"),18000);
   assert.equal(await evaluate("document.querySelectorAll('.museum-approved-card:not([hidden])').length"),2);
   assert.equal(await evaluate("document.body.textContent.includes('unapproved-secret-id')"),false);
   await evaluate("document.querySelector('#approvedGalleryClear').click()");
   assert.equal(await evaluate("new URLSearchParams(location.search).has('work')"),false);
   assert.equal(await evaluate("document.querySelector('#approvedGalleryFocus').hidden"),true);
   // The music and video category filter must clear any item-only focus.
   await cdp('Page.navigate',{url:root+'/museum-approved-gallery.html?work=mio-awakening-song'});
   await poll(()=>evaluate("document.querySelector('#approvedGalleryStatus')?.textContent.includes('指定された承認済み作品1件')"),18000);
   await evaluate("document.querySelector('[data-gallery-kind=\\\"動画\\\"]').click()");
   assert.equal(await evaluate("new URLSearchParams(location.search).get('kind')"),'video');
   assert.equal(await evaluate("new URLSearchParams(location.search).has('work')"),false);
   assert.equal(await evaluate("document.querySelectorAll('.museum-approved-card:not([hidden])').length"),1);
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
   // Museum-curator rehearsal: only synthetic works, browser-memory edits,
   // with a faithful public-view preview and a reset to the original mock list.
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),3);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   assert.equal(await evaluate("document.querySelector('#demoGalleryUndoOrder').disabled"),true);
   await evaluate("document.querySelector('#demoGallery .gallery-row:nth-child(2) .gallery-actions button:nth-child(2)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child strong').textContent.includes('架空作品B')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryUndoOrder').disabled"),false);
   await evaluate("document.querySelector('#demoGalleryUndoOrder').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child strong').textContent.includes('架空作品A')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryUndoOrder').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第1版')"),true);
   await evaluate("document.querySelector('#demoGallery .gallery-row:nth-child(2) .gallery-actions button:nth-child(2)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row strong').textContent.includes('架空作品B')"),true);
   await evaluate(`(()=>{
    const field=document.querySelector('#demoGallery .gallery-row input[type=text]');
    field.value='架空作品B・展示名変更';
    document.querySelector('#demoGallery .gallery-row .gallery-actions button:first-child').click();
   })()`);
   // A title rename is now safety-sensitive: hidden until its new content
   // receives fresh rights and privacy checks, never inheriting old consent.
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreview').textContent.includes('展示名変更')"),false);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品B')"),false);
   assert.equal(await evaluate("document.querySelector('#demoGalleryUndoOrder').disabled"),true,
    'after an edit, old ordering history must not roll back the curator state');
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:first-child input').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:nth-child(2) input').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(6)').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(5)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .gallery-featured').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreview .gallery-featured').closest('.entry').textContent.includes('展示名変更')"),true);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),3);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .gallery-featured').length"),0);
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row strong').textContent.includes('架空作品A')"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .gallery-featured').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoAuditCount').textContent"),'0');
   assert.equal(await evaluate("document.querySelector('#demoGalleryUndoOrder').disabled"),true);
   // The owner must explicitly review the exact private draft fields.
   assert.equal(await evaluate("document.querySelector('#demoGalleryAdd').disabled"),true);
   await evaluate(`(()=>{
    document.querySelector('#demoGalleryNewTitle').value='有効な架空作品';
    document.querySelector('#demoGalleryNewExternal').value='http://untrusted.example';
    document.querySelector('#demoGalleryNewReview').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGalleryAdd').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryNewPreview').textContent.includes('https')"),true);
   await evaluate(`(()=>{
    document.querySelector('#demoGalleryNewTitle').value='架空作品D・並べ替え検査';
    document.querySelector('#demoGalleryNewCategory').value='ファンアート';
    document.querySelector('#demoGalleryNewRoom').value='gallery';
    document.querySelector('#demoGalleryNewDescription').value='架空の思い出と展示説明';
    document.querySelector('#demoGalleryNewCredit').value='架空の制作者';
    document.querySelector('#demoGalleryNewOccurred').value='2026-11-05';
    document.querySelector('#demoGalleryNewExternal').value='https://example.org/art';
    document.querySelector('#demoGalleryNewReview').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGalleryAdd').disabled"),false);
   assert.equal(await evaluate("document.querySelector('#demoGalleryNewPreview').textContent.includes('架空の制作者')"),true);
   // Even a programmatically changed input must not bypass the reviewed hash.
   await evaluate("document.querySelector('#demoGalleryNewDescription').value='確認後に書き換え'");
   await evaluate("document.querySelector('#demoGalleryAdd').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),3);
   assert.equal(await evaluate("document.querySelector('#demoGalleryAdd').disabled"),true);
   // Filtered owner ordering must never silently move nonmatching works.
   // A fourth gallery work has two different-room works between it and A.
   await evaluate(`(()=>{
    document.querySelector('#demoGalleryNewDescription').value='架空の思い出と展示説明';
    document.querySelector('#demoGalleryNewReview').click();
    document.querySelector('#demoGalleryAdd').click();
    const room=document.querySelector('#demoGalleryRoomFilter');
    room.value='gallery';room.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGalleryAdd').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryNewCredit').value"),'');
   assert.equal(await evaluate("document.querySelector('#demoGalleryNewDescription').value"),'');
   assert.equal(await evaluate("document.querySelector('#demoGalleryNewExternal').value"),'');
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),2);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-description').textContent.includes('架空の思い出と展示説明')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-meta').textContent.includes('架空の制作者')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-meta').textContent.includes('https://example.org/art')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-meta a')"),null,
    'unreviewed external URLs are never rendered as clickable links');
   // Detail edits must survive unrelated re-renders without an accidental
   // save, then apply only after the owner explicitly clicks the edit action.
   await evaluate(`(()=>{
    const d=document.querySelector('#demoGallery .gallery-row:last-child .gallery-description-input');
    d.value='保存前の説明ドラフト';
    d.dispatchEvent(new Event('input',{bubbles:true}));
    const filter=document.querySelector('#demoGalleryRoomFilter');
    filter.value='icons';filter.dispatchEvent(new Event('change',{bubbles:true}));
    filter.value='gallery';filter.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-description-input').value"),'保存前の説明ドラフト');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-description').textContent.includes('架空の思い出と展示説明')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-detail-unsaved').textContent.includes('未保存')"),true);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-cancel-meta').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-description-input').value"),'架空の思い出と展示説明');
   await evaluate(`(()=>{
    const row=document.querySelector('#demoGallery .gallery-row:last-child');
    const d=row.querySelector('.gallery-description-input');
    const c=row.querySelector('.gallery-credit-input');
    d.value='編集後の説明（未公開）';
    c.value='編集後の架空制作者';
    d.dispatchEvent(new Event('input',{bubbles:true}));
    c.dispatchEvent(new Event('input',{bubbles:true}));
    row.querySelector('.gallery-save-meta').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-description').textContent.includes('編集後の説明（未公開）')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-meta').textContent.includes('編集後の架空制作者')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-detail-unsaved').textContent"),'');
   // Full edit contract: type, date and URL are editable but never published
   // before a separate rights/privacy re-review and mock publish.
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-category-select').value"),'ファンアート');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-occurred-input').value"),'2026-11-05');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-external-input').value"),'https://example.org/art');
   await evaluate(`(()=>{
    const row=document.querySelector('#demoGallery .gallery-row:last-child');
    row.querySelector('.gallery-category-select').value='動画';
    row.querySelector('.gallery-occurred-input').value='2026-11-06';
    row.querySelector('.gallery-external-input').value='http://unsafe.example';
    row.querySelector('.gallery-save-meta').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoMessage').textContent.includes('https')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-category-select').value"),'動画',
    'failed save must not replace uncommitted input before explicit cancel');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-meta').textContent.includes('2026-11-05')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-meta').textContent.includes('unsafe.example')"),false);
   await evaluate(`(()=>{
    const row=document.querySelector('#demoGallery .gallery-row:last-child');
    const input=row.querySelector('.gallery-external-input');
    input.value='https://example.org/revised';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const filter=document.querySelector('#demoGalleryRoomFilter');
    filter.value='icons';filter.dispatchEvent(new Event('change',{bubbles:true}));
    filter.value='gallery';filter.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-category-select').value"),'動画');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-occurred-input').value"),'2026-11-06');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-external-input').value"),'https://example.org/revised');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-detail-unsaved').textContent.includes('未保存')"),true);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-save-meta').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-meta').textContent.includes('2026-11-06')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-meta').textContent.includes('https://example.org/revised')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-exhibit-meta a')"),null,
    'unreviewed external URL must remain inert text');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-category-select').value"),'動画');
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreview').textContent.includes('架空作品D')"),false,
    'creating an unreviewed private exhibit never publishes it');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(2)').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(3)').disabled"),true);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(2)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child strong').textContent.includes('架空作品D')"),true);
   await evaluate(`(()=>{
    const room=document.querySelector('#demoGalleryRoomFilter');
    room.value='all';room.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   const filteredOrder=await evaluate("[...document.querySelectorAll('#demoGallery .gallery-row strong')].map(x=>x.textContent)");
   assert.deepEqual(filteredOrder.map(x=>x.match(/架空作品[A-D]/)?.[0]),[
    '架空作品D','架空作品B','架空作品C','架空作品A'
   ],'works from unrelated rooms must keep their original positions');
   await evaluate(`(()=>{
    const room=document.querySelector('#demoGalleryRoomFilter');
    room.value='gallery';room.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(3)').click();
    room.value='all';room.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   const restoredOrder=await evaluate("[...document.querySelectorAll('#demoGallery .gallery-row strong')].map(x=>x.textContent)");
   assert.deepEqual(restoredOrder.map(x=>x.match(/架空作品[A-D]/)?.[0]),[
    '架空作品A','架空作品B','架空作品C','架空作品D'
   ]);
   // Fast first/last actions must operate only within the filtered room
   // while unrelated B and C remain at their exact original positions.
   await evaluate(`(()=>{
    const room=document.querySelector('#demoGalleryRoomFilter');
    room.value='gallery';room.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(8)').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(9)').disabled"),true);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(8)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child strong').textContent.includes('架空作品D')"),true);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(9)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child strong').textContent.includes('架空作品A')"),true);
   await evaluate(`(()=>{
    const room=document.querySelector('#demoGalleryRoomFilter');
    room.value='all';room.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   const edgeOrder=await evaluate("[...document.querySelectorAll('#demoGallery .gallery-row strong')].map(x=>x.textContent)");
   assert.deepEqual(edgeOrder.map(x=>x.match(/架空作品[A-D]/)?.[0]),[
    '架空作品A','架空作品B','架空作品C','架空作品D'
   ]);
   await evaluate(`(()=>{
    const search=document.querySelector('#demoGallerySearch');
    search.value='架空作品A';search.dispatchEvent(new Event('input',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row .gallery-actions button:nth-child(2)').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row .gallery-actions button:nth-child(3)').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row .gallery-actions button:nth-child(8)').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row .gallery-actions button:nth-child(9)').disabled"),true);
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),3);
   // Newly created works never appear in the visitor preview until a mock
   // approval step. Archiving only hides them, with a reversible restore.
   await evaluate(`(()=>{
    document.querySelector('#demoGalleryNewTitle').value='架空作品D・新規下書き';
    document.querySelector('#demoGalleryNewCategory').value='ファンアート';
    document.querySelector('#demoGalleryNewReview').click();
    document.querySelector('#demoGalleryAdd').click();
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),4);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(4)').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(6)').disabled"),true);
   // A rights-only acknowledgement must still leave review and publishing blocked.
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-review-checks input[type=checkbox]:first-child').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(6)').disabled"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   await evaluate("document.querySelectorAll('#demoGallery .gallery-row:last-child .gallery-review-checks input[type=checkbox]')[1].click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(6)').disabled"),false);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(6)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(4)').disabled"),false);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),3);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(7)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),4);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(7)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),3);
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),3);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   assert.equal(await evaluate("document.querySelector('#demoGalleryNewTitle').value"),'');
   // Two distinct mock views: draft edits do not change the published snapshot
   // until review and confirmation; rollback creates a NEW version, not a delete.
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第1版')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryCommit').disabled"),true);
   await evaluate(`(()=>{
     const title=document.querySelector('#demoGallery .gallery-row:first-child input[type=text]');
     title.value='架空作品A・展示を更新';
     document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:first-child').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreview').textContent.includes('展示を更新')"),false,
    'title-only changes must not be displayed before re-review');
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A')"),false,
    'old approval generations must not render stale publication');
   // Unsaved drafts cannot be approved or moved into a publication revision.
   await evaluate("document.querySelector('#demoGalleryReview').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryCommit').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryDifference').textContent.includes('先に下書きを仮保存')"),true);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:first-child input').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:nth-child(2) input').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(6)').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreview').textContent.includes('展示を更新')"),true);
   await evaluate("document.querySelector('#demoGallerySaveDraft').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryDraftStatus').textContent.includes('第2版')"),true);
   await evaluate("document.querySelector('#demoGalleryReview').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryCommit').disabled"),false);
   await evaluate("document.querySelector('#demoGalleryCommit').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('展示を更新')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第2版')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryCommit').disabled"),true);
   await evaluate(`(()=>{
     const title=document.querySelector('#demoGallery .gallery-row:first-child input[type=text]');
     title.value='架空作品A・第3版';
     document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:first-child').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('展示を更新')"),false,
    'another content edit invalidates the previously approved published generation');
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:first-child input').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:nth-child(2) input').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(6)').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
   await evaluate("document.querySelector('#demoGallerySaveDraft').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryDraftStatus').textContent.includes('第3版')"),true);
   await evaluate("document.querySelector('#demoGalleryReview').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryCommit').disabled"),false);
   await evaluate("document.querySelector('#demoGalleryCommit').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第3版')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('第3版')"),true);
   await evaluate("document.querySelector('#demoGalleryRollback').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第4版')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('展示を更新')"),false,
    'restoring an old title must not resurrect expired approval');
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A・第3版')"),false);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   // Takedowns override older published snapshots, including restored revisions.
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(7)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第1版')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A・歌の記憶')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryRollback').disabled"),true);
   // Restore ANY historical version: after two publishes, the owner may
   // select version 1 rather than only the immediately preceding version.
   for(const name of ['架空作品A・履歴2','架空作品A・履歴3']){
    await evaluate(`(()=>{
     const input=document.querySelector('#demoGallery .gallery-row:first-child input[type=text]');
     input.value=${JSON.stringify(name)};
     document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:first-child').click();
    })()`);
    await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:first-child input').click()");
    await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:nth-child(2) input').click()");
    await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(6)').click()");
    await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
    await evaluate("document.querySelector('#demoGallerySaveDraft').click()");
    await evaluate("document.querySelector('#demoGalleryReview').click()");
    assert.equal(await evaluate("document.querySelector('#demoGalleryCommit').disabled"),false);
    await evaluate("document.querySelector('#demoGalleryCommit').click()");
   }
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第3版')"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryHistoryVersion option').length"),2);
   await evaluate(`(()=>{
    const select=document.querySelector('#demoGalleryHistoryVersion');
    select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGalleryRestorePreview').textContent.includes('架空作品A・歌の記憶')"),false,
    'earlier approval generations are not restored after a title edit');
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A・履歴3')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryRollback').disabled"),false);
   await evaluate("document.querySelector('#demoGalleryRollback').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第4版')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A・歌の記憶')"),false,
    'a rolled-back title cannot revive stale content approvals');
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryHistoryVersion option').length"),3);
   // A current hide prevents even a later historical revision from reviving
   // the work. A no-op restore must not create a spurious history revision.
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A')"),false);
   assert.equal(await evaluate("document.querySelector('#demoGalleryRestorePreview').textContent.includes('架空作品A')"),false);
   assert.equal(await evaluate("document.querySelector('#demoGalleryRollback').disabled"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第4版')"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryRollback').disabled"),true);
   // Rights withdrawal is an immediate takedown independent of draft save.
   // Reapproval MUST NOT resurrect an older publication: it gets a new
   // approval generation and needs an explicit newly confirmed publication.
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks .actions button:first-child').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A')"),false);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreview').textContent.includes('架空作品A')"),false);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row:first-child .gallery-review-checks input[type=checkbox]').length"),2);
   await evaluate(`(()=>{
    const check=document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks input[type=checkbox]');
    check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(6)').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreview').textContent.includes('架空作品A')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A')"),false);
   await evaluate("document.querySelector('#demoGallerySaveDraft').click()");
   await evaluate("document.querySelector('#demoGalleryReview').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryCommit').disabled"),false);
   await evaluate("document.querySelector('#demoGalleryCommit').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第2版')"),true);
   // The historical first version had an earlier approval generation; it
   // cannot restore revoked content even though it still records the title.
   assert.equal(await evaluate("document.querySelector('#demoGalleryRestorePreview').textContent.includes('架空作品A')"),false);
   await evaluate("document.querySelector('#demoGalleryRollback').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第3版')"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   // Independent privacy check revocation must also take down a live work.
   await evaluate("document.querySelector('#demoGallery .gallery-row:nth-child(2) .gallery-review-checks .actions button:nth-child(2)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),0);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品B')"),false);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row:nth-child(2) .gallery-review-checks input[type=checkbox]').length"),2);
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   // A reversible hide/archive must still require deliberate publication
   // before reintroducing a work previously included in an old snapshot.
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreview').textContent.includes('架空作品A')"),true);
   await evaluate("document.querySelector('#demoGallerySaveDraft').click()");
   await evaluate("document.querySelector('#demoGalleryReview').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryCommit').disabled"),false);
   await evaluate("document.querySelector('#demoGalleryCommit').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(7)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(7)').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreview').textContent.includes('架空作品A')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished').textContent.includes('架空作品A')"),false);
   await evaluate("document.querySelector('#demoReset').click()");
   // Owner can find a single work or only works awaiting review on a phone.
   await evaluate(`(()=>{
    const input=document.querySelector('#demoGallerySearch');
    input.value='架空作品B';input.dispatchEvent(new Event('input',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGalleryMatchCount').textContent.includes('1件を表示中')"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2,
      'searching curator drafts may not change the published gallery');
   await evaluate(`(()=>{
    document.querySelector('#demoGallerySearch').value='';
    document.querySelector('#demoGallerySearch').dispatchEvent(new Event('input',{bubbles:true}));
    const filter=document.querySelector('#demoGalleryFilter');
    filter.value='hidden';filter.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row').textContent.includes('架空作品C')"),true);
   await evaluate(`(()=>{
    const filter=document.querySelector('#demoGalleryFilter');
    filter.value='review';filter.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),0);
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),3);
   assert.equal(await evaluate("document.querySelector('#demoGallerySearch').value"),'');
   assert.equal(await evaluate("document.querySelector('#demoGalleryFilter').value"),'all');
   // A curator may arrange works into the museum's existing gallery rooms.
   // The preview room filter changes ONLY the view, not saved publications.
   await evaluate(`(()=>{
    const select=document.querySelector('#demoGalleryRoomFilter');
    select.value='icons';select.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row strong').textContent.includes('架空作品B')"),true);
   await evaluate(`(()=>{
    const select=document.querySelector('#demoGalleryPreviewRoom');
    select.value='icons';select.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),1);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   // Reassign a work to a different room: draft changes immediately, but
   // the published icon exhibition must stay on its previous version.
   await evaluate(`(()=>{
    const select=document.querySelector('#demoGallery .gallery-row .gallery-room-select');
    select.value='events';select.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),0);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),0);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   await evaluate(`(()=>{
    const select=document.querySelector('#demoGalleryPreviewRoom');
    select.value='events';select.dispatchEvent(new Event('change',{bubbles:true}));
    const filter=document.querySelector('#demoGalleryRoomFilter');
    filter.value='events';filter.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),1);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),1);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),0);
   assert.equal(await evaluate("document.querySelector('#demoGallerySaveDraft').disabled"),false);
   await evaluate("document.querySelector('#demoGallerySaveDraft').click()");
   await evaluate("document.querySelector('#demoGalleryReview').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryCommit').disabled"),false);
   await evaluate("document.querySelector('#demoGalleryCommit').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished .gallery-room-label').textContent.includes('イベントの記録')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第2版')"),true);
   // Restoring the original version relocates the work to the icon room and
   // never deletes the newer draft or a previous publication history record.
   await evaluate("document.querySelector('#demoGalleryRollback').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),0);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublishedStatus').textContent.includes('第3版')"),true);
   await evaluate(`(()=>{
    const select=document.querySelector('#demoGalleryPreviewRoom');
    select.value='icons';select.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGalleryPublished .gallery-room-label').textContent.includes('歴代アイコン館')"),true);
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelector('#demoGalleryRoomFilter').value"),'all');
   assert.equal(await evaluate("document.querySelector('#demoGalleryPreviewRoom').value"),'all');
   assert.equal(await evaluate("document.querySelector('#demoGalleryNewRoom').value"),'gallery');
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   // New exhibits can be prepared for an archive room without publishing.
   await evaluate(`(()=>{
    document.querySelector('#demoGalleryNewTitle').value='架空のイベント思い出';
    document.querySelector('#demoGalleryNewRoom').value='events';
    document.querySelector('#demoGalleryNewReview').click();
    document.querySelector('#demoGalleryAdd').click();
   })()`);
   assert.equal(await evaluate("document.querySelectorAll('#demoGallery .gallery-row').length"),4);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:last-child .gallery-room-select').value"),'events');
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   await evaluate("document.querySelector('#demoReset').click()");
   // Title-only changes previously bypassed rights review. A typed unsaved
   // title must survive render filters, and must not affect public snapshots.
   await evaluate(`(()=>{
    const row=document.querySelector('#demoGallery .gallery-row:first-child');
    const title=row.querySelector('[id^=demoGalleryTitle]');
    title.value='架空作品A・未保存の新題名';
    title.dispatchEvent(new Event('input',{bubbles:true}));
    const filter=document.querySelector('#demoGalleryRoomFilter');
    filter.value='icons';filter.dispatchEvent(new Event('change',{bubbles:true}));
    filter.value='all';filter.dispatchEvent(new Event('change',{bubbles:true}));
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child [id^=demoGalleryTitle]').value"),'架空作品A・未保存の新題名');
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-detail-unsaved').textContent.includes('未保存')"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-cancel-meta').click()");
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child [id^=demoGalleryTitle]').value"),'架空作品A・歌の記憶');
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   // An unchanged save is not a takedown.
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-save-meta').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   // A title shortcut now uses the same atomic details save, revoking old
   // reviews and the old snapshot's epoch, never merely replacing a label.
   await evaluate(`(()=>{
    const row=document.querySelector('#demoGallery .gallery-row:first-child');
    const title=row.querySelector('[id^=demoGalleryTitle]');
    title.value='架空作品A・改題';
    title.dispatchEvent(new Event('input',{bubbles:true}));
    row.querySelector('.gallery-actions button:first-child').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child strong').textContent.includes('架空作品A・改題')"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),1);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child').textContent.includes('公開確認待ち')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').disabled"),true);
   // Re-review does not revive stale historical publication automatically.
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:first-child input').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-review-checks label:nth-child(2) input').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(6)').click()");
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-actions button:nth-child(4)').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1,
    'renamed reapproved work must not revive the old published snapshot');
   // Validation is atomic: a valid new title cannot slip through alongside
   // invalid description; neither live metadata nor moderation changes.
   await evaluate(`(()=>{
    const row=document.querySelector('#demoGallery .gallery-row:first-child');
    row.querySelector('[id^=demoGalleryTitle]').value='架空作品A・不正編集';
    row.querySelector('.gallery-description-input').value='x'.repeat(2001);
    row.querySelector('.gallery-save-meta').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child strong').textContent.includes('架空作品A・改題')"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),2);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   // Cancel invalid input; then apply name/description/credit together.
   await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-cancel-meta').click()");
   await evaluate(`(()=>{
    const row=document.querySelector('#demoGallery .gallery-row:first-child');
    row.querySelector('[id^=demoGalleryTitle]').value='架空作品A・一括編集';
    row.querySelector('.gallery-description-input').value='展示説明の改訂';
    row.querySelector('.gallery-credit-input').value='架空の制作者名';
    row.querySelector('.gallery-save-meta').click();
   })()`);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child strong').textContent.includes('架空作品A・一括編集')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-exhibit-description').textContent.includes('展示説明の改訂')"),true);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child .gallery-exhibit-meta').textContent.includes('架空の制作者名')"),true);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPreview .entry').length"),1);
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),1);
   await evaluate("document.querySelector('#demoReset').click()");
   assert.equal(await evaluate("document.querySelectorAll('#demoGalleryPublished .entry').length"),2);
   assert.equal(await evaluate("document.querySelector('#demoGallery .gallery-row:first-child [id^=demoGalleryTitle]').value"),'架空作品A・歌の記憶');

  }
 }
 // Render the actual new museum gallery section and its real CSS in an
 // inert data: fixture. No scripts, external image requests, live API or real DB.
 // This is a layout smoke, NOT a full production browser/URL test.
 const museumHtml=await readFile(resolve(cwd,'museum.html'),'utf8');
 const museumCss=await readFile(resolve(cwd,'museum.css'),'utf8');
 const galleryStart=museumHtml.indexOf('<section class="museum-section museum-gallery-first"');
 const galleryEnd=museumHtml.indexOf('<section class="museum-section" id="mioAwakening"',galleryStart);
 assert.ok(galleryStart>=0&&galleryEnd>galleryStart,'missing museum gallery section for responsive check');
 const galleryFixture='<!doctype html><html lang="ja"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<style>'+museumCss+'</style></head><body class="museum"><main>'+
  museumHtml.slice(galleryStart,galleryEnd)+'</main></body></html>';
 const fixtureUrl='data:text/html;charset=utf-8,'+encodeURIComponent(galleryFixture);
 for(const width of [320,375,390,430]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
  await cdp('Page.navigate',{url:fixtureUrl});
  await poll(()=>evaluate("document.readyState==='complete'&&document.querySelectorAll('.museum-showcase-item').length===2"));
  const sizes=await evaluate(`(()=>({
   viewport:innerWidth,scroll:document.documentElement.scrollWidth,
   highlighted:document.querySelectorAll('.museum-showcase-item').length,
   columns:getComputedStyle(document.querySelector('.museum-showcase-grid')).gridTemplateColumns,
   cardMinHeight:Math.min(...[...document.querySelectorAll('.museum-showcase-item')].map(el=>el.getBoundingClientRect().height)),
   visibleTitle:!!document.querySelector('.museum-showcase-heading h3')?.textContent.includes('今、楽しめる'),
   ctas:[...document.querySelectorAll('.museum-showcase-item')].map(el=>el.getAttribute('href'))
  }))()`);
  assert.ok(sizes.scroll<=sizes.viewport+2,'museum showcase horizontal overflow '+JSON.stringify(sizes));
  assert.equal(sizes.highlighted,2);
  assert.ok(sizes.cardMinHeight>=100,'showcase card became too small '+JSON.stringify(sizes));
  assert.equal(sizes.visibleTitle,true);
  assert.deepEqual(sizes.ctas,[
   '/museum-approved-gallery.html?kind=music',
   '/museum-approved-gallery.html?kind=video'
  ]);
  if(width===390){
   await mkdir('artifacts',{recursive:true});
   const picture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile('artifacts/mio-museum-showcase-390.png',Buffer.from(picture.data,'base64'));
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
 // Exercise the separately scoped MIO gallery-editor rehearsal on real
 // mobile Chromium; only fictional artwork and browser memory may change.
 for(const width of [320,390]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
  await cdp('Page.navigate',{url:root+'/museum-curator-preview.html'});
  await poll(()=>evaluate("document.querySelectorAll('#workList .curator-entry').length===3"),18000);
  const state=await evaluate("(()=>({width:innerWidth,doc:document.documentElement.scrollWidth,works:document.querySelectorAll('#workList .curator-entry').length,publicCards:document.querySelectorAll('#visitorPreview .curator-public-card').length}))()");
  assert.ok(state.doc<=state.width+2,'curator preview overflow '+JSON.stringify(state));
  assert.equal(state.works,3);
  assert.equal(state.publicCards,2);

  const roomPreview=await evaluate(`(()=>{
   const room=document.querySelector('#visitorRoom');
   const count=()=>document.querySelectorAll('#visitorPreview .curator-public-card').length;
   const change=value=>{room.value=value;room.dispatchEvent(new Event('change',{bubbles:true}));return count()};
   const icons=change('icons'),moments=change('moments'),events=change('events');
   const gallery=change('gallery'),all=change('all');
   const editor=document.querySelector('#filterRoom');
   editor.value='moments';editor.dispatchEvent(new Event('change',{bubbles:true}));
   const editorCount=document.querySelectorAll('#workList .curator-entry').length;
   const visitorUnaffected=count();
   editor.value='all';editor.dispatchEvent(new Event('change',{bubbles:true}));
   return {icons,moments,events,gallery,all,editorCount,visitorUnaffected,
     status:document.querySelector('#visitorCount').textContent};
  })()`);
  assert.deepEqual({icons:roomPreview.icons,moments:roomPreview.moments,events:roomPreview.events,
    gallery:roomPreview.gallery,all:roomPreview.all,editorCount:roomPreview.editorCount,
    visitorUnaffected:roomPreview.visitorUnaffected},
    {icons:1,moments:0,events:0,gallery:1,all:2,editorCount:1,visitorUnaffected:2},
    'visitor room selection must be independent of draft editor filters');
  assert.ok(roomPreview.status.includes('全展示 2件'));

  if(width===390){
   const draftRecovery=await evaluate(`(()=>{
    const cards=()=>[...document.querySelectorAll('#workList .curator-entry')];
    cards()[0].querySelector('button').click();
    const title=document.querySelector('#workTitle');
    const message=document.querySelector('#draftRecoveryStatus');
    const verify=document.querySelector('#verifyDemoDraft');
    const reload=document.querySelector('#reloadDemoDraft');
    title.value='架空の記念曲・仮保存確認';
    title.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#saveWork').click();
    const saved=verify.disabled===false&&reload.disabled===false&&
     message.textContent.includes('仮保存しました');
    verify.click();
    const verified=message.textContent.includes('照合OK')&&
     message.textContent.includes('実DBには保存していません');
    title.value='未保存の説明を書き換え途中';
    title.dispatchEvent(new Event('input',{bubbles:true}));
    verify.click();
    const dirtyBlocked=message.textContent.includes('未保存の入力があります');
    reload.click();
    const warning=document.querySelector('#pendingFormSwitch');
    const warningShown=!warning.hidden&&title.value==='未保存の説明を書き換え途中';
    document.querySelector('#cancelFormSwitch').click();
    const cancelKept=warning.hidden&&title.value==='未保存の説明を書き換え途中';
    reload.click();
    document.querySelector('#discardFormSwitch').click();
    const restored=warning.hidden&&title.value==='架空の記念曲・仮保存確認';
    verify.click();
    const reverified=message.textContent.includes('照合OK');
    document.querySelector('#resetDemo').click();
    const reset=cards().length===3&&title.value===''&&verify.disabled&&reload.disabled;
    return {saved,verified,dirtyBlocked,warningShown,cancelKept,restored,reverified,reset};
   })()`);
   assert.deepEqual(draftRecovery,{saved:true,verified:true,dirtyBlocked:true,
    warningShown:true,cancelKept:true,restored:true,reverified:true,reset:true},
    'fictional draft receipt must verify, block dirty reload, and not survive reset');
  }
  if(width===390){
   // A visitor-friendly curator must not silently lose typed details when
   // changing the selected exhibit or resetting the fictional workspace.
   const switching=await evaluate(`(()=>{
    const cards=()=>[...document.querySelectorAll('#workList .curator-entry')];
    const editAt=n=>cards()[n].querySelector('button').click();
    const title=document.querySelector('#workTitle');
    const warning=document.querySelector('#pendingFormSwitch');
    editAt(0);
    title.value='未保存の作品タイトル';title.dispatchEvent(new Event('input',{bubbles:true}));
    editAt(1);
    const blocked=!warning.hidden&&title.value==='未保存の作品タイトル';
    document.querySelector('#cancelFormSwitch').click();
    const cancelled=warning.hidden&&title.value==='未保存の作品タイトル';
    editAt(1);document.querySelector('#discardFormSwitch').click();
    const switched=warning.hidden&&title.value==='架空の歴代アイコン';
    title.value='編集中の2作品目';title.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#newWork').click();
    const newBlocked=!warning.hidden&&title.value==='編集中の2作品目';
    document.querySelector('#discardFormSwitch').click();
    const newBlank=title.value===''&&!document.querySelector('.curator-entry.is-selected');
    title.value='未保存の新規作品';title.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#resetDemo').click();
    const resetBlocked=!warning.hidden&&title.value==='未保存の新規作品';
    document.querySelector('#cancelFormSwitch').click();
    const resetCancelled=warning.hidden&&title.value==='未保存の新規作品';
    document.querySelector('#resetDemo').click();
    document.querySelector('#discardFormSwitch').click();
    const reset=warning.hidden&&title.value===''&&cards().length===3;
    return {blocked,cancelled,switched,newBlocked,newBlank,resetBlocked,resetCancelled,reset};
   })()`);
   assert.deepEqual(switching,{blocked:true,cancelled:true,switched:true,newBlocked:true,
    newBlank:true,resetBlocked:true,resetCancelled:true,reset:true},
    'unsaved curator fields must require explicit discard before choosing or reset');
   const behavior=await evaluate('(()=>{const cards=()=>[...document.querySelectorAll("#workList .curator-entry")];const actions=()=>[...document.querySelectorAll(".curator-entry.is-selected button")];const press=label=>{const b=actions().find(x=>x.textContent.includes(label));if(!b)throw Error("Missing action "+label);b.click()};cards()[0].querySelector("button").click();const title=document.querySelector("#workTitle");title.value="架空の記念曲・編集後";title.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#saveWork").click();if(!cards()[0].textContent.includes("確認待ち・非公開"))throw Error("changed work was not unpublished");for(const id of ["rightsOk","privacyOk","contentOk"]){const input=document.getElementById(id);input.checked=true;input.dispatchEvent(new Event("change",{bubbles:true}))}if(document.querySelector("#approveWork").disabled)throw Error("mock approval still blocked");document.querySelector("#approveWork").click();press("公開予定にする");document.querySelector("#reviewPublish").click();if(document.querySelector("#simulatePublish").disabled)throw Error("review gate did not unlock");document.querySelector("#simulatePublish").click();const published=document.querySelector("#visitorPreview").textContent.includes("架空の記念曲・編集後");press("公開予定を解除");const revoked=!document.querySelector("#visitorPreview").textContent.includes("架空の記念曲・編集後");return{published,revoked,works:cards().length}})()');
   assert.deepEqual(behavior,{published:true,revoked:true,works:3},
    'publish and immediate revoke must remain fictional and safe');
   const recovery=await evaluate(`(()=>{
    const cards=()=>[...document.querySelectorAll('#workList .curator-entry')];
    const ids=()=>cards().map(x=>x.querySelector('strong').textContent);
    const original=ids();
    const down=[...cards()[0].querySelectorAll('button')].find(x=>x.textContent.includes('下へ'));
    down.click();
    const moved=JSON.stringify(ids())!==JSON.stringify(original);
    document.querySelector('#undoOrder').click();
    const undone=JSON.stringify(ids())===JSON.stringify(original);
    const savedTitle=document.querySelector('#workTitle').value;
    const title=document.querySelector('#workTitle');
    title.value='未保存の入力';title.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#reviewPublish').click();
    const dirtyBlocked=document.querySelector('#simulatePublish').disabled;
    title.value=savedTitle;title.dispatchEvent(new Event('input',{bubbles:true}));
    const dropdown=document.querySelector('#historyVersion');
    dropdown.value='1';dropdown.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#reviewRestore').click();
    const canRestore=!document.querySelector('#restoreHistory').disabled;
    document.querySelector('#restoreHistory').click();
    const text=document.querySelector('#visitorPreview').textContent;
    return {moved,undone,dirtyBlocked,canRestore,noRevivedWork:!text.includes('架空の記念曲・編集後'),
      preservedAllowedWork:text.includes('架空の歴代アイコン')};
   })()`);
   assert.deepEqual(recovery,{moved:true,undone:true,dirtyBlocked:true,canRestore:true,
    noRevivedWork:true,preservedAllowedWork:true},
    'history restore must exclude revoked exhibits and undo must only change order');
   await mkdir('artifacts',{recursive:true});
   const frame=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile('artifacts/mio-offline-mobile-curator-390.png',Buffer.from(frame.data,'base64'));
  }
 }
 // Real main operator markup, but ALL operator inputs are inside a native
 // disabled fieldset. Browser CSP must deny even a forged legacy API fetch.
 for(const width of [320,375,390,430]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
  await cdp('Page.navigate',{url:root+'/gacha-web-gate.html'});
  await poll(()=>evaluate("document.readyState==='complete'&&!!document.querySelector('#museumOpsPreviewLock')"),18000);
  const gate=await evaluate(`(()=>({
   viewport:innerWidth,scroll:document.documentElement.scrollWidth,
   locked:document.getElementById('museumOpsPreviewLock').disabled,
   count:document.getElementById('opsCount').textContent,
   bell:document.getElementById('opsBell').textContent,
   quickDisabled:document.getElementById('opsQuickGrant').matches(':disabled'),
   reloadDisabled:document.getElementById('opsReload').matches(':disabled'),
   grantDisabled:document.getElementById('opsGrant').matches(':disabled'),
   incidentDisabled:document.getElementById('incidentPreviewRefresh').disabled,
   csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||'',
   rehearsal:!!document.querySelector('a[href="/mio-admin-rehearsal.html"]')
  }))()`);
  assert.ok(gate.scroll<=gate.viewport+2,'integrated admin horizontal overflow '+JSON.stringify(gate));
  assert.equal(gate.locked,true,'main operator controls must be disabled in Preview');
  assert.equal(gate.count,'未接続');
  assert.ok(gate.bell.includes('管理者認証待ち'));
  assert.equal(gate.quickDisabled,true);
  assert.equal(gate.reloadDisabled,true);
  assert.equal(gate.grantDisabled,true);
  assert.equal(gate.incidentDisabled,true);
  assert.equal(gate.rehearsal,true);
  assert.equal(gate.csp,"connect-src 'none'; form-action 'none'");
  if(width===390){
   const blocked=await evaluate(`(async()=>{
    try{
     await fetch('/api/gacha-web-gate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
     return false;
    }catch{return true}
   })()`);
   assert.equal(blocked,true,'CSP must reject the legacy gate request before local server');
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
