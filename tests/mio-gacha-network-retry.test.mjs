import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../gacha-page.js',import.meta.url),'utf8');
const identity='MIO-W-'+'a'.repeat(24),oldId='b'.repeat(32),key='mio_pending_draw_'+identity;
const winner={drawId:oldId,mode:'通常',prize:'確定した景品',ordinal:2,rarity:'SR',image:''};
const pending=()=>({drawId:oldId,mode:'通常',beforeRemaining:3,beforeUsed:1});
const catalog=(patch={})=>({ok:true,participantId:identity,confirmed:true,remaining:3,used:1,
 nextOrdinal:2,webDrawsUsed:1,festAvailableFrom:5,festEntitled:false,festUnlocked:false,
 normalOpen:true,festOpen:true,normal:{ready:true,prizes:[],message:'抽選できます'},
 fest:{ready:true,prizes:[],message:'抽選できます'},...patch});

function harness({history=[],c=catalog(),drawResponse=null,failedDraw=false,failHistory=false,failCatalog=false,preview=false,savedPending=pending()}={}){
 const saved=new Map(savedPending?[[key,JSON.stringify(savedPending)]]:[]);
 const elements=new Map(),calls=[],windowHandlers=new Map();
 function element(tag='div'){
  const handlers=new Map();
  return {tagName:tag,handlers,hidden:true,disabled:false,value:'',textContent:'',className:'',title:'',
   style:{setProperty(){}},children:[],
   classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},after(){},remove(){},focus(){},
   replaceChildren(...v){this.children=v},append(...v){this.children.push(...v)},
   addEventListener(e,cb){handlers.set(e,cb)},get offsetWidth(){return 1}};
 }
 const el=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 el('drawResultCard').hidden=true;el('retryDraw').hidden=true;
 const send=async(action,payload)=>{
  calls.push({action,...payload});
  if(action==='catalog'){if(failCatalog)throw new TypeError('catalog offline');return c;}
  if(action==='history'){if(failHistory)throw new TypeError('history offline');return {ok:true,participantId:identity,history};}
  if(action==='draw'){
   if(failedDraw){failedDraw=false;throw new TypeError('network disconnected')}
   if(drawResponse)return drawResponse;
   if(!history.some(r=>r.drawId===payload.drawId))history.push({...winner,drawId:payload.drawId,mode:payload.mode});
   return {ok:true,participantId:identity,drawId:payload.drawId,mode:payload.mode,
     prize:winner.prize,ordinal:winner.ordinal,rarity:winner.rarity,image:'',remaining:2};
  }
  throw Error('unexpected action '+action);
 };
 const ctx=vm.createContext({
  document:{getElementById:el,createElement:element,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},hidden:false},
  window:{matchMedia:()=>({matches:true}),dispatchEvent(){},addEventListener(e,handler){windowHandlers.set(e,handler)},setInterval(){},confirm(){throw Error('retry must not open a second confirmation')}},
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
  location:{hostname:preview?'127.0.0.1':'emuzii-mio-1st-web-v12.vercel.app'},
  fetch:async(_url,{body})=>{const req=JSON.parse(body);const d=await send(req.action,req);
   return {ok:d?.ok!==false,status:d?.ok===false?409:200,text:async()=>JSON.stringify(d)};},
  setTimeout:(fn)=>{queueMicrotask(fn);return 1},clearTimeout(){},setInterval(){},
  performance:{now:()=>1000},
  crypto:{randomUUID:()=>oldId},Event:class{constructor(type){this.type=type}},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},
  Date,JSON,Math,Number,Promise,Uint8Array
 });
 vm.runInContext(source.replace(/void boot\(\);\s*$/,''),ctx,{filename:'gacha-page.js'});
 vm.runInContext('participant='+JSON.stringify(identity),ctx);
 async function flush(){for(let i=0;i<40;i++)await new Promise(r=>setImmediate(r))}
 return {el,saved,calls,ctx,flush,load:()=>vm.runInContext('loadCatalog()',ctx),
  execute:()=>vm.runInContext('execute(remember())',ctx),
  close:async()=>{el('drawResultCard').hidden=true;windowHandlers.get('mio:gacha-prize-closed')?.();await flush()},
  storage:async()=>{windowHandlers.get('storage')?.({key});await flush()},
  click:async()=>{el('retryDraw').handlers.get('click')();await flush()}};
}

