import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../GAS_WebGateOnly_20261030.gs',import.meta.url),'utf8');
function mock(){
 const data={B2:false,D2:false},touched=[];
 const p={A2:'通常ガチャ',C2:'ラキフェス'};
 const a={A141:'メンシプガチャ受付',A142:'ラキフェス受付'};
 const panel={getRange(c){return {getValue(){return data[c]},getDisplayValue(){return p[c]},setValue(v){touched.push(c);data[c]=v}}}};
 const admin={getRange(c){return {getValue(){return c==='B141'?data.B2:data.D2},getDisplayValue(){return a[c]}}}};
 const ss={getSheetByName(name){return name==='emuzii_管理画面'?admin:name==='emuzii_ガチャ緊急管理_1030'?panel:null}};
 const ctx={SpreadsheetApp:{flush(){}},console:{error(){}}};
 vm.runInNewContext(source,ctx);
 return {data,touched,ss,api:ctx.gachaWebGateAction_};
}
test('ON and OFF change only B2/D2 and verify actual gate values',()=>{
 const m=mock();
 assert.equal(m.api(m.ss,{action:'webGateRead'}).normalOpen,false);
 assert.equal(m.api(m.ss,{action:'webGateSet',mode:'通常',expected:false,enabled:true}).normalOpen,true);
 assert.equal(m.api(m.ss,{action:'webGateSet',mode:'ラキフェス',expected:false,enabled:true}).festOpen,true);
 assert.equal(m.api(m.ss,{action:'webGateSet',mode:'通常',expected:true,enabled:false}).normalOpen,false);
 assert.equal(m.api(m.ss,{action:'webGateSet',mode:'ラキフェス',expected:true,enabled:false}).festOpen,false);
 assert.deepEqual(m.touched,['B2','D2','B2','D2']);
});
test('stale buttons do not overwrite another admins decision',()=>{
 const m=mock();
 m.api(m.ss,{action:'webGateSet',mode:'通常',expected:false,enabled:true});
 assert.throws(()=>m.api(m.ss,{action:'webGateSet',mode:'通常',expected:false,enabled:false}),/別の操作/);
 assert.equal(m.data.B2,true);
});
test('other management operations are rejected',()=>{
 const m=mock();
 assert.throws(()=>m.api(m.ss,{action:'webGateSet',mode:'皆勤',expected:false,enabled:true}));
 assert.throws(()=>m.api(m.ss,{action:'webGateSet',mode:'通常',expected:false,enabled:'true'}));
 assert.deepEqual(m.touched,[]);
});
test('existing draw API route remains unchanged',()=>{
 const cfg=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(cfg.routes.find(x=>x.src==='/api/gacha')?.dest,'/api-gacha.js');
 assert.equal(cfg.routes.find(x=>x.src==='/api/gacha-web-gate')?.dest,'/api-gacha-web-gate.js');
});
