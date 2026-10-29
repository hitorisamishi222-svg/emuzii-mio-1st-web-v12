// Real Chromium museum smoke test: local mocked owner account; no real API calls.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,extname} from 'node:path';
import http from 'node:http';

// No live writes: browser fixtures are served only on localhost.
const remoteOrigin='';
const fixtureId='aabbccdd-1234-4000-8000-112233445566';
const fixtureItems=[
 {id:fixtureId,kind:'icons',title:'翠央 初期アイコン',description:'最初の展示',credit:'制作確認済',occurredOn:'2026-10-25',imageUrl:'/assets/mio-bg-princess.jpg',externalUrl:'',status:'draft',revision:0},
 {id:'bbccddaa-1234-4000-8000-112233445566',kind:'moments',title:'翠央 思い出',description:'公開済みの思い出',credit:'',occurredOn:'2026-10-26',imageUrl:'/assets/mio-bg-princess.jpg',externalUrl:'',status:'published',revision:1},
 {id:'ccddaabb-1234-4000-8000-112233445566',kind:'events',title:'イベントの記録',description:'非公開の記録',credit:'',occurredOn:'2026-10-27',imageUrl:'',externalUrl:'',status:'trash',revision:2}
];
const browserWrites=[];
const adminCookieChecks=[];
const publicCookieChecks=[];
const cwd=process.cwd();
const tmp=await mkdtemp(join(tmpdir(),'mio-gacha-browser-'));
const browsers=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'];
let chrome,server,socket;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,timeout=20000,label='condition'){
  const end=Date.now()+timeout;
  while(Date.now()<end){try{const result=await fn();if(result)return result}catch{}await pause(140)}
  throw Error('Timed out waiting for '+label);
}
async function getJson(url){const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
const mime={'.webp':'image/webp','.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
 '.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'};
server=http.createServer(async(req,res)=>{
  try{
    const requestUrl=new URL(req.url,'http://127.0.0.1');
    const p=decodeURIComponent(requestUrl.pathname);
    if(req.method!=='GET'){
      browserWrites.push(p);
      res.writeHead(405);res.end('No writes in museum test');return;
    }
    if(p==='/api/gallery/museum/exhibits'){
      const auth=String(req.headers.cookie||'');
      const valid=auth.includes('mio_gallery_session=local-session')&&auth.includes('mio_gallery_device=local-device');
      adminCookieChecks.push(valid);
      if(!valid){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,code:'TEST_COOKIE_MISSING'}));return;}
      const data={ok:true,authorized:true,editable:true,publishEnabled:true,imageUploadEnabled:true,items:fixtureItems};
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;
    }
    if(p==='/api/museum/exhibits'){
      publicCookieChecks.push(Boolean(req.headers.cookie));
      const items=fixtureItems.filter(x=>x.status==='published').map(({id,status,revision,...publicItem})=>publicItem);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({ok:true,open:true,items}));return;
    }
    if(p==='/api/announcements'){
      const items=[
       {id:'a',title:'公開のお知らせ',body:'開催情報のご案内',published:true,updatedAt:'2026-10-29T00:00:00Z'},
       {id:'b',title:'下書き秘密のお知らせ',body:'非公開',published:false,updatedAt:'2026-10-29T00:00:00Z'}
      ];
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,items}));return;
    }
    if(p.startsWith('/api/')){res.writeHead(404);res.end('No live API');return;}
    const file=resolve(cwd,p.replace(/^\/+/,'')||'index.html');
    if(!file.startsWith(cwd+sep))throw Error('path traversal');
    const data=await readFile(file);
    // Local fixture mirrors the actual HttpOnly cookie path without relaxing the production code.
    const headers={'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'};
    if(p==='/museum-curate.html')headers['Set-Cookie']=[
      'mio_gallery_session=local-session; HttpOnly; SameSite=Strict; Path=/api/gallery',
      'mio_gallery_device=local-device; HttpOnly; SameSite=Strict; Path=/api/gallery'
    ];
    res.writeHead(200,headers);
    res.end(data);
  }catch{res.writeHead(404);res.end('Not found')}
});
try{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const port=server.address().port;
  let binary=process.env.CHROME_BIN||null;
  if(!binary)for(const path of browsers){try{await access(path);binary=path;break}catch{}}
  assert.ok(binary,'Chromium/Chrome is required for browser smoke test');
  chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
    '--disable-background-networking','--no-first-run','--no-default-browser-check',
    '--remote-allow-origins=*','--remote-debugging-port=0',
    '--user-data-dir='+join(tmp,'profile'),'about:blank'],{stdio:'ignore'});
  const activePort=join(tmp,'profile','DevToolsActivePort');
  const cdpPort=await poll(async()=>{
    const bytes=await readFile(activePort,'utf8');return Number(bytes.split('\n')[0])||null
  },20000,'Chrome debugging port');
  const target=await poll(async()=>{
    const tabs=await getJson('http://127.0.0.1:'+cdpPort+'/json/list');
    return tabs.find(x=>x.type==='page'&&x.webSocketDebuggerUrl)
  },10000,'Chrome tab');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  const waiting=new Map();let nextId=0;const requests=[];
  const browserExceptions=[];
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    if(msg.method==='Runtime.exceptionThrown')
      browserExceptions.push(msg.params.exceptionDetails?.exception?.description||msg.params.exceptionDetails?.text||'Browser exception');
  });
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    if(msg.method==='Network.requestWillBeSent')requests.push(msg.params.request.url);
    const pending=waiting.get(msg.id);
    if(pending){waiting.delete(msg.id);clearTimeout(pending.timer);
      if(msg.error)pending.reject(Error(JSON.stringify(msg.error)));
      else pending.resolve(msg.result)}
  });
  function cdp(method,params={}){
    return new Promise((resolve,reject)=>{
      const id=++nextId;
      const timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP '+method+' timed out'))},20000);
      waiting.set(id,{resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params}));
    });
  }
  async function evaluate(expression){
    const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error('Browser JS exception: '+r.exceptionDetails.text);
    return r.result.value;
  }
  async function screenshot(name){
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await mkdir('artifacts',{recursive:true});
    const prefix=remoteOrigin?'remote-':'local-';
    await writeFile(join('artifacts',prefix+name),Buffer.from(shot.data,'base64'));
  }
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  const root='http://127.0.0.1:'+port;
  async function navigate(path){
    await cdp('Page.navigate',{url:root+path});
    await poll(()=>evaluate("document.readyState==='complete'&&location.pathname==="+JSON.stringify(path.split('?')[0])),14000,'museum page '+path);
  }
  const seen=[];
  for(const width of [320,375,390,430]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
    await navigate('/museum-curate.html');
    await poll(()=>evaluate("document.querySelector('#editor')?.hidden===false"),12000,'owner fixture')
      .catch(async e=>{
        const state=await evaluate("(()=>({path:location.pathname,ready:document.readyState,auth:document.querySelector('#authStatus')?.textContent,unavailable:document.querySelector('#unavailable')?.hidden,editor:document.querySelector('#editor')?.hidden,buttons:!!document.querySelector('#save')}))()");
        throw Error(e.message+'; state='+JSON.stringify(state)+'; exceptions='+JSON.stringify(browserExceptions.slice(0,3)));
      });
    const state=await evaluate("(()=>{const b=document.querySelector('#save').getBoundingClientRect();return {width:innerWidth,doc:document.documentElement.scrollWidth,buttonWidth:b.width,buttonHeight:b.height,enabled:!document.querySelector('#save').disabled,detailsClosed:['optionalFields','extraLinks','dangerActions','assetAuditPanel'].every(id=>!document.getElementById(id).open),fontSize:parseFloat(getComputedStyle(document.querySelector('#title')).fontSize)}})()");
    assert.ok(state.doc<=width+2,'horizontal overflow at '+width+': '+JSON.stringify(state));
    assert.ok(state.enabled&&state.buttonWidth>=100&&state.buttonHeight>=45,'save button usability at '+width);
    assert.equal(state.detailsClosed,true,'advanced controls should start collapsed');
    assert.ok(state.fontSize>=16,'iOS zoom risk at '+width);
    seen.push(state);
    if(width===320||width===390)await screenshot('museum-curate-'+width+'.png');
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await navigate('/museum-curate.html');
  await poll(()=>evaluate("document.querySelector('#editor')?.hidden===false"),15000,'owner controls');
  await evaluate("(()=>{const s=document.querySelector('#selectExhibit');s.value='"+fixtureId+"';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.equal(await evaluate("document.querySelector('#title').value"),'翠央 初期アイコン');
  // The saved image is lazily loaded; scroll it into view before checking decode.
  await evaluate("document.querySelector('#savedImagePreview').scrollIntoView({block:'center',behavior:'instant'})");
  await poll(()=>evaluate("!document.querySelector('#savedImagePreview').hidden&&document.querySelector('#savedImagePreviewImg').naturalWidth>0"),15000,'saved image preview');
  await evaluate("(()=>{const search=document.querySelector('#exhibitSearch');search.value='翠央';search.dispatchEvent(new Event('input',{bubbles:true}));const filter=document.querySelector('#exhibitFilter');filter.value='published';filter.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.equal(await evaluate("document.querySelector('#selectExhibit').value"),fixtureId,'filter lost selected item');
  await evaluate("(()=>{window.confirm=()=>false;const title=document.querySelector('#title');title.value='未保存';title.dispatchEvent(new Event('input',{bubbles:true}));const choice=document.querySelector('#selectExhibit');choice.value='bbccddaa-1234-4000-8000-112233445566';choice.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.equal(await evaluate("document.querySelector('#selectExhibit').value"),fixtureId,'cancelled selection lost work');
  await evaluate("(()=>{document.querySelector('#rightsConfirmed').checked=true;document.querySelector('#privacyConfirmed').checked=true;document.querySelector('#publish').click()})()");
  assert.equal(await evaluate("document.querySelector('#saveStatus').textContent.includes('未保存')"),true,'uncommitted publication was not blocked');
  const chosen=await evaluate("(async()=>{const blob=await(await fetch('/assets/mio-bg-princess.jpg')).blob();const dt=new DataTransfer();dt.items.add(new File([blob],'icon.jpg',{type:'image/jpeg'}));const pick=document.querySelector('#uploadImage');pick.files=dt.files;pick.dispatchEvent(new Event('change',{bubbles:true}));return !document.querySelector('#imagePreview').hidden})()");
  assert.equal(chosen,true,'local photo selection not visible');
  await poll(()=>evaluate("document.querySelector('#imagePreviewImg').naturalWidth>0"),12000,'chosen photo');
  await screenshot('museum-photo-preview.png');
  await evaluate("document.querySelector('#clearImage').click()");
  assert.equal(await evaluate("document.querySelector('#imagePreview').hidden"),true,'clear photo failed');
  for(const width of [320,375,390,430]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
    await navigate('/museum-archive.html?kind=moments');
    await poll(()=>evaluate("document.querySelector('#archiveStatus')?.textContent?.includes('件')"),14000,'archive card');
    const state=await evaluate("(()=>({doc:document.documentElement.scrollWidth,active:[...document.querySelectorAll('.archive-filter[aria-pressed=true]')].map(b=>b.dataset.kind),count:document.querySelectorAll('.archive-entry').length}))()");
    assert.ok(state.doc<=width+2,'archive overflow '+width);
    assert.deepEqual(state.active,['moments']);
    assert.equal(state.count,1,'only published archive entry visible');
    if(width===390)await screenshot('museum-archive-390.png');
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await navigate('/museum.html');
  await poll(()=>evaluate("document.querySelector('#museumNews')?.getAttribute('aria-busy')==='false'"),14000,'public museum news');
  const news=await evaluate("document.querySelector('#museumNews').textContent");
  assert.ok(news.includes('公開のお知らせ'),'published news not shown');
  assert.ok(!news.includes('下書き秘密のお知らせ'),'private announcement leaked');
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),true,'museum homepage horizontal overflow');
  await screenshot('museum-home-390.png');
  // Run local-only mobile device readiness page through real Chromium.
  for(const width of [320,375,390,430]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:3,mobile:true});
    await navigate('/museum-device-check.html');
    const metrics=await evaluate("(()=>({doc:document.documentElement.scrollWidth,button:document.querySelector('#runAuto').getBoundingClientRect().height,font:parseFloat(getComputedStyle(document.querySelector('#localPhoto')).fontSize)}))()");
    assert.ok(metrics.doc<=width+2,'device check horizontal overflow '+width);
    assert.ok(metrics.button>=48&&metrics.font>=16,'touch targets too small '+width);
    if(width===390){
      await evaluate("document.querySelector('#runAuto').click()");
      await poll(()=>evaluate("document.querySelector('#autoStatus').textContent.includes('合格しました')"),15000,'local device auto check');
      assert.equal(await evaluate("document.querySelector('#autoDetails').hidden"),false,'local results not shown');
      const localPhoto=await evaluate("(async()=>{const b=await(await fetch('/assets/mio-bg-princess.jpg')).blob();const f=new File([b],'device-test.jpg',{type:'image/jpeg'});const dt=new DataTransfer();dt.items.add(f);const input=document.querySelector('#localPhoto');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#tryPhoto').click();return true;})()");
      assert.equal(localPhoto,true);
      await poll(()=>evaluate("document.querySelector('#photoStatus').textContent.includes('成功しました')"),15000,'local photo conversion');
      assert.equal(await evaluate("document.querySelector('#photoPreview').naturalWidth>0"),true,'photo conversion not previewed');
      await screenshot('museum-device-check-390.png');
      await evaluate("document.querySelector('#clearPhoto').click()");
      assert.equal(await evaluate("document.querySelector('#photoPreview').hidden"),true,'device preview not cleared');
      assert.equal(await evaluate("document.querySelector('#localPhoto').files.length"),0,'device photo selection not cleared');
    }
  }
  assert.ok(adminCookieChecks.length>=5,'owner login path was not called');
  assert.ok(adminCookieChecks.every(Boolean),'HttpOnly scoped gallery cookie missing on owner endpoint');
  assert.ok(publicCookieChecks.length>=1,'public museum endpoint was not exercised');
  assert.ok(publicCookieChecks.every(x=>x===false),'owner cookie leaked to the public museum API');
  assert.deepEqual(browserWrites,[],'real mutations must never happen in browser smoke');
  assert.equal(requests.filter(x=>/\/api\/(?:gacha|attendance|checkin|status)/.test(x)).length,0,'do not access live participant or gacha API');
  console.log('MUSEUM_CHROME_PASS '+JSON.stringify({viewports:seen,readonly:true}));
}finally{
  if(socket&&socket.readyState===WebSocket.OPEN)socket.close();
  if(chrome){
    const exited=new Promise(done=>chrome.once('exit',done));
    chrome.kill('SIGKILL');
    await Promise.race([exited,pause(1500)]);
  }
  if(server){server.closeAllConnections();await new Promise(done=>server.close(done))}
  await rm(tmp,{recursive:true,force:true,maxRetries:8,retryDelay:150});
}