test('a confirmed draw is restored as the original visible prize on reconnect',async()=>{
 const h=harness({history:[winner]});
 assert.equal(await h.load(),true);
 assert.equal(h.el('drawPrizeName').textContent,winner.prize);
 assert.equal(h.el('drawResultCard').hidden,false);
 assert.equal(h.el('retryDraw').hidden,true);
 assert.equal(h.saved.has(key),false);
 assert.equal(h.calls.some(c=>c.action==='draw'),false);
});
test('when history and entitlement counters show an unused ticket, show friendly retry only',async()=>{
 const h=harness();
 assert.equal(await h.load(),true);
 assert.match(h.el('drawMessage').textContent,/回線の状態が悪いため、再抽選いたします/);
 assert.match(h.el('drawMessage').textContent,/1回分のガチャ券は戻っています/);
 assert.equal(h.el('retryDraw').hidden,false);
 assert.equal(h.el('retryDraw').disabled,false);
 assert.equal(h.el('drawNormal').disabled,true);
 assert.equal(h.el('drawFest').disabled,true);
 assert.equal(h.el('reloadGacha').disabled,true);
 assert.equal(h.calls.some(c=>c.action==='draw'),false,'no auto-redraw on page refresh');
 await h.click();
 const spend=h.calls.filter(c=>c.action==='draw');
 assert.equal(spend.length,1);
 assert.equal(spend[0].drawId,oldId,'retry reuses the old draw ID');
 assert.equal(h.saved.has(key),false);
 assert.equal(h.el('drawPrizeName').textContent,winner.prize);
});
test('a changed balance cannot claim a returned ticket',async()=>{
 const h=harness({c:catalog({remaining:2,used:2})});
 await h.load();
 assert.doesNotMatch(h.el('drawMessage').textContent,/戻っています/);
 assert.equal(h.el('retryDraw').disabled,false);
 assert.equal(h.el('drawNormal').disabled,true);
});
test('a lost reply after server commit recovers the saved winner without a second draw',async()=>{
 const history=[];
 const h=harness({history,failedDraw:true});
 // Simulate server commit before the response is dropped.
 const first=h.ctx.fetch;
 h.ctx.fetch=async(url,options)=>{
  const d=JSON.parse(options.body);
  if(d.action==='draw'&&history.length===0){
   history.push(winner);
   throw new TypeError('response lost after commit');
  }
  return first(url,options);
 };
 await h.execute();
 assert.equal(h.el('drawPrizeName').textContent,winner.prize);
 assert.equal(h.saved.has(key),false);
 assert.equal(h.calls.filter(x=>x.action==='draw').length,0,'same confirmed receipt is recovered by history');
});
test('an incomplete 200 draw response is never displayed as a prize and pending ID survives',async()=>{
 const h=harness({drawResponse:{ok:true,participantId:identity,drawId:oldId,mode:'通常',remaining:2}});
 await h.execute();
 assert.equal(h.el('drawResultCard').hidden,true);
 assert.equal(h.saved.has(key),true);
 assert.equal(h.el('retryDraw').hidden,false);
 assert.equal(h.el('drawNormal').disabled,true);
});
test('invalid local draw ID is not sent to the draw endpoint',async()=>{
 const h=harness({savedPending:{drawId:'wrong',mode:'通常'}});
 await h.click();
 assert.equal(h.calls.length,0);
 assert.equal(h.saved.has(key),true);
 assert.equal(h.el('retryDraw').disabled,true);
});

test('null ticket counts never authorize a returned-ticket statement',async()=>{
 const h=harness({c:catalog({remaining:null,used:1})});
 assert.equal(await h.load(),false);
 assert.doesNotMatch(h.el('drawMessage').textContent,/戻っています/);
 assert.equal(h.saved.has(key),true);
 assert.equal(h.el('retryDraw').hidden,false);
});

test('confirmed receipt stays visible without another network read until the prize is closed',async()=>{
 const h=harness();
 await h.execute();
 assert.deepEqual(h.calls.map(x=>x.action),['draw']);
 assert.equal(h.el('drawPrizeName').textContent,winner.prize);
 assert.equal(h.el('drawResultCard').hidden,false);
 assert.equal(h.el('drawNormal').disabled,true);
 assert.equal(h.saved.has(key),false);
 await h.close();
 assert.deepEqual(h.calls.map(x=>x.action),['draw','catalog','history']);
 assert.equal(h.el('retryDraw').hidden,true);
});
test('corrupt saved draw ID remains locked after catalog reload',async()=>{
 const h=harness({savedPending:{drawId:'broken',mode:'通常'}});
 await h.load();
 assert.equal(h.el('retryDraw').hidden,false);
 assert.equal(h.el('retryDraw').disabled,true);
 assert.equal(h.el('drawNormal').disabled,true);
 assert.equal(h.el('drawFest').disabled,true);
 assert.equal(h.el('reloadGacha').disabled,true);
 assert.equal(h.calls.some(x=>x.action==='draw'),false);
});
test('double-tapping the recovery control submits at most one draw',async()=>{
 const h=harness({history:[]});
 await h.load();
 const click=h.el('retryDraw').handlers.get('click');
 click();click();await h.flush();
 assert.equal(h.calls.filter(x=>x.action==='draw').length,1);
 assert.equal(h.saved.has(key),false);
 assert.equal(h.el('drawPrizeName').textContent,winner.prize);
});

