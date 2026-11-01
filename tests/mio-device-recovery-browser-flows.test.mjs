import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../mio-device-recovery-ui.js',import.meta.url),'utf8');
const next=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r))};
function browser({responses=[]}={}){
 const items={},events=new Map(),intervals=[],calls=[],requested=[];
 const ids=['deviceRecoveryPanel','deviceRecoveryRequest','deviceRecoveryCheck','deviceRecoveryClaim','deviceRecoveryMessage'];
 for(const id of ids){
  items[id]={id,hidden:id==='deviceRecoveryPanel',disabled:id==='deviceRecoveryClaim',textContent:'',
   events:new Map(),addEventListener(k,fn){this.events.set(k,fn)},
   click(){const fn=this.events.get('click');if(fn)return fn()}
  };
 }
 const location={hostname:'emuzii-mio-1st-web-v12.vercel.app',reloadCount:0,reload(){this.reloadCount++}};
 const document={hidden:false,getElementById:id=>items[id]};
 const window={addEventListener(k,fn){events.set(k,fn)},setInterval(fn,ms){intervals.push({fn,ms})}};
 const fetch=async(url,init)=>{
  const body=JSON.parse(init.body);requested.push(body.action);calls.push({url,init});
  const r=responses.shift()||{status:200,data:{ok:true,status:'none'}};
  return {ok:r.status<400,status:r.status,json:async()=>r.data};
 };
 vm.runInNewContext(source,{location,document,window,fetch});
 return {items,events,intervals,location,calls,requested,async open(){
  events.get('mio:legacy-session-missing')();await next();
 },async press(id){items[id].click();await next()},async poll(){intervals[0].fn();await next()}};
}
test('missing signed browser cookie shows same-browser iPhone/LINE/X guidance and stops polling',async()=>{
 const b=browser({responses:[{status:401,data:{ok:false,code:'SIGNED_LIGHT_SESSION_REQUIRED'}}]});
 await b.open();
 assert.equal(b.items.deviceRecoveryPanel.hidden,false);
 assert.match(b.items.deviceRecoveryMessage.textContent,/LINE・X/);
 assert.match(b.items.deviceRecoveryMessage.textContent,/別ブラウザ/);
 await b.poll();
 assert.deepEqual(b.requested,['status']);
 assert.equal(b.items.deviceRecoveryClaim.disabled,true);
});
test('pending -> approved -> claim uses only status and claim, never creates a draw',async()=>{
 const b=browser({responses:[
  {status:200,data:{ok:true,status:'pending'}},
  {status:200,data:{ok:true,status:'approved'}},
  {status:200,data:{ok:true,status:'recovered'}}
 ]});
 await b.open();
 assert.equal(b.items.deviceRecoveryClaim.disabled,true);
 await b.poll();
 assert.equal(b.items.deviceRecoveryClaim.disabled,false);
 await b.press('deviceRecoveryClaim');
 assert.equal(b.location.reloadCount,1);
 assert.deepEqual(b.requested,['status','status','claim']);
 for(const item of b.calls)assert.equal(item.url,'/api/mio-device-recovery-client');
});
test('consumed approval can retry once with the same browser, but status is read-only',async()=>{
 const b=browser({responses:[
  {status:200,data:{ok:true,status:'consumed'}},
  {status:200,data:{ok:true,status:'recovered'}}
 ]});
 await b.open();
 assert.equal(b.items.deviceRecoveryClaim.disabled,false);
 await b.press('deviceRecoveryClaim');
 assert.deepEqual(b.requested,['status','claim']);
 assert.equal(b.location.reloadCount,1);
});
test('different signed legacy and light cookies cannot be promoted to access',async()=>{
 const b=browser({responses:[
  {status:409,data:{ok:false,code:'COOKIE_IDENTITY_CONFLICT'}}
 ]});
 await b.open();
 assert.match(b.items.deviceRecoveryMessage.textContent,/異なる参加者/);
 assert.equal(b.items.deviceRecoveryClaim.disabled,true);
 await b.poll();
 assert.equal(b.requested.length,1);
});
test('an error from GAS master-ID proof blocks claim and avoids automatic retry loops',async()=>{
 const b=browser({responses:[
  {status:200,data:{ok:true,status:'none'}},
  {status:409,data:{ok:false,code:'GAS_CANONICAL_ID_MISMATCH'}}
 ]});
 await b.open();
 await b.press('deviceRecoveryRequest');
 assert.match(b.items.deviceRecoveryMessage.textContent,/参加者IDの照合が完了していません/);
 await b.poll();
 assert.deepEqual(b.requested,['status','request']);
 assert.equal(b.items.deviceRecoveryClaim.disabled,true);
});
