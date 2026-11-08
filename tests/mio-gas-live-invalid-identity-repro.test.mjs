// Reproduces the production "invalid identity" diagnostic with synthesized
// GAS source and credentials. NO live requests, publishing or account data.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const combined=readFileSync(new URL('../GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs',import.meta.url),'utf8');
const dispatch="    if(/^webAdminOps(?:Read|Member|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));";
const marker="    if(!/^MIO-W-[a-f0-9]{24}$/.test(d.participantId||'')||! /^[a-f0-9]{64}$/.test(d.tokenHash||''))return json_({ok:false,error:'invalid identity'});";
const secret='TEST_SYNTHETIC_GAS_SECRET_1234567890';
const setup=(src=combined)=>{
 const ctx={
  console,Date,
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='BRIDGE_SECRET'?secret:null})},
  SpreadsheetApp:{openById:()=>Object.freeze({readonly:true})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return JSON.parse(s)}})}
 };
 vm.createContext(ctx);
 vm.runInContext(src,ctx,{timeout:1000});
 // Override only the GAS operator read handler with a fake read-only status.
 ctx.mioAdminOps_=(ss,d)=>({ok:d.action==='webAdminOpsRead',readOnly:true});
 return {
  call:(action='webAdminOpsRead',suppliedSecret=secret)=>ctx.doPost({
   postData:{contents:JSON.stringify({action,secret:suppliedSecret})}
  })
 };
};
test('combined candidate has authenticated admin dispatcher before participant ID guard',()=>{
 const p=combined.indexOf(dispatch),q=combined.indexOf(marker);
 assert.ok(p>0&&q>p,'webAdminOps must dispatch before identity');
 const auth=combined.indexOf("if(!secret||!equal_(d.secret,secret))");
 assert.ok(auth>0&&auth<p,'secret must be checked first');
});
test('read-only admin action is routed after successful bridge secret verification',()=>{
 const t=setup();
 const out=t.call();
 assert.equal(out.ok,true);assert.equal(out.readOnly,true);
 assert.equal(out.error,undefined);
});
test('missing admin dispatcher reproduces observed invalid identity without real identity',()=>{
 assert.ok(combined.includes(dispatch));
 const legacy=combined.replace(dispatch,'');
 const out=setup(legacy).call();
 assert.equal(out.ok,false);
 assert.equal(out.error,'invalid identity');
});
test('wrong bridge secret remains forbidden even with admin dispatcher',()=>{
 const out=setup().call('webAdminOpsRead','INCORRECT_BRIDGE_SECRET');
 assert.equal(out.ok,false);assert.equal(out.error,'unauthorized');
});
test('operator read request intentionally contains action and bridge secret only',()=>{
 const payload={action:'webAdminOpsRead',secret};
 assert.deepEqual(Object.keys(payload).sort(),['action','secret']);
 const output=setup().call(payload.action,payload.secret);
 assert.deepEqual(Object.keys(output).sort(),['ok','readOnly']);
});
