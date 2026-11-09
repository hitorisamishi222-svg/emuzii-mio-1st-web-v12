import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Synthetic rows shaped like the verified operational ledger (no participant
// names, IDs, tokens, membership purchases, entitlements or actual results).
const GAS=readFileSync(new URL('../GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs',import.meta.url),'utf8');
const pad=i=>String(i).padStart(4,'0');
const names=i=>'架空参加者'+pad(i);
const id=i=>'MIO-'+pad(i);
const webId=i=>'MIO-W-'+i.toString(16).padStart(24,'0');

function makeRows(){
 const sheetRows={
  'emuzii_Web登録':[],
  'emuzii_参加者':[],
  'emuzii_ガチャ':[],
  'emuzii_新規簡易登録':[],
  'emuzii_ガチャ付与履歴':[]
 };
 for(let i=1;i<=51;i++){
   const p=Array(10).fill('');p[0]=id(i);p[1]=names(i);
   const g=Array(17).fill('');g[0]=id(i);g[1]=names(i);
   g[5]=10;g[7]=3;g[12]='OK';g[13]='OK';g[14]=2;
   sheetRows['emuzii_参加者'].push(p);
   sheetRows['emuzii_ガチャ'].push(g);
 }
 for(let i=1;i<=50;i++){
   const w=Array(21).fill('');w[0]=webId(i);w[2]=names(i);
   w[5]=i<=48?'承認済み':'却下';w[6]='確認済み';
   w[7]=id(i);w[10]=id(i);w[11]='確認済み';w[16]='使用中';
   sheetRows['emuzii_Web登録'].push(w);
 }
 // All six are historical records and must remain display-only.
 const statuses=['動作確認用','動作確認用','動作確認用','動作確認用','本人確認・登録承認済み','登録承認済み'];
 for(let i=0;i<6;i++)sheetRows['emuzii_新規簡易登録'].push([
  '2026-10-25T12:00:00.000Z',names(i+1),'','旧受付',statuses[i],'過去の記録'
 ]);
 for(let i=1;i<=7;i++){
   const row=Array(9).fill('');row[1]=id(i);row[2]=names(i);row[3]=1;row[4]='確認済み';
   sheetRows['emuzii_ガチャ付与履歴'].push(row);
 }
 return sheetRows;
}
function createRuntime(sheetRows){
 const writes=[],reads=[];
 const sheets={};
 for(const [name,rows] of Object.entries(sheetRows)){
  sheets[name]={
   getLastRow(){reads.push({name,type:'lastRow'});return rows.length+1},
   getRange(start,col,n=1,width=1){
    reads.push({name,type:'range',start,col,n,width});
    assert.ok(start>=1&&col>=1&&n>=0&&width>=1,'no invalid sheet range');
    return {
     getValues(){return rows.slice(start-2,start-2+n).map(r=>r.slice(col-1,col-1+width))},
     setValue(){writes.push({name,type:'setValue'});throw Error('read-only violation')},
     setValues(){writes.push({name,type:'setValues'});throw Error('read-only violation')}
    };
   }
  };
 }
 const mock={
  Date,Math,String,Number,JSON,
  SpreadsheetApp:{openById(){return {getSheetByName(name){if(name==='emuzii_Web管理操作履歴')return null;if(!sheets[name])throw Error('unknown sheet '+name);return sheets[name]},insertSheet(){writes.push({type:'insertSheet'});throw Error('read-only violation')}}},flush(){writes.push({type:'flush'});throw Error('read-only violation')}},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput(text){return {setMimeType(){return {text}}}}},
  LockService:{getScriptLock(){return {tryLock(){return true},releaseLock(){}}}},
  PropertiesService:{getScriptProperties(){return {getProperty(key){return key==='BRIDGE_SECRET'?'synthetic-test-only':''}}}}
 };
 vm.runInNewContext(GAS,mock,{timeout:4000});
 function read(secret='synthetic-test-only'){
  const raw=mock.doPost({postData:{contents:JSON.stringify({action:'webAdminOpsRead',secret})}});
  return JSON.parse(raw.text);
 }
 return {read,writes,reads};
}
test('51 synthetic users, 50 browser rows, 7 history rows and old 6 intakes read without writes',()=>{
 const rows=makeRows(),runtime=createRuntime(rows);
 const r=runtime.read();
 assert.equal(r.ok,true);
 assert.equal(r.roster.length,51);
 assert.equal(r.approvedBrowsers.length,48);
 assert.equal(r.pending.length,0);
 assert.equal(r.rejectedCount,2);
 assert.equal(r.simple.length,6);
 assert.equal(r.grants.length,7);
 assert.equal(r.totalPending,0);
 assert.equal(r.roster.filter(x=>x.needsReview).length,0);
 assert.equal(r.roster[0].gacha.remaining,3);
 assert.ok(r.simple.every(x=>x.status!=='未確認'&&x.status!=='管理確認待ち'));
 assert.deepEqual(runtime.writes,[]);
 assert.ok(runtime.reads.some(x=>x.name==='emuzii_ガチャ'));
});
test('duplicate IDs, negative rights and overdrawn credits fail closed for individual grant UI',()=>{
 const rows=makeRows();
 rows['emuzii_ガチャ'].push([...rows['emuzii_ガチャ'][0]]);
 rows['emuzii_ガチャ'][1][7]=-1;
 rows['emuzii_ガチャ'][2][7]=11;
 const runtime=createRuntime(rows),r=runtime.read();
 assert.equal(r.ok,true);
 assert.equal(r.roster.length,51,'no duplicate participant roster');
 assert.equal(r.roster.filter(x=>x.needsReview).length,3);
 assert.equal(r.roster[0].gacha,null);
 assert.equal(r.roster[1].gacha,null);
 assert.equal(r.roster[2].gacha,null);
 assert.equal(r.roster[3].needsReview,false);
 assert.deepEqual(runtime.writes,[]);
});
test('read with bad shared secret is rejected without touching any sheet',()=>{
 const runtime=createRuntime(makeRows());
 const r=runtime.read('wrong-secret');
 assert.equal(r.ok,false);
 assert.equal(r.error,'unauthorized');
 assert.deepEqual(runtime.reads,[]);
 assert.deepEqual(runtime.writes,[]);
});


// Observed existing workbook: 51 distinct gacha ID rows coexist with hundreds
// of prefilled/empty rows. This fixture holds NO actual customer data.
test('production-shaped 498 gacha rows with 51 valid IDs ignore empty prefilled rows',()=>{
 const rows=makeRows();
 const gacha=rows['emuzii_ガチャ'];
 assert.equal(gacha.length,51);
 while(gacha.length<498){
  const padded=Array(17).fill('');
  if(gacha.length%3===0){padded[5]=0;padded[7]=0;padded[14]=0;}
  gacha.push(padded);
 }
 const runtime=createRuntime(rows),r=runtime.read();
 assert.equal(r.ok,true);
 assert.equal(r.roster.length,51);
 assert.equal(r.roster.filter(x=>x.gacha!==null).length,51);
 assert.equal(r.roster.filter(x=>x.needsReview).length,0);
 assert.equal(r.approvedBrowsers.length,48);
 assert.equal(r.rejectedCount,2);
 assert.equal(r.grants.length,7);
 assert.equal(r.pending.length,0);
 assert.deepEqual(runtime.writes,[]);
 assert.ok(runtime.reads.some(x=>x.name==='emuzii_ガチャ'&&x.n===498&&x.width===17));
});
