import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const source=read('mio-cookie-loss-ui.js');
const page=read('gacha-page.js');
const html=read('gacha.html');
async function drain(){for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve))}
function harness({early=false}={}){
 const elements={};
 const names=['cookieLossPanel','cookieLossStatus','cookieLossCheck','cookieLossSubmit',
   'cookieLossName','cookieLossMioId','cookieLossBrowser'];
 for(const id of names){
  elements[id]={hidden:id==='cookieLossPanel',disabled:false,value:'',
    textContent:'',listeners:{},addEventListener(type,handler){this.listeners[type]=handler}};
 }
 const listeners={},requests=[];
 const ctx={
  document:{documentElement:{dataset:{mioSessionMissing:early?'true':''}},
    getElementById(id){return elements[id]||null}},
  window:{addEventListener(n,fn){listeners[n]=fn},confirm(){return false}},
  fetch:async(path,opts)=>{requests.push({path,body:JSON.parse(opts.body)});
   return {ok:false,status:503,json:async()=>({ok:false,code:'MANUAL_INTAKE_DISABLED'})}}
 };
 vm.runInNewContext(source,ctx);
 return {elements,listeners,requests};
}
test('the recovery support entry remains visible when 401 arrives before UI listener',async()=>{
 const p=harness({early:true});
 await drain();
 assert.equal(p.elements.cookieLossPanel.hidden,false);
 assert.equal(p.requests.length,1);
 assert.equal(p.requests[0].body.action,'status');
 assert.equal(p.requests[0].path,'/api/mio-cookie-loss-client');
 assert.match(p.elements.cookieLossStatus.textContent,/準備中/);
});
test('signed-in or non-401 error does not reveal recovery request unnecessarily',async()=>{
 const p=harness();
 await drain();
 assert.equal(p.elements.cookieLossPanel.hidden,true);
 assert.equal(p.requests.length,0);
});
test('401 event reveals recovery path once and never issues a participant session',async()=>{
 const p=harness();
 p.listeners['mio:legacy-session-missing']();
 p.listeners['mio:legacy-session-missing']();
 await drain();
 assert.equal(p.elements.cookieLossPanel.hidden,false);
 assert.deepEqual(p.requests.map(x=>x.body.action),['status']);
});
test('gacha page persists only missing-session UI state, without changing identity or draws',()=>{
 assert.match(page,/if\(e.status===401\)\{document.documentElement.dataset.mioSessionMissing='true'/);
 assert.match(page,/window.dispatchEvent\(new Event\('mio:legacy-session-missing'\)\)/);
 assert.match(html,/id="cookieLossPanel" hidden/);
 assert.match(html,/src="\/mio-cookie-loss-ui.js"/);
 assert.doesNotMatch(source,/sessionCookie\(|mio_session=|bridge\('draw'|setLightSessionCookie\(/);
});
