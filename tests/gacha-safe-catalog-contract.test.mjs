/**
 * NEW ONLY: browser + server fail-closed catalog contract.
 * No network, login credentials, participants or live GAS are used.
 * The existing backend is run inside a vm with harmless bridge/auth stubs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {hasSafeGachaContract} from '../gacha-contract.js';

function validCatalog(overrides={}){
  return {
    ok:true,participantId:'MOCK_WEB',confirmed:true,
    used:3,remaining:2,nextOrdinal:4,webDrawsUsed:3,festAvailableFrom:5,
    festEntitled:true,festUnlocked:false,
    normalOpen:false,festOpen:false,
    normal:{ready:true,prizes:[{id:'MEM1',name:'Example'}]},
    fest:{ready:true,prizes:[{id:'LF1',name:'Other'}]},
    ...overrides
  };
}
const legacy=()=>{const c=validCatalog();delete c.webDrawsUsed;delete c.nextOrdinal;delete c.festEntitled;return c};
const source=readFileSync(new URL('../api-gacha.js',import.meta.url),'utf8');
const frontend=readFileSync(new URL('../gacha-page.js',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
function simulatedHandler(c,opts={}){
 const calls=[];
 const mock={
  prepare:()=>opts.disablePrepare?null:{secret:'SIMULATED'},
  readSession:()=>opts.noSession?null:{id:'MOCK_WEB',token:'MOCK_TOKEN'},
  hash:()=> 'MOCK_HASH',
  sessionCookie:()=> 'FAKE_COOKIE',
  hasSafeGachaContract,
  bridge:async (action,payload)=>{
    calls.push({action,payload});
    if(opts.failCatalog&&action==='catalog')throw Error('catalog cannot be read');
    if(action==='catalog')return c;
    if(action==='draw')return {ok:true,participantId:'MOCK_WEB',mode:payload.mode,drawId:payload.drawId,prize:'Example',ordinal:1,replayed:opts.replay===true};
    return {ok:true,participantId:'MOCK_WEB',history:[]};
  }
 };
 let transformed=source.replace(/^import .*;\r?\n/gm,'').replace('export default async function handler','async function handler');
 const handler=runInNewContext(transformed+'\nhandler',mock,{timeout:5000});
 const response={statusCode:200,headers:{},data:null,
   status(n){this.statusCode=n;return this;},
   json(data){this.data=data;return this;},
   setHeader(k,v){this.headers[k]=v;return this}};
 const req={headers:{cookie:'fake'},body:opts.body||{action:'draw',mode:'通常',drawId:'1'.repeat(32)}};
 return {calls,response,invoke:()=>handler(req,response)};
}
test('valid pre-fourth Web draw is safe to inspect, but festival remains locked',()=>{
 const c=validCatalog();assert.equal(hasSafeGachaContract(c),true);assert.equal(c.festUnlocked,false);
});
test('valid fifth draw is unlocked only with four confirmed Web draws',()=>{
 assert.equal(hasSafeGachaContract(validCatalog({used:4,webDrawsUsed:4,nextOrdinal:5,remaining:1,festUnlocked:true})),true);
});
test('legacy GAS response lacking modern counters cannot authorize fresh draws',()=>{
 assert.equal(hasSafeGachaContract(legacy()),false);
});
test('contradictory festival unlock and impossible ordinal are rejected',()=>{
 assert.equal(hasSafeGachaContract(validCatalog({festUnlocked:true})),false);
 assert.equal(hasSafeGachaContract(validCatalog({nextOrdinal:3})),false);
});
test('malformed readiness, flags and unsafe counts are rejected',()=>{
 assert.equal(hasSafeGachaContract(validCatalog({normal:{ready:1,prizes:[]}})),false);
 assert.equal(hasSafeGachaContract(validCatalog({confirmed:'true'})),false);
 assert.equal(hasSafeGachaContract(validCatalog({remaining:-1})),false);
 assert.equal(hasSafeGachaContract(validCatalog({webDrawsUsed:5})),false);
 assert.equal(hasSafeGachaContract(validCatalog({festAvailableFrom:4})),false);
});
test('API stops legacy catalog BEFORE invoking any draw action',async()=>{
 const h=simulatedHandler(legacy());await h.invoke();
 assert.equal(h.response.statusCode,409);
 assert.deepEqual(h.calls.map(x=>x.action),['catalog']);
 assert.match(h.response.data.error,/安全確認/);
});
test('API lets valid catalog through to unchanged backend draw operation',async()=>{
 const h=simulatedHandler(validCatalog());await h.invoke();
 assert.equal(h.response.statusCode,200);
 assert.deepEqual(h.calls.map(x=>x.action),['catalog','draw']);
 assert.equal(h.calls[1].payload.drawId,'1'.repeat(32));
 assert.equal(h.response.data.prize,'Example');
});
test('preflight verifies participant ID and refuses mismatched catalog',async()=>{
 const h=simulatedHandler(validCatalog({participantId:'OTHER_WEB'}));await h.invoke();
 assert.equal(h.response.statusCode,409);
 assert.deepEqual(h.calls.map(x=>x.action),['catalog']);
});
test('failed read-only preflight stops draw, no hidden fallback',async()=>{
 const h=simulatedHandler(validCatalog(),{failCatalog:true});await h.invoke();
 assert.equal(h.response.statusCode,409);
 assert.deepEqual(h.calls.map(x=>x.action),['catalog']);
});
test('replay is still forwarded with original drawId despite zero rights',async()=>{
 const c=validCatalog({used:5,remaining:0,nextOrdinal:6,webDrawsUsed:5,festUnlocked:false});
 const h=simulatedHandler(c,{replay:true});await h.invoke();
 assert.equal(h.response.statusCode,200);
 assert.equal(h.response.data.replayed,true);
 assert.deepEqual(h.calls.map(x=>x.action),['catalog','draw']);
});
test('history and catalog requests do not invoke another preflight',async()=>{
 for(const action of ['history','catalog']){
  const h=simulatedHandler(legacy(),{body:{action}});await h.invoke();
  assert.equal(h.response.statusCode,200);
  assert.deepEqual(h.calls.map(x=>x.action),[action]);
 }
});
test('preview-disabled server does not call GAS at all',async()=>{
 const h=simulatedHandler(validCatalog(),{disablePrepare:true});await h.invoke();
 assert.deepEqual(h.calls,[]);
});
test('browser disable guard exists at load, button setup and final confirmation',()=>{
 assert.match(frontend,/import \{hasSafeGachaContract\} from '\.\/gacha-contract\.js';/);
 assert.match(frontend,/function setButtons\(c\)\{\s*if\(!hasSafeGachaContract\(c\)\)/);
 assert.match(frontend,/const c=await post\('\/api\/gacha',\{action:'catalog'\}\);\s*if\(!hasSafeGachaContract\(c\)\)/);
 assert.match(frontend,/const c=lastCatalog;\s*if\(!hasSafeGachaContract\(c\)\)/);
 assert.equal(config.builds.filter(x=>x.src==='gacha-contract.js'&&x.use==='@vercel/static').length,1);
});
