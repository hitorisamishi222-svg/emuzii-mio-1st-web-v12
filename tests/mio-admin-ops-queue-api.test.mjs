import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Evaluate the unmodified handler body with mocked imports. Network, GAS and
// production authentication are never accessed by this test.
const original=readFileSync(new URL('../api-gacha-admin-ops.js',import.meta.url),'utf8');
const source=original.replace(/^import .*;\s*$/gm,'').replace('export default async function handler','async function handler')
 +'\n__test.handler=handler;';
assert.ok(!source.includes('import {'));
function harness(gasResult){
 let called=0;
 const mock={__test:{},process:{env:{MIO_GACHA_ADMIN_OPS_RELEASE:''}},
  authorizedCode:()=>true,prepare:()=>true,sessionOK:async()=>true,
  bridge:async()=>{called++;return gasResult},
  console:{error(){}}
 };
 vm.runInNewContext(source,mock,{filename:'api-gacha-admin-ops.js'});
 const makeReq=()=>({headers:{host:'emuzii-mio-1st-web-v12.vercel.app',
  origin:'https://emuzii-mio-1st-web-v12.vercel.app','content-type':'application/json'},
  body:{action:'read',code:'fictional-admin'}});
 const makeRes=()=>{
  const response={headers:{},code:200,body:null,
   setHeader(key,value){this.headers[key]=value;return this},
   status(code){this.code=code;return this},
   json(data){this.body=data;return this}};
  return response;
 };
 return {request:async()=>{const res=makeRes();await mock.__test.handler(makeReq(),res);
  return {code:res.code,data:res.body,called}},
 };
}
const blank=()=>({ok:true,pending:[],roster:[],simple:[],simplePending:[],
 totalPending:0,pendingRegistrationCount:0,pendingIdentityCount:0,
 pendingSimpleCount:0,unknownWebStatusCount:0,unknownSimpleStatusCount:0,
 invalidWebIdCount:0,incompleteSimpleRowCount:0,
 pendingListTruncated:false,simplePendingListTruncated:false,rejectedCount:0});
test('admin read API distinguishes three empty queues without enabling any writes',async()=>{
 const res=await harness(blank()).request();
 assert.equal(res.code,200);
 assert.equal(res.data.ok,true);
 assert.equal(res.data.writeEnabled,false);
 assert.equal(res.data.pendingRegistrationCount,0);
 assert.equal(res.data.pendingIdentityCount,0);
 assert.equal(res.data.pendingSimpleCount,0);
 assert.equal(res.called,1);
});
test('admin read API refuses outdated GAS which omits a queue count',async()=>{
 for(const key of ['pendingRegistrationCount','pendingIdentityCount',
  'pendingSimpleCount','unknownWebStatusCount','unknownSimpleStatusCount',
  'invalidWebIdCount','incompleteSimpleRowCount','simplePending']){
  const candidate=blank();delete candidate[key];
  const res=await harness(candidate).request();
  assert.equal(res.code,424,'missing '+key);
  assert.equal(res.data.ok,false);
  assert.equal(Object.hasOwn(res.data,'totalPending'),false,'must never report a false zero');
 }
});
test('admin read API fails closed for invalid counts or contradictory totals',async()=>{
 const broken=[
  {...blank(),totalPending:1},
  {...blank(),pendingSimpleCount:-1},
  {...blank(),pendingIdentityCount:0.5},
  {...blank(),unknownWebStatusCount:'0'},
  {...blank(),invalidWebIdCount:-1},
  {...blank(),incompleteSimpleRowCount:NaN},
  {...blank(),pendingRegistrationCount:Number.MAX_SAFE_INTEGER+1},
  {...blank(),pendingListTruncated:true},
  {...blank(),simplePendingListTruncated:true}
 ];
 for(const state of broken){
  const res=await harness(state).request();
  assert.equal(res.code,424,'must reject incoherent GAS queue metadata');
  assert.equal(res.data.ok,false);
 }
});
test('admin read API preserves truthful capped queue counts without inflating list size',async()=>{
 const candidate=blank();
 candidate.totalPending=100;
 candidate.pendingRegistrationCount=99;
 candidate.pendingIdentityCount=1;
 candidate.pending=[{name:'架空の登録者',status:'承認待ち'}];
 candidate.pendingListTruncated=true;
 candidate.pendingSimpleCount=72;
 candidate.simplePending=[{name:'架空の受付者',status:'管理確認待ち'}];
 candidate.simplePendingListTruncated=true;
 candidate.unknownWebStatusCount=2;
 candidate.invalidWebIdCount=3;
 candidate.incompleteSimpleRowCount=4;
 const res=await harness(candidate).request();
 assert.equal(res.code,200);
 assert.equal(res.data.totalPending,100);
 assert.equal(res.data.pendingRegistrationCount,99);
 assert.equal(res.data.pendingIdentityCount,1);
 assert.equal(res.data.pendingSimpleCount,72);
 assert.equal(res.data.unknownWebStatusCount,2);
 assert.equal(res.data.invalidWebIdCount,3);
 assert.equal(res.data.incompleteSimpleRowCount,4);
 assert.equal(res.data.pendingListTruncated,true);
 assert.equal(res.data.simplePendingListTruncated,true);
 assert.equal(res.data.writeEnabled,false);
});
