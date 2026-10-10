import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=filename=>readFileSync(new URL('../'+filename,import.meta.url),'utf8');
const previous=read('APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs');
const proposed=read('APPS_SCRIPT_Code_v1.9.4_BROWSER_PAIR.gs');

function functions(source){
 const fn=[...source.matchAll(/\bfunction\s+([A-Za-z0-9_]+)\s*\(/g)];
 return fn.map((m,i)=>({name:m[1],code:source.slice(m.index,fn[i+1]?.index??source.length).trim()}));
}
const old=functions(previous),next=functions(proposed);
const map=new Map(next.map(f=>[f.name,f.code]));
const changed=new Set(['autoLinkWebParticipant_','doPost']);

test('candidate has exactly two intentional modifications to legacy functions',()=>{
 assert.equal(old.length,38,'unexpected legacy source; re-audit required');
 assert.equal(next.length,49,'unexpected new functions; re-audit required');
 assert.equal(map.size,next.length,'duplicate functions would silently override authentication');
 const changedFound=[];
 for(const f of old){
   assert(map.has(f.name),'deleted legacy function '+f.name);
   if(map.get(f.name)!==f.code)changedFound.push(f.name);
 }
 assert.deepEqual(changedFound.sort(),[...changed].sort());
});

test('all legacy attendance/gacha/setup and identity helper implementations remain exact',()=>{
 for(const name of [
  'setup','setupGacha_','checkinAction_','gachaAction_','webIntegrityOk_',
  'activeWebDeviceErrorV189_','ensureLoginIdExisting_','ensureWebDerivedExisting_',
  'webActualRows_','webActualCount_','webActualLastRow_'
 ]){
  const prior=old.find(f=>f.name===name);
  assert(prior,'expected pre-existing function '+name);
  assert.equal(map.get(name),prior.code,name+' unexpectedly changed');
 }
});

test('name-only and user-supplied login ID may only create a pending browser request',()=>{
 const section=proposed.slice(proposed.indexOf("if(d.action==='register')"),
 proposed.indexOf('if(found.length===0)',proposed.indexOf("if(d.action==='register')")));
 assert.match(section,/if\(duplicates\.length \|\| peopleByName\.length\)/);
 assert.match(section,/queueBrowserRequest_/);
 assert.match(section,/status:'承認待ち'/);
 assert.doesNotMatch(section,/safeApprovedDuplicateBase_\(/);
 assert.doesNotMatch(section,/submittedLoginId/);
 assert.match(proposed,/d\.action==='pair_create'/);
 assert.match(proposed,/d\.action==='pair_claim'/);
});

test('one-time browser links enforce five verified credentials under GAS script lock',()=>{
 assert.match(proposed,/MAX_APPROVED_BROWSERS_PER_MIO=5/);
 assert.match(proposed,/approvedBrowserCount_\(ss,web,approved\.id\)>=MAX_APPROVED_BROWSERS_PER_MIO/);
 assert.match(proposed,/approvedBrowserCount_\(ss,web,origin\.id\)>=MAX_APPROVED_BROWSERS_PER_MIO/);
 assert.match(proposed,/String\(record\[7\]\)!=='未使用'/);
 assert.match(proposed,/getScriptLock\(\)/);
 assert.doesNotThrow(()=>new vm.Script(proposed));
});