test('catalog outage keeps all draw controls disabled even without a pending operation',async()=>{
 const h=harness({savedPending:null,failCatalog:true});
 assert.equal(await h.load(),false);
 assert.equal(h.el('drawNormal').disabled,true);
 assert.equal(h.el('drawFest').disabled,true);
 assert.equal(h.calls.some(x=>x.action==='draw'),false);
});
test('history outage never unlocks stale catalog draw controls',async()=>{
 const h=harness({failHistory:true});
 assert.equal(await h.load(),false);
 assert.equal(h.el('drawNormal').disabled,true);
 assert.equal(h.el('drawFest').disabled,true);
 assert.equal(h.el('retryDraw').hidden,false);
 assert.equal(h.el('retryDraw').disabled,false);
 assert.equal(h.saved.has(key),true);
 assert.doesNotMatch(h.el('drawMessage').textContent,/戻っています/);
});
test('missing catalogue prizes fail closed, never allow a draw',async()=>{
 const h=harness({c:catalog({normal:null})});
 assert.equal(await h.load(),false);
 assert.equal(h.el('drawNormal').disabled,true);
 assert.equal(h.el('drawFest').disabled,true);
 assert.equal(h.saved.has(key),true);
});

test('zero remaining does not block recovery of an older committed draw receipt',async()=>{
 const h=harness({history:[],c:catalog({remaining:0,used:4}),
   drawResponse:{ok:true,participantId:identity,drawId:oldId,mode:'通常',
    prize:winner.prize,ordinal:2,rarity:'SR',remaining:0,replayed:true}});
 await h.load();
 assert.equal(h.el('retryDraw').hidden,false);
 await h.click();
 const draws=h.calls.filter(x=>x.action==='draw');
 assert.equal(draws.length,1);
 assert.equal(draws[0].drawId,oldId);
 assert.equal(h.el('drawPrizeName').textContent,winner.prize);
 assert.equal(h.saved.has(key),false);
});

test('malformed persisted pending draw never enables another ticket spend',async()=>{
 const h=harness();
 h.saved.set(key,'{not-valid-json');
 assert.equal(await h.load(),true);
 assert.equal(h.el('drawNormal').disabled,true);
 assert.equal(h.el('drawFest').disabled,true);
 assert.equal(h.el('retryDraw').disabled,true);
 assert.equal(h.el('reloadGacha').disabled,true);
 assert.equal(h.calls.some(c=>c.action==='draw'),false);
});

test('closing prize in static preview never requests a real API',async()=>{
 const h=harness({preview:true,savedPending:null});
 await h.close();
 assert.deepEqual(h.calls,[]);
});

test('an overlapping tab cannot start a new draw during an open confirmation',async()=>{
 const h=harness({savedPending:null});
 await h.load();
 const confirmation=vm.runInContext("start('通常')",h.ctx);
 await h.flush();
 // Another browser tab saves its in-flight draw before this confirmation is accepted.
 h.saved.set(key,JSON.stringify(pending()));
 h.el('gachaConfirmYes').onclick();
 await confirmation;
 assert.equal(h.calls.filter(x=>x.action==='draw').length,0);
 assert.equal(JSON.parse(h.saved.get(key)).drawId,oldId);
 assert.equal(h.el('retryDraw').hidden,false);
 assert.equal(h.el('drawNormal').disabled,true);
 assert.equal(h.el('drawFest').disabled,true);
});
test('storage events from another tab lock buttons while pending, refresh only after clearing',async()=>{
 const h=harness({savedPending:null});
 await h.load();
 assert.equal(h.el('drawNormal').disabled,false);
 h.saved.set(key,JSON.stringify(pending()));
 const count=h.calls.length;
 await h.storage();
 assert.equal(h.calls.length,count,'receiving cross-tab pending must not call draw');
 assert.equal(h.el('retryDraw').hidden,false);
 assert.equal(h.el('drawNormal').disabled,true);
 assert.equal(h.el('drawFest').disabled,true);
 h.saved.delete(key);
 await h.storage();
 assert.equal(h.calls.some(x=>x.action==='draw'),false);
 assert.equal(h.el('retryDraw').hidden,true);
 assert.equal(h.el('drawNormal').disabled,false,'re-enabled after fresh successful catalog and history');
});
