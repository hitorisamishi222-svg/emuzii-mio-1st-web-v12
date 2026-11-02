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
