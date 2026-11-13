import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {triageGasSourceSnapshot} from '../scripts/mio-gas-source-preflight.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const integrated=read('GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs');
const standalone=read('GAS_WebAdminOps_20261030.gs');
const dispatch="    if(/^webAdminOps(?:Read|Member|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));";
const files=src=>({files:[{name:'Code',type:'SERVER_JS',source:src},
 {name:'appsscript',type:'JSON',source:'{"timeZone":"Asia/Tokyo"}'}]});

test('current standalone and integrated GitHub admin candidates each declare exactly 21 functions',()=>{
 const getNames=s=>[...s.matchAll(/^[ \t]*function[ \t]+(mioAdminOps[A-Za-z0-9_]*)\s*\(/gm)].map(m=>m[1]);
 const one=getNames(standalone),two=getNames(integrated);
 assert.equal(one.length,21);
 assert.equal(new Set(one).size,21);
 assert.deepEqual(two,one);
 assert.equal(two.length,21);
 // Historical 19-function estimate is not the actual current repo count.
 assert.notEqual(one.length,19);
});

test('valid integration candidate passes static review but never live deployment proof',()=>{
 const result=triageGasSourceSnapshot(files(integrated));
 assert.equal(result.status,'STATIC_ADMIN_ROUTING_COMPATIBLE_NOT_DEPLOYED_PROOF');
 assert.equal(result.expectedAdminFunctionCount,21);
 assert.equal(result.missingAdminFunctionCount,0);
 assert.equal(result.staticDispatchDetected,true);
 assert.equal(result.liveDeploymentVerified,false);
 assert.equal(result.publishedVersionVerified,false);
 assert.equal(result.liveReadConfirmed,false);
 assert.equal(result.writeAllowed,false);
 assert.equal(result.publicationAllowed,false);
 assert.equal(result.patchAllowed,false);
});

test('standalone module cannot be stacked with the integrated source',()=>{
 const input=files(integrated+'\n'+standalone);
 const report=triageGasSourceSnapshot(input);
 assert.equal(report.status,'DUPLICATE_ADMIN_FUNCTIONS_BLOCKED');
 assert.equal(report.writeAllowed,false);
 assert.equal(report.publicationAllowed,false);
});

test('missing admin route and partial admin helpers never authorize publishing',()=>{
 const noRoute=integrated.replace(dispatch,'');
 assert.notEqual(noRoute,integrated);
 const r=triageGasSourceSnapshot(files(noRoute));
 assert.equal(r.status,'ADMIN_ROUTING_MISSING');
 assert.equal(r.writeAllowed,false);
 const removed=integrated.replace('function mioAdminOpsSchema_(', 'function renamedSchemaTest_(');
 assert.notEqual(removed,integrated);
 const partial=triageGasSourceSnapshot(files(removed));
 assert.equal(partial.status,'PARTIAL_OR_UNRECOGNIZED_ADMIN_SOURCE');
 assert.equal(partial.missingAdminFunctionCount,1);
 assert.equal(partial.writeAllowed,false);
});

test('older backup-shaped code without any admin functions is treated only as submitted source',()=>{
 const missingNames=integrated
  .replace(/^[ \t]*function[ \t]+(mioAdminOps[A-Za-z0-9_]*)\s*\(/gm,(m,n)=>m.replace(n,'renamed_'+n))
  .replace(dispatch,'');
 const r=triageGasSourceSnapshot(files(missingNames));
 assert.equal(r.status,'NO_ADMIN_FUNCTIONS_IN_SUBMITTED_SOURCE');
 assert.equal(r.missingAdminFunctionCount,21);
 assert.equal(r.liveDeploymentVerified,false);
 assert.equal(r.writeAllowed,false);
});

test('duplicate file names, invalid type and missing input fail closed without leaking source',()=>{
 for(const input of [
  undefined,{files:[]},{files:[{name:'Code',type:'SERVER_JS',source:123}]},
  {files:[{name:'Code',type:'SERVER_JS',source:'abc'}, {name:'Code',type:'SERVER_JS',source:'def'}]},
  {files:[{name:'private',type:'SERVER_JS',source:''},{name:'oops',type:'BINARY',source:'hi'}]},
  {files:[{name:'bad/filename',type:'SERVER_JS',source:'hi'}]},
 ]){
  const r=triageGasSourceSnapshot(input);
  assert.equal(r.status,'STOP');
  assert.equal(r.writeAllowed,false);
  assert.equal(r.publicationAllowed,false);
 }
});

test('CLI is offline and never prints GAS code, secret, script ID, or input data',()=>{
 const sentinel='SECRET-DO-NOT-PRINT-1234567';
 const input=files(integrated+'\n// '+sentinel);
 const run=spawnSync(process.execPath,['scripts/mio-gas-source-preflight.mjs'],{
  cwd:new URL('..',import.meta.url),input:JSON.stringify(input),encoding:'utf8'
 });
 assert.equal(run.status,1,'offline diagnostics must never authorize release');
 assert.equal(run.stderr,'');
 const o=JSON.parse(run.stdout);
 assert.equal(o.liveDeploymentVerified,false);
 assert.equal(o.writeAllowed,false);
 assert.equal(o.publicationAllowed,false);
 assert.equal(run.stdout.includes(sentinel),false);
 assert.equal(run.stdout.includes('SpreadsheetApp'),false);
 assert.equal(run.stdout.includes('function doPost'),false);
 const bad=spawnSync(process.execPath,['scripts/mio-gas-source-preflight.mjs'],{
  cwd:new URL('..',import.meta.url),input:'not-json '+sentinel,encoding:'utf8'
 });
 assert.equal(bad.status,1);
 assert.equal(bad.stdout.includes(sentinel),false);
});
