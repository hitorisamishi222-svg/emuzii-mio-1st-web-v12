import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const full=readFileSync(new URL('../GAS_Code_FULL_WEB_OPS_20261030.gs',import.meta.url),'utf8');
const count=s=>(full.match(new RegExp(s,'g'))||[]).length;
function runtime(){
 const context={
   LockService:{getScriptLock(){return {tryLock(){return true},releaseLock(){}}}},
   PropertiesService:{getScriptProperties(){return {getProperty(k){return k==='BRIDGE_SECRET'?'test-bridge-secret':null}}}},
   SpreadsheetApp:{openById(){return {tag:'existing-spreadsheet'}}},
   ContentService:{MimeType:{JSON:'json'},createTextOutput(str){return {text:str,setMimeType(){return this}}}},
   console,Date,
 };
 vm.runInNewContext(full,context);
 context.mioAdminOps_=(ss,d)=>({ok:true,action:d.action,spreadsheet:ss.tag});
 context.gachaWebGateActionInline1030_=(ss,d)=>({ok:true,action:d.action,spreadsheet:ss.tag,gateConfigured:true,normalOpen:false,festOpen:false});
 return context;
}
const post=(ctx,body)=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}).text);
test('one-file full replacement compiles and keeps original functions',()=>{
 assert.doesNotThrow(()=>new vm.Script(full));
 assert.equal(count('function doPost\\('),1);
 for(const f of ['gachaAction_','mioAdminVerifiedTwoBrowserFromCode_','gachaWebGateActionInline1030_','mioAdminOpsGrant_','mioAdminOpsApprove_','mioAdminOpsIntake_','mioAdminOpsRecordGrant_'])assert.equal(count('function '+f+'\\('),1,f);
 assert.match(full,/LOGIN_ID_COL = 21/);
});
test('existing bridge secret is checked before administrator requests',()=>{
 const ctx=runtime();
 const bad=post(ctx,{action:'webAdminOpsGrant',secret:'wrong'});
 assert.equal(bad.error,'unauthorized');
 assert.equal(post(ctx,{action:'webAdminOpsRead',secret:'test-bridge-secret'}).action,'webAdminOpsRead');
 assert.equal(post(ctx,{action:'webAdminOpsGrant',secret:'test-bridge-secret'}).action,'webAdminOpsGrant');
 assert.equal(post(ctx,{action:'webAdminOpsCreate',secret:'test-bridge-secret'}).action,'webAdminOpsCreate');
 assert.equal(post(ctx,{action:'webAdminOpsIntake',secret:'test-bridge-secret'}).action,'webAdminOpsIntake');
});
test('current ON/OFF dispatcher remains available',()=>{
 const ctx=runtime();
 const out=post(ctx,{action:'webGateRead',secret:'test-bridge-secret'});
 assert.equal(out.action,'webGateRead');
 assert.equal(out.gateConfigured,true);
 assert.equal(out.spreadsheet,'existing-spreadsheet');
});
