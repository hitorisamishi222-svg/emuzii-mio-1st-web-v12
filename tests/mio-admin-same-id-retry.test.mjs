import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../gacha-admin-ops.js',import.meta.url),'utf8');

test('uncertain Web grant keeps the exact operation ID across explicit retry',async()=>{
 const elements=new Map();
 let codeId=0,serverSpecial=2,grantCalls=[],networkDrop=true;
 function element(tag='div'){
  return {tag,value:'',disabled:false,hidden:false,textContent:'',className:'',
   children:[],listeners:{},append(...items){this.children.push(...items)},
   replaceChildren(...items){this.children=items},
   setAttribute(){},focus(){},select(){},
   addEventListener(k,fn){this.listeners[k]=fn}
  };
 }
 const get=id=>{
  if(!elements.has(id))elements.set(id,element());
  return elements.get(id);
 };
 get('opsQuantity').value='1';
 get('opsReason').value='イベント特別付与';
 get('opsSearch').value='';
 const saved=new Map();
 const sessionStorage={
  setItem(key,value){saved.set(key,value)},
  getItem(key){return saved.get(key)||null},
  removeItem(key){saved.delete(key)}
 };
 const roster=()=>({mioId:'MIO-0001',name:'テスト参加者',
  gacha:{checked:true,total:serverSpecial,remaining:serverSpecial,special:serverSpecial}});
 const fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body);
  if(d.action==='read')return {ok:true,status:200,json:async()=>({
   ok:true,writeEnabled:true,pending:[],roster:[roster()],simple:[],grants:[],totalPending:0
  })};
  if(d.action==='grant'){
   grantCalls.push(d.operationId);
   if(networkDrop){
    networkDrop=false;serverSpecial+=d.count;throw Error('connection interrupted after server commit');
   }
   return {ok:true,status:200,json:async()=>({ok:true,result:{replayed:true,mioId:d.mioId}})};
  }
  throw Error('unexpected action '+d.action);
 };
 let confirmCalls=0;
 const ctx={
  document:{hidden:false,getElementById:get,createElement:element,createTextNode:t=>({textContent:t}),addEventListener(){},querySelector(){return null}} ,
  window:{confirm(){confirmCalls++;return true},addEventListener(){},setInterval(){}},
  sessionStorage,fetch,
  crypto:{getRandomValues(arr){for(let i=0;i<arr.length;i++)arr[i]=(codeId++%255);return arr}},
  snapshot:{normalOpen:false},code:'valid dummy administrator key',navigator:{clipboard:{writeText:async()=>{}}},
  console,Uint8Array
 };
 vm.runInNewContext(source,ctx,{timeout:2500});
 await get('opsReload').listeners.click();
 assert.equal(get('opsGrant').disabled,true);
 const rosterButton=get('opsRoster').children.find(x=>x.tag==='button');
 assert.ok(rosterButton,'participant selector should render');
 rosterButton.listeners.click();
 assert.equal(get('opsGrant').disabled,false);
 await get('opsGrant').listeners.click();
 assert.equal(serverSpecial,3);
 assert.equal(grantCalls.length,1);
 assert.equal(get('opsRetry').hidden,false);
 assert.equal(get('opsGrant').disabled,true);
 const raw=[...saved.values()][0];
 assert.ok(raw,'pending operation is preserved in session storage');
 const stored=JSON.parse(raw);
 assert.equal(stored.action,'grant');
 assert.equal(stored.count,1);
 assert.equal(stored.mioId,'MIO-0001');
 assert.equal('code' in stored,false,'administrator secret is never cached');
 await get('opsRetry').listeners.click();
 // The event listener starts async verification; drain microtasks.
 for(let i=0;i<30&&get('opsRetry').hidden===false;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(grantCalls.length,2);
 assert.equal(grantCalls[0],grantCalls[1],'retry must reuse original operation ID');
 assert.equal(serverSpecial,3,'retry cannot add a second gacha credit');
 assert.equal(saved.size,0,'confirmed operation cleared from session');
 assert.equal(get('opsRetry').hidden,true);
 const restored=get('opsRoster').children.find(x=>x.tag==='button');
 assert.equal(restored?.disabled,false,'roster actions should be usable after a resolved retry');
 assert.ok(confirmCalls>=2);
});
