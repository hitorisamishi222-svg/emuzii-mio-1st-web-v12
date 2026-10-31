import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const id='MIO-W-'+'a'.repeat(24),drawId='b'.repeat(32),key='mio_pending_draw_'+id;
const pending={drawId,mode:'通常'};
const winner={drawId,mode:'通常',prize:'保存済み景品',ordinal:2,rarity:'SR',image:'https://example.org/test.jpg'};
function fixture(extra={}){return {ok:true,participantId:id,confirmed:true,used:2,remaining:3,
  nextOrdinal:3,webDrawsUsed:2,festAvailableFrom:5,festEntitled:true,festUnlocked:false,
  normalOpen:true,festOpen:true,normal:{ready:true,prizes:[],message:''},
  fest:{ready:true,prizes:[],message:''},...extra}}
function harness(saved=new Map([[key,JSON.stringify(pending)]]),historyRows=[winner],identity=id){
  const nodes=new Map(),requests=[];
  function element(name='div'){
    const handlers=new Map();
    return {id:name,hidden:false,disabled:false,style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},
      setAttribute(){},removeAttribute(){},replaceChildren(){},append(){},after(){},remove(){},
      scrollIntoView(){throw Error('recovery may not scroll')},
      addEventListener:(event,cb)=>handlers.set(event,cb),handlers,get offsetWidth(){return 2}};
  }
  const $=name=>{if(!nodes.has(name))nodes.set(name,element(name));return nodes.get(name)};
  const context=vm.createContext({
    document:{getElementById:$,querySelectorAll:()=>[],createElement:()=>element(),addEventListener(){},hidden:false},
    location:{hostname:'emuzii-mio-1st-web-v12.vercel.app'},
    window:{matchMedia:()=>({matches:true}),setInterval(){},addEventListener(){},dispatchEvent(){}},
    localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
    fetch:async(_path,{body})=>{
      const request=JSON.parse(body);requests.push(request);
      if(request.action==='draw')throw Error('RECOVERY MUST NEVER RE-DRAW');
      const response=request.action==='history'
        ?{ok:true,participantId:identity,history:historyRows}
        :request.action==='catalog'?fixture():{ok:false,error:'Unexpected action'};
      return {ok:response.ok,status:response.ok?200:409,text:async()=>JSON.stringify(response)};
    },
    setTimeout,clearTimeout,performance:{now:()=>50},Event:class{constructor(type){this.type=type}},
    CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}},
    crypto:{randomUUID:()=>drawId},Date,JSON,Number,Math,Promise
  });
  const original=readFileSync(new URL('../gacha-page.js',import.meta.url),'utf8');
  assert.ok(original.includes("void boot();"));
  vm.runInContext(original.replace(/void boot\(\);\s*$/,''),context,{filename:'gacha-page.js'});
  vm.runInContext('participant='+JSON.stringify(id)+';',context);
  return {context,nodes,requests,saved,$};
}
async function click(h){
  const button=h.$('retryDraw');button.handlers.get('click')();
  for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
}

test('recovery only reads saved draw history and never creates a new draw',async()=>{
  const h=harness();await click(h);
  assert.deepEqual(h.requests.map(x=>x.action),['history','catalog','history']);
  assert.equal(h.saved.has(key),false);
  assert.equal(h.$('drawPrizeName').textContent,'保存済み景品');
  assert.equal(h.$('drawResultCard').hidden,false);
});

test('if a draw never committed, preserve pending ID and do not spend another right',async()=>{
  const h=harness(new Map([[key,JSON.stringify(pending)]]),[]);
  await click(h);
  // The follow-up catalog request is read-only and cannot consume another right.
  assert.deepEqual(h.requests.map(x=>x.action),['history','catalog']);
  assert.deepEqual(JSON.parse(h.saved.get(key)),pending);
  assert.match(h.$('drawMessage').textContent,/再抽選せず運営/);
  assert.equal(h.$('retryDraw').hidden,false);
});

test('reject mismatched participant identity even if draw ID matches',async()=>{
  const h=harness(new Map([[key,JSON.stringify(pending)]]),[winner],'MIO-W-'+'c'.repeat(24));
  await click(h);
  assert.deepEqual(h.requests.map(x=>x.action),['history']);
  assert.equal(h.saved.has(key),true);
  assert.match(h.$('drawMessage').textContent,/不整合/);
});

test('reject wrong mode, duplicate IDs or broken ordinal without dropping pending draw',async()=>{
  for(const rows of [[{...winner,mode:'ラキフェス'}],[winner,winner],[{...winner,ordinal:0}]]){
    const h=harness(new Map([[key,JSON.stringify(pending)]]),rows);
    await click(h);
    assert.deepEqual(h.requests.map(x=>x.action),['history']);
    assert.equal(h.saved.has(key),true);
  }
});

test('invalid stored draw ID never performs an API request',async()=>{
  const broken={drawId:'invalid',mode:'通常'};
  const h=harness(new Map([[key,JSON.stringify(broken)]]));
  await click(h);
  assert.deepEqual(h.requests,[]);
  assert.deepEqual(JSON.parse(h.saved.get(key)),broken);
});
