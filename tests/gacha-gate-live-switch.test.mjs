import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const paths=['APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs','APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs'];
for(const path of paths){
 const code=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const getReader=new Function('console',code+'\nreturn gachaReadLiveGate_;');
 function setup(opts={}){
  const entries=opts.entries||Array.from({length:142},()=>['']);
  if(!opts.entries){entries[140]=['メンシプガチャ受付'];entries[141]=['ラキフェス受付']}
  const values=opts.values||{141:false,142:false};
  const sheet={
   getLastRow(){return entries.length},
   getRange(row,col,n=1){
    return {
     getDisplayValues(){assert.equal(col,1);return entries.slice(row-1,row-1+n)},
     getValue(){assert.equal(col,2);return values[row]}
    };
   }
  };
  const ss={getSheetByName(name){assert.equal(name,'emuzii_管理画面');return opts.missing?null:sheet}};
  const reader=getReader({error(){}});
  return {reader,ss,values};
 }
 test(path+': exactly the same existing management checkboxes control returned flags',()=>{
  const f=setup();
  assert.deepEqual(f.reader(f.ss),{normalOpen:false,festOpen:false,configured:true});
  f.values[141]=true;
  assert.deepEqual(f.reader(f.ss),{normalOpen:true,festOpen:false,configured:true});
  f.values[142]=true;
  assert.deepEqual(f.reader(f.ss),{normalOpen:true,festOpen:true,configured:true});
  f.values[141]=false;
  assert.deepEqual(f.reader(f.ss),{normalOpen:false,festOpen:true,configured:true});
 });
 test(path+': fail closed for missing controls, duplicate labels and invalid checkbox data',()=>{
  assert.equal(setup({missing:true}).reader(setup({missing:true}).ss).configured,false);
  const empty=setup({entries:[['別の管理設定']]});
  assert.deepEqual(empty.reader(empty.ss),{normalOpen:false,festOpen:false,configured:false});
  const invalid=setup({values:{141:'TRUE',142:true}});
  assert.equal(invalid.reader(invalid.ss).configured,false);
  const duplicate=setup();
  const rows=Array.from({length:142},()=>['']);rows[140]=['メンシプガチャ受付'];rows[141]=['ラキフェス受付'];rows[50]=['メンシプガチャ受付'];
  const bad=setup({entries:rows,values:{141:true,142:true}});
  assert.equal(bad.reader(bad.ss).normalOpen,false);
  assert.equal(bad.reader(bad.ss).configured,false);
 });
 test(path+': drawing and catalog are wired to the actual gate, no undefined function dependency',()=>{
  assert.ok(code.includes('var gate=gachaReadLiveGate_(ss);'));
  assert.ok(code.includes('gateConfigured:gate.configured'));
  assert.ok(code.includes("if(!gate.configured)return {ok:false,error:'管理画面のガチャ受付スイッチを確認できません'};"));
  assert.ok(!code.includes("var gate=typeof gachaOpenState_==='function'"));
  assert.doesNotThrow(()=>new Function(code));
 });
}
