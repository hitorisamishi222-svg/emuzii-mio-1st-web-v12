import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.3_BROWSER_IDENTITY_LAYER.gs',import.meta.url),'utf8');
const webId=n=>'MIO-W-'+n.repeat(24);
const hash=n=>n.repeat(64);
const secret='s'.repeat(40);
function row(values,length=21){const a=Array(length).fill('');for(const [key,val] of Object.entries(values))a[Number(key)]=val;return a}
const original=row({0:webId('a'),1:hash('1'),2:'Alice',5:'承認済み',6:'確認済み',
 7:'MIO-0001',10:'MIO-0001',11:'確認済み',15:'MIO-0001',16:'使用中'});
class Sheet{
 constructor(header,body=[]){this.data=[header,...body.map(x=>x.slice())]}
 getLastRow(){return this.data.length}
 getLastColumn(){return this.data[0]?.length||1}
 getMaxRows(){return Math.max(10,this.getLastRow())}
 getRange(r,c,n=1,m=1){
  if(typeof r==='string')return {setDataValidation:()=>{},getValue:()=>''};
  const sh=this;
  const view=()=>Array.from({length:n},(_,i)=>
    Array.from({length:m},(_,j)=>sh.data[r-1+i]?.[c-1+j]??''));
  function put(v){while(sh.data.length<r)sh.data.push([]);
    if(!sh.data[r-1])sh.data[r-1]=[];
    sh.data[r-1][c-1]=v;return this}
  return {
   getValues:view,getDisplayValues:()=>view().map(x=>x.map(String)),
   getValue:()=>view()[0][0],getDisplayValue:()=>String(view()[0][0]),
   setValue:put,setFormula:put,
   setValues(v){for(let i=0;i<v.length;i++)for(let j=0;j<v[i].length;j++){
     while(sh.data.length<r+i)sh.data.push([]);
     sh.data[r+i-1][c+j-1]=v[i][j];
    }return this},
   setDataValidation(){return this},clearContent(){return this}
  };
 }
 setFrozenRows(){}setColumnWidth(){}
 appendRow(a){this.data.push(a.slice())}
}
function makeServer(){
 const tables={
  'emuzii_Web登録':new Sheet(row({20:'ログインID'}),[original]),
  'emuzii_参加者':new Sheet(['参加者ID','ColorSing名'],[['MIO-0001','Alice']])
 };
 const ss={getSheetByName:name=>tables[name]||null,insertSheet:name=>(tables[name]=new Sheet(['']))};
 const properties={getProperty:key=>key==='BRIDGE_SECRET'?secret:undefined};
 const sandbox={
  SpreadsheetApp:{openById:()=>ss,flush:()=>{},newDataValidation:()=>({
    requireValueInList(){return this},setAllowInvalid(){return this},build(){return {}}
  })},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>properties},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput:value=>({
    value,setMimeType(){return this}
  })},
  Utilities:{getUuid:()=> '11111111-2222-3333-4444-555555555555',
    formatDate:()=> '2026-10-10',sleep(){}}
 };
 vm.runInNewContext(source,sandbox,{filename:'v193.gs',timeout:3000});
 const call=(action,participantId,tokenHash,name='Alice')=>{
   const output=sandbox.doPost({postData:{contents:JSON.stringify({
    action,secret,participantId,tokenHash,name
   })}});
   return JSON.parse(output.value);
 };
 return {tables,call,ss,sandbox};
}
test('source compiles and never has a name-only auto-approved branch',()=>{
 assert(!/if\s*\(!submittedLoginId\s*&&\s*safeBase\)/.test(source));
 assert.match(source,/BROWSER_REQUEST_TAB/);
 assert.match(source,/browserIdentityFor_/);
});
test('existing approved browser keeps access without any migration',()=>{
 const h=makeServer();
 const result=h.call('status',webId('a'),hash('1'));
 assert.equal(result.ok,true);assert.equal(result.status,'承認済み');
 assert.equal(result.name,'Alice');
 assert.equal(h.tables['emuzii_Web登録'].getLastRow(),2);
});
test('same-name browser is review-only and does not create a second participant',()=>{
 const h=makeServer(),id=webId('b'),token=hash('2');
 const response=h.call('register',id,token);
 assert.equal(response.ok,true);assert.equal(response.status,'承認待ち');
 assert.equal(h.tables['emuzii_Web登録'].getLastRow(),2);
 const requests=h.tables['emuzii_ブラウザ接続申請'];
 assert.equal(requests.getLastRow(),2);
 assert.equal(requests.data[1][3],'','suggested ID is NOT an authorization');
 assert.equal(requests.data[1][4],'確認待ち');
 assert.equal(requests.data[1][8],'MIO-0001','candidate visible for admin');
 assert.equal(h.call('status',id,token).status,'承認待ち');
 assert.equal(h.call('checkin',id,token).ok,false);
 assert.equal(h.call('draw',id,token).ok,false);
 assert.equal(h.call('history',id,token).ok,false);
 assert.equal(h.call('register',id,token).status,'承認待ち');
 assert.equal(requests.getLastRow(),2,'retry never creates a duplicate request');
});
test('approving state without explicitly binding canonical MIO-ID remains blocked',()=>{
 const h=makeServer(),id=webId('b'),token=hash('2');
 h.call('register',id,token);
 h.tables['emuzii_ブラウザ接続申請'].data[1][4]='承認済み';
 assert.equal(h.call('status',id,token).status,'承認待ち');
 assert.equal(h.call('draw',id,token).ok,false);
});
test('after operator verifies and binds MIO-ID, status resolves existing history owner',()=>{
 const h=makeServer(),id=webId('b'),token=hash('2');
 h.call('register',id,token);
 const request=h.tables['emuzii_ブラウザ接続申請'].data[1];
 request[3]='MIO-0001';request[4]='承認済み';
 const result=h.call('status',id,token);
 assert.equal(result.ok,true);
 assert.equal(result.status,'承認済み');assert.equal(result.name,'Alice');
 assert.equal(result.participantId,id,'signed browser ID remains stable');
 assert.equal(h.tables['emuzii_Web登録'].getLastRow(),2,'no duplicated entitlement row');
 assert.equal(h.tables['emuzii_参加者'].getLastRow(),2,'canonical identity remains unchanged');
});
test('wrong identity link, a revoked claim, and wrong token stay denied',()=>{
 const h=makeServer(),id=webId('b'),token=hash('2');
 h.call('register',id,token);
 const claim=h.tables['emuzii_ブラウザ接続申請'].data[1];
 claim[3]='MIO-0002';claim[4]='承認済み';
 assert.equal(h.call('status',id,token).status,'承認待ち');
 claim[3]='MIO-0001';claim[4]='却下';
 assert.equal(h.call('status',id,token).status,'却下');
 assert.equal(h.call('history',id,token).ok,false);
 claim[4]='承認済み';
 assert.equal(h.call('status',id,hash('3')).ok,false);
});
test('unknown user still enters existing new-user approval workflow',()=>{
 const h=makeServer();
 const response=h.call('register',webId('c'),hash('3'),'New User');
 assert.equal(response.ok,true);
 assert.equal(response.status,'承認待ち');
 assert.equal(h.tables['emuzii_Web登録'].getLastRow(),3);
 assert.equal(h.tables['emuzii_ブラウザ接続申請'],undefined);
});
