import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const id='MIO-W-'+'a'.repeat(24);
const drawId='b'.repeat(32);
const key='mio_pending_draw_'+id;
const pending={drawId,mode:'通常'};
const catalog=()=>({
  ok:true,participantId:id,confirmed:true,used:1,remaining:2,nextOrdinal:2,
  webDrawsUsed:1,festAvailableFrom:5,festEntitled:false,festUnlocked:false,
  normalOpen:true,festOpen:false,
  normal:{ready:true,safetyRevision:'mio-crossmode-nodup-v1',prizes:[],message:'抽選できます'},
  fest:{ready:false,safetyRevision:'mio-crossmode-nodup-v1',prizes:[],message:'停止中'}
});
const won=()=>({ok:true,participantId:id,drawId,mode:'通常',
  prize:'確認済み景品',ordinal:1,rarity:'N',image:'',replayed:true});
const missing=()=>({ok:false,error:'確定した結果はまだ見つかりません'});

function harness(savedStorage=new Map([[key,JSON.stringify(pending)]]),recoverReply=won()){
  const nodes=new Map(),scrollEvents=[];
  function el(name='div'){
    const handlers={};
    return {
      id:name,disabled:false,hidden:false,title:'',textContent:'',style:{setProperty(){}},
      classList:{add(){},remove(){},toggle(){}},
      addEventListener(ev,cb){handlers[ev]=cb},
      setAttribute(){},removeAttribute(){},replaceChildren(){},append(){},remove(){},
      scrollIntoView(opts){scrollEvents.push({name,opts})},get offsetWidth(){return 3},
      handlers
    };
  }
  function $ (id){if(!nodes.has(id))nodes.set(id,el(id));return nodes.get(id)}
  const calls=[];
  const context=vm.createContext({
    document:{getElementById:$,querySelectorAll:()=>[],createElement:()=>el(),
      addEventListener(){},hidden:false},
    location:{hostname:'emuzii-mio-1st-web-v12.vercel.app'},
    window:{matchMedia:()=>({matches:true}),setInterval(){},addEventListener(){},dispatchEvent(){}},
    localStorage:{getItem:k=>savedStorage.get(k)||null,
      setItem:(k,v)=>savedStorage.set(k,v),removeItem:k=>savedStorage.delete(k)},
    fetch:async (_path,{body})=>{
      const request=JSON.parse(body);calls.push(request);
      const data=request.action==='recover'?recoverReply:
        request.action==='catalog'?catalog():
        request.action==='history'?{ok:true,participantId:id,history:[]}:
        {ok:false,error:'A RETRY MUST NOT ISSUE A DRAW'};
      return {ok:data.ok,status:data.ok?200:409,text:async()=>JSON.stringify(data)};
    },
    setTimeout,clearTimeout,performance:{now:()=>100},
    CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts?.detail}},
    Event:class {constructor(type){this.type=type}},
    crypto:{randomUUID:()=> 'unused'},Math,Date,JSON,Number,Error,Promise
  });
  const script=readFileSync(new URL('../gacha-page.js',import.meta.url),'utf8')
    .replace(/^import \{hasSafeGachaContract\} from '\.\/gacha-contract\.js';\n/,
      'const hasSafeGachaContract = globalContract;\n')
    .replace(/void boot\(\);\s*$/,'');
  // The exact production contract function is injected into this browser VM;
  // only boot() (which requires the real /api/status endpoint) is suppressed.
  context.globalContract=c=>{
    if(!c||c.ok!==true||c.participantId!==id)return false;
    return c.normal?.safetyRevision==='mio-crossmode-nodup-v1' &&
      c.fest?.safetyRevision==='mio-crossmode-nodup-v1';
  };
  vm.runInContext(script,context,{filename:'gacha-page.js'});
  vm.runInContext('participant='+JSON.stringify(id)+';',context);
  return {nodes,calls,savedStorage,context,scrollEvents};
}
async function clickRetry(h){
  h.nodes.get('retryDraw').handlers.click();
  // Allow the async fetch/re-render chain to settle without triggering new actions.
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
}

test('retry button only issues recover/history and clears pending after verified result',async()=>{
  const h=harness();
  await clickRetry(h);
  assert.deepEqual(h.calls.map(x=>x.action),['recover','catalog','history']);
  assert.equal(h.calls[0].drawId,drawId);
  assert.equal(h.calls[0].mode,'通常');
  assert.equal(h.savedStorage.has(key),false);
  assert.equal(h.nodes.get('drawPrizeName').textContent,'確認済み景品');
});

test('missing history leaves original pending drawId intact without any new draw',async()=>{
  const storage=new Map([[key,JSON.stringify(pending)]]);
  const h=harness(storage,missing());
  await clickRetry(h);
  assert.deepEqual(h.calls.map(x=>x.action),['recover','catalog','history']);
  assert.deepEqual(JSON.parse(storage.get(key)),pending);
  assert.equal(h.nodes.get('retryDraw').hidden,false);
  assert.match(h.nodes.get('drawMessage').textContent,/前回の抽選結果を確認/);
});

test('after simulated page reload, recovery retains the same drawId and never issues draw',async()=>{
  const storage=new Map([[key,JSON.stringify(pending)]]);
  const before=harness(storage,missing());await clickRetry(before);
  const after=harness(storage,won());await clickRetry(after);
  assert.equal(after.calls[0].drawId,drawId);
  assert.equal(after.calls.every(c=>c.action!=='draw'),true);
  assert.equal(storage.has(key),false);
});

test('real confirmed draw scrolls to whale machine before showing draw animation',async()=>{
  const h=harness(new Map());
  await vm.runInContext("execute({drawId:'"+drawId+"',mode:'通常'})",h.context);
  const stageScroll=h.scrollEvents.find(x=>x.name==='gachaStage');
  assert.ok(stageScroll,'whale machine must be brought into viewport');
  assert.equal(stageScroll.opts.block,'center');
  assert.equal(stageScroll.opts.behavior,'auto','reduced-motion setting must be respected');
});

test('read-only pending result recovery never scrolls away to restart the whale animation',async()=>{
  const h=harness();
  await clickRetry(h);
  assert.equal(h.scrollEvents.some(x=>x.name==='gachaStage'),false);
  assert.deepEqual(h.calls.map(x=>x.action),['recover','catalog','history']);
});
