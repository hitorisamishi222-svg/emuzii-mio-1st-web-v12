import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../GAS_WebAdminOps_20261030.gs',import.meta.url),'utf8');
function section(name){
  const start=source.indexOf('function '+name+'(');
  if(start<0)throw Error('missing verified helper '+name);
  const end=source.indexOf('\nfunction ',start+9);
  return source.slice(start,end>=0?end:undefined);
}
const helpers=[
 'mioAdminOps_','mioAdminOpsStr_','mioAdminOpsSheet_',
 'mioAdminOpsSchema_','mioAdminOpsLog_','mioAdminOpsRecordGrant_'
].map(section).join('\n');
const expectedAudit=['日時','操作ID','操作種別','Web参加ID','MIO-ID','変更前','変更後','処理状態','備考','対象名'];

function environment({audit=false,grantHeader=false,wrongHeader=false}={}){
 const writes=[];
 function sheet(name,head){
  return {
   name,
   getLastRow(){return 1},
   getRange(row,col,count=1,width=1){
    return {
      getValues(){
       assert.equal(row,1,'preflight may inspect headers only');
       return [Array.from({length:width},(_,i)=>head[col-1+i]??'')];
      },
      getValue(){return head[col-1]??''},
      setValue(){writes.push('setValue');throw Error('unexpected mutation')},
      setValues(){writes.push('setValues');throw Error('unexpected mutation')}
    }
   }
  };
 }
 const auditSheet=audit?sheet('emuzii_Web管理操作履歴',wrongHeader?expectedAudit.map((x,i)=>i===3?'不一致':x):expectedAudit):null;
 const grants=Array(10).fill('');if(grantHeader)grants[9]='Web操作ID';
 const grantSheet=sheet('emuzii_ガチャ付与履歴',grants);
 const ss={
  getSheetByName(name){return name==='emuzii_Web管理操作履歴'?auditSheet:name==='emuzii_ガチャ付与履歴'?grantSheet:null},
  insertSheet(){writes.push('insertSheet');throw Error('unexpected audit tab creation')}
 };
 const context={};
 vm.runInNewContext(helpers+'\nglobalThis.__f={schema:mioAdminOpsSchema_,ops:mioAdminOps_,log:mioAdminOpsLog_,grant:mioAdminOpsRecordGrant_};',context);
 return {ss,writes,...context.__f};
}

test('missing audit tab and grant J header block all admin writes without structural changes',()=>{
 const e=environment();
 const result=e.schema(e.ss);
 assert.equal(result.schemaReady,false);
 assert.equal(result.auditReady,false);
 assert.equal(result.grantLogReady,false);
 assert.throws(()=>e.ops(e.ss,{action:'webAdminOpsGrant'}),/監査シート/);
 assert.throws(()=>e.log(e.ss),/監査台帳/);
 assert.throws(()=>e.grant(e.ss,'a'.repeat(32),'MIO-9000','架空参加者',1,'確認済み',0,1),/Web操作ID列/);
 assert.deepEqual(e.writes,[],'no sheet or credit write');
});

test('one missing or mismatched header also fails closed',()=>{
 const missingJ=environment({audit:true});
 assert.equal(missingJ.schema(missingJ.ss).schemaReady,false);
 assert.throws(()=>missingJ.ops(missingJ.ss,{action:'webAdminOpsApprove'}),/監査シート/);
 const badAudit=environment({audit:true,grantHeader:true,wrongHeader:true});
 assert.equal(badAudit.schema(badAudit.ss).auditReady,false);
 assert.equal(badAudit.schema(badAudit.ss).grantLogReady,true);
 assert.deepEqual(missingJ.writes,[]);
 assert.deepEqual(badAudit.writes,[]);
});

test('exact existing audit and Web operation ID headers are recognized without writing',()=>{
 const e=environment({audit:true,grantHeader:true});
 const flags=e.schema(e.ss);
 assert.equal(flags.schemaReady,true);
 assert.equal(flags.auditReady,true);
 assert.equal(flags.grantLogReady,true);
 assert.equal(e.log(e.ss).name,'emuzii_Web管理操作履歴');
 assert.deepEqual(e.writes,[]);
});

test('Vercel admin route shows read-only status and cannot expose write button when schema missing',()=>{
 const api=readFileSync(new URL('../api-gacha-admin-ops.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../gacha-admin-ops.js',import.meta.url),'utf8');
 assert.match(api,/writeEnabled:writeEnabled&&result\.schemaReady===true/);
 assert.match(api,/schemaReady:result\.schemaReady===true/);
 assert.match(ui,/state\.schemaReady!==true/);
 assert.match(ui,/監査台帳/);
 const mod=readFileSync(new URL('../GAS_WebAdminOps_20261030.gs',import.meta.url),'utf8');
 assert.doesNotMatch(mod,/ss\.insertSheet\('emuzii_Web管理操作履歴'\)/);
 assert.doesNotMatch(mod,/sh\.getRange\(1,10\)\.setValue\('Web操作ID'\)/);
});
