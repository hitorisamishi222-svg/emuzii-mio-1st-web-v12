import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('release-prep/BrowserAddV189Patch_5slot_guard_PROPOSAL.gs');
const current=read('APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs');
const future=read('APPS_SCRIPT_Code_v1.9.4_BROWSER_PAIR.gs');
const baseRow=(status='承認待ち')=>{
 const r=Array(20).fill('');
 r[0]='MIO-W-'+'b'.repeat(24);
 r[5]=status;r[7]='MIO-0001';r[10]='MIO-0001';r[11]='確認済み';r[16]='未指定';
 return r;
};
function guard(n,opts={}){
 const globals={
  MAX_APPROVED_BROWSERS_PER_MIO:opts.max??5,
  approvedBrowserCount_:()=>n,
 };
 vm.runInNewContext(code,globals);
 return r=>globals.assertBrowserSlotsBeforeManualAddV199_({}, {}, r, 'MIO-0001');
}
test('new fifth browser is allowed and data stays untouched',()=>{
 const r=baseRow(),snapshot=JSON.stringify(r),ret=guard(4)(r);
 assert.equal(ret.ok,true);assert.equal(ret.current,4);
 assert.equal(JSON.stringify(r),snapshot);
});
test('new sixth browser is rejected without changing its approval state',()=>{
 const r=baseRow();assert.throws(()=>guard(5)(r),/最大5件/);
 assert.equal(r[5],'承認待ち');
});
test('already approved fifth browser does not consume an additional slot',()=>{
 const r=baseRow('承認済み');
 assert.equal(guard(5)(r).current,5);
});
test('pre-existing six browsers are not silently retired',()=>{
 const r=baseRow('承認済み');
 assert.throws(()=>guard(6)(r),/5件を超えています/);
 assert.equal(r[5],'承認済み');
});
test('wrong identity, unverified, and retired browser do not qualify for addition',()=>{
 for(const modify of [
   r=>r[7]='MIO-0002',
   r=>r[10]='MIO-0002',
   r=>r[11]='確認待ち',
   r=>r[16]='旧端末',
 ]){
   const r=baseRow();modify(r);
   assert.throws(()=>guard(0)(r),/本人確認/);
 }
});
test('browser guard fails closed if pairing backend is missing',()=>{
 const sandbox={};vm.runInNewContext(code,sandbox);
 assert.throws(()=>sandbox.assertBrowserSlotsBeforeManualAddV199_({}, {},baseRow(),'MIO-0001'),/更新準備中/);
});
function sliceFunction(source,name){
 const all=[...source.matchAll(/\bfunction\s+([A-Za-z0-9_]+)\s*\(/g)];
 const idx=all.findIndex(x=>x[1]===name);
 assert(idx>=0,'missing '+name);
 return source.slice(all[idx].index,all[idx+1]?.index??source.length).trim();
}
test('manual-browser-guard proposal cannot modify existing gacha APIs, grant amounts, or attendance',()=>{
 for(const f of ['gachaAction_','checkinAction_','setupGacha_'])
  assert.equal(sliceFunction(future,f),sliceFunction(current,f));
 const executable=code.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
 for(const forbidden of ['setValue(','appendRow(','getRange(','deleteTrigger(','newTrigger('])
  assert.equal(executable.includes(forbidden),false,'guard must be read-only and have no triggers: '+forbidden);
});
