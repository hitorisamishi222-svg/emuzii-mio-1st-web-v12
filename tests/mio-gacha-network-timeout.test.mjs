import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../gacha-page.js',import.meta.url),'utf8');
const begin=source.indexOf('function parse('),end=source.indexOf('function note(',begin);
assert.ok(begin>=0&&end>begin);
const helpers=source.slice(begin,end)+'\n globalThis.__post=post;';

function harness(fetch){
 const delayed=[],cleared=[];
 class AbortControllerFake{
   constructor(){this.signal={aborted:false,onabort:null}}
   abort(){
     this.signal.aborted=true;
     this.signal.onabort?.();
   }
 }
 const context={
   AbortController:AbortControllerFake,
   fetch,
   Math,JSON,Error,TypeError,Promise,
   setTimeout(fn,ms){delayed.push(ms);queueMicrotask(fn);return delayed.length},
   clearTimeout(id){cleared.push(id)}
 };
 vm.runInNewContext(helpers,context);
 return {post:context.__post,delayed,cleared};
}
test('timed-out draw is sent only once and its receipt stays unresolved',async()=>{
 let count=0;
 const h=harness((_path,{body,signal})=>{
   assert.equal(JSON.parse(body).action,'draw');
   count++;
   return new Promise((_resolve,reject)=>{
     signal.onabort=()=>{const e=Error('timeout');e.name='AbortError';reject(e)};
   });
 });
 await assert.rejects(()=>h.post('/api/gacha',{action:'draw',drawId:'a'.repeat(32),mode:'通常'}),/timeout/);
 assert.equal(count,1,'draw may not be automatically retried on timeout');
 assert.deepEqual(h.delayed,[35000]);
});
test('read-only history retries after timeout, not draw',async()=>{
 let count=0;
 const h=harness((_path,{body,signal})=>{
   assert.equal(JSON.parse(body).action,'history');
   count++;
   if(count===1)return new Promise((_resolve,reject)=>{
     signal.onabort=()=>{const e=Error('timeout');e.name='AbortError';reject(e)};
   });
   return Promise.resolve({ok:true,status:200,text:async()=>JSON.stringify({ok:true,history:[]})});
 });
 const out=await h.post('/api/gacha',{action:'history'});
 assert.equal(out.ok,true);
 assert.equal(count,2);
 assert.ok(h.delayed.filter(x=>x===15000).length===2);
});
test('503 read-only retry is allowed, 503 draw retry is not',async()=>{
 let count=0;
 const h=harness(async()=>{
   count++;
   if(count===1)return {ok:false,status:503,text:async()=>JSON.stringify({ok:false,error:'temporary'})};
   return {ok:true,status:200,text:async()=>JSON.stringify({ok:true})};
 });
 await h.post('/api/gacha',{action:'catalog'});
 assert.equal(count,2);
 count=0;
 await assert.rejects(()=>h.post('/api/gacha',{action:'draw',drawId:'a'.repeat(32),mode:'通常'}),/temporary/);
 assert.equal(count,1);
});
