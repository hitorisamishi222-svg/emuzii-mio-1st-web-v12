// Regression checks for the Google Apps Script device handover module.
// Run: node test-device-switch-v189.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sandbox={console,Date,JSON,Number,Math,String,Array,Error};
vm.createContext(sandbox);
for(const name of ['APPS_SCRIPT_Code_v1.8.7_NO_BACKUP.gs','APPS_SCRIPT_DeviceRecovery_v1.8.7_NO_BACKUP.gs']){
  vm.runInContext(fs.readFileSync(name,'utf8'),sandbox,{filename:name});
}
const make=(webId,name,mioId,status,member,device,confirmed='確認済み')=>{
  const r=new Array(20).fill('');
  r[0]=webId;r[2]=name;r[4]=new Date('2026-10-08T04:00:00Z');
  r[5]=status;r[6]=member;r[7]=mioId;r[10]=mioId;r[11]=confirmed;
  r[15]=mioId;r[16]=device;return r;
};
function fakeSheet(rows){
  const ss={};
  const sheet={
    getParent:()=>ss,
    getName:()=> 'emuzii_Web登録',
    getRange:(row,col)=>{
      const idx=row-2,j=col-1;
      return {
        setValue(value){rows[idx][j]=value;},
        getValue(){return rows[idx][j];},
        getDisplayValue(){return String(rows[idx][j]??'');}
      };
    }
  };
  const auditLog=[['header']];
  const audit={
    appendRow:r=>auditLog.push(r),
    getLastRow:()=>auditLog.length,
    getRange:(row,col)=>({setValue:v=>{auditLog[row-1][col-1]=v;}})
  };
  ss.getSheetByName=(name)=>name==='emuzii_Web登録'?sheet:name==='emuzii_端末切替履歴'?audit:null;
  sandbox.webActualRows_=()=>rows;
  sandbox.rows_=(ss,name)=>name==='emuzii_参加者'?[
    ['MIO-0013','Maverick'],['MIO-0020','Maverick']
  ]:[];
  sandbox.ensureWebDerivedRow_=()=>{};
  sandbox.SpreadsheetApp={openById:()=>ss,flush:()=>{}};
  sandbox.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  return {ss,sheet,auditLog};
}
{
  const rows=[
    make('OLD','Maverick','MIO-0013','承認済み','確認済み','使用中'),
    make('NEW','Maverick','MIO-0013','承認待ち','未確認',''),
    make('OTHER','Maverick','MIO-0020','承認済み','確認済み','使用中')
  ];
  const {ss,auditLog}=fakeSheet(rows);
  assert.equal(sandbox.activeWebDeviceErrorV189_(null,rows[0]),'');
  assert.equal(sandbox.activeWebDeviceErrorV189_(null,rows[2]),'');
  const dup=sandbox.collectDuplicateReviewV189_(ss);
  assert.equal(dup.length,3);
  assert.equal(dup[0].sameName,3);
  assert.equal(dup[0].sameMio,2);
  assert.throws(()=>sandbox.switchApprovedWebRegistrationV189_('NEW','MIO-0020'),/MIO-ID/);
  assert.equal(rows[0][5],'承認済み');
  const result=sandbox.switchApprovedWebRegistrationV189_('NEW','MIO-0013');
  assert.equal(result.ok,true);
  assert.equal(rows[0][5],'却下');
  assert.equal(rows[0][16],'旧端末');
  assert.equal(rows[1][5],'承認済み');
  assert.equal(rows[1][16],'使用中');
  assert.equal(rows[1][6],'確認済み','membership transferred');
  assert.equal(rows[2][5],'承認済み','same-name different MIO preserved');
  assert.match(sandbox.activeWebDeviceErrorV189_(null,rows[0]),/旧端末/);
  assert.equal(auditLog.at(-1)[6],'完了');
}
{
  const rows=[
    make('OLD','Maverick','MIO-0013','承認済み','確認済み','使用中'),
    make('NEW','Maverick','MIO-0013','承認済み','未確認','')
  ];
  const {sheet}=fakeSheet(rows);
  const range={getNumRows:()=>1,getNumColumns:()=>1,getSheet:()=>sheet,getRow:()=>3,getColumn:()=>6};
  sandbox.webRecoveryOnEdit_({range,value:'承認済み',oldValue:'承認待ち'});
  assert.equal(rows[0][5],'承認済み','existing registration must remain usable');
  assert.equal(rows[1][5],'承認待ち','new registration must wait for explicit manager choice');
}
{
  const rows=[
    make('A','Maverick','MIO-0013','承認済み','確認済み','使用中'),
    make('B','Maverick','MIO-0013','承認済み','確認済み','使用中')
  ];
  fakeSheet(rows);
  assert.equal(sandbox.activeWebDeviceErrorV189_(null,rows[0]),'');
  assert.equal(sandbox.activeWebDeviceErrorV189_(null,rows[1]),'');
}
{
  const rows=[
    make('PENDING-A','Maverick','MIO-0013','承認済み','未確認',''),
    make('PENDING-B','Maverick','MIO-0013','承認待ち','未確認','')
  ];
  const {sheet}=fakeSheet(rows);
  const range={getNumRows:()=>1,getNumColumns:()=>1,getSheet:()=>sheet,getRow:()=>2,getColumn:()=>6};
  sandbox.webRecoveryOnEdit_({range,value:'承認済み',oldValue:'承認待ち'});
  assert.equal(rows[0][5],'承認待ち','first of two pending registrations must be manager-reviewed');
  assert.equal(rows[1][5],'承認待ち');
}
console.log('PASS: existing duplicates remain active, explicit safe switch, membership, same-name safety, audit');
