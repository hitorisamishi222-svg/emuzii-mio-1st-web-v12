// Real Chromium smoke test: static preview only; NEVER contacts GAS/draw API.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,extname} from 'node:path';
import http from 'node:http';

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
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
 '.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'};
server=http.createServer(async(req,res)=>{
  try{
    const p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const file=resolve(cwd,p.replace(/^\/+/,'')||'index.html');
    if(!file.startsWith(cwd+sep))throw Error('path traversal');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
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
    await writeFile(join('artifacts',name),Buffer.from(shot.data,'base64'));
  }
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/gacha.html?deluxeDemo=1'});
  await poll(()=>evaluate("document.readyState==='complete'"),20000,'loaded DOM');
  await poll(()=>evaluate("document.querySelector('.mio-deluxe-demo-status')?.textContent?.includes('27種類')"),20000,'27-item demo data');
  assert.equal(requests.filter(url=>url.includes('/gacha-prize-demo-catalog.json')).length,0,
    'iPhone preview must initialize with no separate catalog request');
  const images=await evaluate("(async()=>{const c=await (await fetch('/gacha-prize-demo-catalog.json')).json();return Promise.all(c.prizes.map(p=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({id:p.id,ok:image.naturalWidth>0});image.onerror=()=>resolve({id:p.id,ok:false});image.src=p.image;})));})()");
  assert.equal(images.length,27);
  assert.deepEqual(images.filter(p=>!p.ok),[],'all 27 real image files must load inside Chrome');
  await evaluate("document.querySelector('#gachaStage').scrollIntoView({block:'center',behavior:'instant'})");
  await pause(250);
  const sample="(()=>{const stage=document.querySelector('#gachaStage'),r=stage.getBoundingClientRect(),modal=document.querySelector('#drawResultCard'),m=modal.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,scroll:window.scrollY,docHeight:document.documentElement.scrollHeight,open:stage.classList.contains('mio-prize-open'),modalHidden:modal.hidden,modal:{x:m.x,y:m.y,w:m.width,h:m.height},text:document.querySelector('#drawPrizeName')?.textContent||'',imgOk:document.querySelector('#drawResultImage')?.naturalWidth>0,buttonsDisabled:[...document.querySelectorAll('.mio-deluxe-demo-actions button')].every(x=>x.disabled)};})()";
  const before=await evaluate(sample);
  assert.ok(Math.abs(before.w-before.h)<2,'whale machine should be square');
  await screenshot('01-iphone-gacha-before.png');
  await evaluate("document.querySelector('.mio-deluxe-demo-actions button').click()");
  await poll(()=>evaluate("document.querySelector('#gachaStage').classList.contains('mio-prize-open')"),11000,'first prize reveal');
  await pause(750); // let the real flying-out transition finish before measuring/capturing
  const first=await evaluate(sample);
  assert.ok(first.imgOk,'winning prize JPEG should appear');
  assert.ok(first.text.trim(),'winning prize name should appear');
  assert.ok(first.buttonsDisabled,'buttons must remain disabled until item closed');
  assert.equal(first.modalHidden,false);
  assert.ok(Math.abs(first.scroll-before.scroll)<2,'page moved when prize appeared');
  assert.ok(Math.abs(first.y-before.y)<2,'whale machine shifted on first prize');
  assert.ok(first.modal.x>=first.x-2&&first.modal.y>=first.y-2,'prize must overlay whale machine');
  assert.ok(first.modal.w>=first.w*.8,'prize should finish its fly-out animation at large readable size');
  assert.ok(first.modal.w<=first.w+4&&first.modal.h<=first.h+4,'prize must stay inside whale frame');
  await screenshot('02-iphone-winning-prize-overlay.png');
  await evaluate("document.querySelector('#mioPrizeClose').click()");
  await poll(()=>evaluate("document.querySelector('#drawResultCard').hidden"),3000,'close prize');
  const closed=await evaluate(sample);
  console.log('SCROLL_DIAGNOSTIC '+JSON.stringify({before,first,closed,deltaScroll:closed.scroll-before.scroll,deltaStage:closed.y-before.y,deltaDoc:closed.docHeight-before.docHeight}));
  assert.ok(Math.abs(closed.scroll-before.scroll)<2,'closing prize moved the page');
  assert.ok(Math.abs(closed.y-before.y)<2,'machine shifted after close');
  await screenshot('03-iphone-prize-closed.png');
  await evaluate("document.querySelectorAll('.mio-deluxe-demo-actions button')[1].click()");
  await poll(()=>evaluate("document.querySelector('#gachaStage').classList.contains('mio-prize-open')"),11000,'second prize reveal');
  await pause(750);
  const second=await evaluate(sample);
  assert.ok(second.imgOk&&second.text,'second mode should show a real prize');
  assert.ok(Math.abs(second.scroll-before.scroll)<2,'repeated draw scrolled page');
  assert.ok(Math.abs(second.y-before.y)<2,'repeated draw shifted whale');
  assert.equal(second.modalHidden,false);
  await screenshot('04-iphone-second-prize.png');
  // A second real Chromium device-size validation catches smaller iPhones.
  // Initial manual navigation is allowed; TAP, prize reveal, CLOSE and repeat
  // are never allowed to move the viewport.
  await evaluate("document.querySelector('#mioPrizeClose').click()");
  await cdp('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:3,mobile:true});
  await pause(180);
  await evaluate("document.querySelector('#gachaStage').scrollIntoView({block:'center',behavior:'instant'})");
  await pause(180);
  const smallBefore=await evaluate(sample);
  const buttonVisible=await evaluate("(()=>{const b=document.querySelector('.mio-deluxe-demo-actions button').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight})()");
  assert.equal(buttonVisible,true,'draw button and whale should share visible mobile viewport');
  assert.ok(Math.abs(smallBefore.w-smallBefore.h)<2,'375px viewport whale must remain square');
  await evaluate("document.querySelector('.mio-deluxe-demo-actions button').click()");
  await poll(()=>evaluate("document.querySelector('#gachaStage').classList.contains('mio-prize-open')"),11000,'375px prize');
  const smallOpen=await evaluate(sample);
  assert.ok(Math.abs(smallOpen.y-smallBefore.y)<2&&Math.abs(smallOpen.scroll-smallBefore.scroll)<2,
    '375px iPhone prize opening must not move viewport');
  await evaluate("document.querySelector('#mioPrizeClose').click()");
  const smallClosed=await evaluate(sample);
  assert.ok(Math.abs(smallClosed.y-smallBefore.y)<2&&Math.abs(smallClosed.scroll-smallBefore.scroll)<2,
    '375px iPhone prize closing must not move viewport');
  console.log('PASS: 375x812 iPhone viewport, button visible, prize open/close no page motion');
  assert.equal(requests.filter(url=>/\/api\/gacha|\/api\/status/.test(url)).length,0,'demo must not request live API');
  console.log('PASS: Chrome 390x844, 27 JPEGs, 2 prize reveals, close, no page motion, no live APIs');
  console.log(JSON.stringify({before,first,closed,second,requests:requests.length}));
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
