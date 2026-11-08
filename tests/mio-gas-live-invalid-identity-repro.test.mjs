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


// MIO_REAL_GAS_SYNTHETIC_READ_NO_WRITE_20261109
// Exercise the unmodified real GAS admin handler (not the simplified override
// above) against synthetic, read-only Sheets. This is NOT a live deployment test.
function realOpsFixture(){
 let writes=0,lockReleases=0;
 const forbidden=()=>{writes++;throw Error('Unexpected workbook or script write');};
 const filled=(length,entries={})=>{
  const r=Array(length).fill('');
  for(const [index,value] of Object.entries(entries))r[Number(index)]=value;
  return r;
 };
 const id='MIO-0001',name='SYNTHETIC_TEST_ONLY';
 const sheets=new Map([
  ['emuzii_参加者',[filled(10),filled(10,{0:id,1:name})]],
  ['emuzii_ガチャ',[filled(17),filled(17,{0:id,1:name,5:3,7:2,12:'OK',13:'OK',14:0})]],
  ['emuzii_Web登録',[filled(21),filled(21,{0:'MIO-W-'+'a'.repeat(24),2:name,5:'承認済み',6:'確認済み',7:id,10:id,11:'確認済み',15:id,16:'使用中'})]],
  ['emuzii_新規簡易登録',[filled(6)]],
  // Realistic pre-migration state: A:I are present and J1 is blank.
  ['emuzii_ガチャ付与履歴',[filled(10,{0:'日時',1:'参加者ID',2:'ColorSing名',3:'付与回数',4:'付与理由',5:'変更前特別付与',6:'変更後特別付与',7:'変更後総権利',8:'変更後残り'}),filled(10,{1:id,2:name,3:1,4:'TEST_ONLY'})]]
 ]);
 const book=Object.freeze({
  getSheetByName(key){
   const cells=sheets.get(key);
   if(!cells)return null;
   return Object.freeze({
    getLastRow:()=>cells.length,
    getRange(row,col,height=1,width=1){
     return Object.freeze({
      getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>cells[row+i-1]?.[col+j-1]??'')),
      getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>String(cells[row+i-1]?.[col+j-1]??''))),
      setValue:forbidden,setValues:forbidden,setFormula:forbidden,clearContent:forbidden,
      setDataValidation:forbidden
     });
    },
    appendRow:forbidden,deleteRow:forbidden,clear:forbidden
   });
  },
  insertSheet:forbidden,deleteSheet:forbidden
 });
 const ctx={
  console,Date,
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{lockReleases++}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='BRIDGE_SECRET'?secret:null,setProperty:forbidden})},
  SpreadsheetApp:{openById:()=>book,flush:forbidden},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return JSON.parse(s)}})}
 };
 vm.createContext(ctx);
 vm.runInContext(combined,ctx,{timeout:1500});
 const call=(action='webAdminOpsRead',suppliedSecret=secret)=>ctx.doPost({
  postData:{contents:JSON.stringify({action,secret:suppliedSecret})}
 });
 return {call,stats:()=>({writes,lockReleases})};
}
test('actual GAS management read works before audit migration and never writes synthetic sheets',()=>{
 const t=realOpsFixture();
 const data=t.call();
 assert.equal(data.ok,true);
 assert.equal(data.schemaReady,false);
 assert.equal(data.auditReady,false);
 assert.equal(data.grantLogReady,false);
 assert.equal(data.pending.length,0);
 assert.equal(data.roster.length,1);
 assert.equal(data.roster[0].needsReview,false);
 assert.equal(data.approvedBrowsers.length,1);
 assert.equal(data.grants.length,1);
 assert.deepEqual(t.stats(),{writes:0,lockReleases:1});
});

test('actual GAS management grant is blocked without schema, even with correct secret',()=>{
 const t=realOpsFixture();
 assert.throws(()=>t.call('webAdminOpsGrant'),/監査シートとWeb操作ID列/);
 assert.deepEqual(t.stats(),{writes:0,lockReleases:1});
});

test('actual GAS denies unauthenticated management reads before consulting workbook',()=>{
 const t=realOpsFixture();
 const answer=t.call('webAdminOpsRead','WRONG_SYNTHETIC_SECRET');
 assert.equal(answer.ok,false);
 assert.equal(answer.error,'unauthorized');
 assert.deepEqual(t.stats(),{writes:0,lockReleases:1});
});
