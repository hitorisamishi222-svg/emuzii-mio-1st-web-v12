import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {inspectSources} from '../scripts/mio-gas-source-preflight.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const client=read('mio-gas-local-check.js');
function browserInspect(){
 const elements=new Map();
 function input(id){
  if(!elements.has(id))elements.set(id,{
   textContent:'',disabled:false,value:'',files:[],listeners:new Map(),
   addEventListener(name,fn){this.listeners.set(name,fn)},
   replaceChildren(){},append(){}
  });
  return elements.get(id);
 }
 const window={};
 const document={getElementById:input,createElement(){return {textContent:'',click(){}}}};
 vm.runInNewContext(client,{document,window,URL,Blob,setTimeout});
 assert.equal(typeof window.MioGasLocalCheck?.inspect,'function');
 return window.MioGasLocalCheck.inspect;
}
const clientInspect=browserInspect();

function comparable(result){
 const keys=['classification','sourceCount','adminFunctionsPresent','adminFunctionsMissing',
  'duplicateFunctionDeclarationCount','doPostCount','dispatchersFound','blockingReasons'];
 const out={};
 for(const k of keys){
  if(k==='sourceCount')out[k]=result.sourceCount??result.fileCount;
  else out[k]=Array.isArray(result[k])?Array.from(result[k]):result[k];
 }
 return out;
}
const old=read('APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs');
const full=read('GAS_Code_FULL_WEB_OPS_20261030.gs');
const addon=read('GAS_WebAdminOps_20261030.gs');

for(const [name,sources] of [
 ['old candidate without admin Ops',[old]],
 ['integrated candidate with 19 Ops',[full]],
 ['unsafe duplicate of 19 Ops',[full,addon]],
 ['missing doPost',[addon]],
 ['double doPost',[full,full]]
]){
 test('mobile GAS preflight matches the tested CLI for '+name,()=>{
  const expected=inspectSources(sources);
  const actual=clientInspect(sources);
  assert.deepEqual(comparable(actual),comparable(expected));
  assert.equal(actual.liveAdminWriteAllowed,false);
  assert.equal(actual.deployedVersionVerified,false);
  assert.equal(actual.sourceBackupVerified,false);
  assert.equal(actual.readOnly,true);
  assert.ok(actual.blockingReasons.includes('DEPLOYED_GAS_VERSION_AND_BACKUP_NOT_VERIFIED'));
  const json=JSON.stringify(actual);
  assert.equal(json.includes('BRIDGE_SECRET'),false);
  assert.equal(json.includes('GAS_WebAdminOps'),false);
 });
}
test('mobile preflight blocks an invalid authentication / lock route in the existing candidate',()=>{
 const damaged=full.replace('if(!lock.tryLock(10000))','if(lock.tryLock(10000))');
 assert.notEqual(damaged,full);
 const result=clientInspect([damaged]);
 assert.equal(result.classification,'BLOCKED_REVIEW');
 assert.ok(result.blockingReasons.includes('DISPATCH_WITHOUT_CONFIRMED_LOCK_OR_SECRET_ORDER'));
 assert.equal(result.liveAdminWriteAllowed,false);
});


test('commented-out and quoted fake functions never alter real GAS function counts',()=>{
 const before=inspectSources([full]);
 const fakeComment=[
  '/*',
  'function doPost(e) {}',
  'function mioAdminOpsGrant_() {}',
  '*/',
  '// function doPost(e) {}'
 ].join(String.fromCharCode(10));
 const fakeTemplate=['const note = `','function doPost(e) {}','function mioAdminOpsGrant_() {}','`;'].join(String.fromCharCode(10));
 for(const fake of [fakeComment,fakeTemplate]){
  const sample=[fake,full].join(String.fromCharCode(10));
  const node=inspectSources([sample]),mobile=clientInspect([sample]);
  assert.deepEqual(comparable(mobile),comparable(node));
  assert.equal(node.doPostCount,before.doPostCount);
  assert.equal(node.adminFunctionsPresent,before.adminFunctionsPresent);
  assert.equal(node.duplicateFunctionDeclarationCount,before.duplicateFunctionDeclarationCount);
  assert.equal(node.classification,before.classification);
 }
});
test('commented-out safety tokens cannot hide a real missing GAS lock',()=>{
 const broken=full.replace('LockService.getScriptLock()', 'LockService.notTheRealLock()');
 assert.notEqual(broken,full);
 const injected=[
  '// LockService.getScriptLock()',
  '// if(!lock.tryLock(10000))return json_({ok:false});',
  '/* equal_(d.secret,secret) */'
 ].join(String.fromCharCode(10));
 const source=broken.replace('function doPost(e)',injected+String.fromCharCode(10)+'function doPost(e)');
 const node=inspectSources([source]),mobile=clientInspect([source]);
 assert.deepEqual(comparable(mobile),comparable(node));
 assert.equal(node.classification,'BLOCKED_REVIEW');
 assert.ok(node.blockingReasons.includes('DISPATCH_WITHOUT_CONFIRMED_LOCK_OR_SECRET_ORDER'));
 assert.equal(node.webAdminWriteAllowed,false);
});
