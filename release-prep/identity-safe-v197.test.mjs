import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.7_MANUAL_IDENTITY_RELEASE.gs',import.meta.url),'utf8');
const webId=n=>'MIO-W-'+n.repeat(24);
const hash=n=>n.repeat(64);
const secret='s'.repeat(40);
function row(values,length=21){const a=Array(length).fill('');for(const [key,val] of Object.entries(values))a[Number(key)]=val;return a}
const original=row({0:webId('a'),1:hash('1'),2:'Alice',5:'承認済み',6:'確認済み',
 7:'MIO-0001',10:'MIO-0001',11:'確認済み',15:'MIO-0001',16:'使用中'});
class Sheet{
 constructor(header,body=[]){this.data=header?[header,...body.map(x=>x.slice())]:[]}
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
 const ss={getSheetByName:name=>tables[name]||null,insertSheet:name=>(tables[name]=new Sheet(null))};
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
 vm.runInNewContext(source,sandbox,{filename:'v196.gs',timeout:3000});
 const call=(action,participantId,tokenHash,name='Alice',extra={})=>{
   const output=sandbox.doPost({postData:{contents:JSON.stringify({
    action,secret,participantId,tokenHash,name,...extra
   })}});
   return JSON.parse(output.value);
 };
 return {tables,call,ss,sandbox};
}

test('new hotfix parses and removes every legacy automatic approval route',()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.doesNotMatch(source,/if\s*\(!submittedLoginId\s*&&\s*safeBase\)/);
 assert.doesNotMatch(source,/var matched=duplicates\.map\(/);
 assert.doesNotMatch(source,/appendBrowserCandidate_\([\s\S]{0,200}'承認済み'/);
 assert.match(source,/if\(duplicates\.length \|\| peopleByName\.length\)/);
});
test('existing signed and approved browser retains status and attached MIO-ID',()=>{
 const h=makeServer();
 const r=h.call('status',webId('a'),hash('1'));
 assert.equal(r.ok,true);
 assert.equal(r.status,'承認済み');
 assert.equal(r.name,'Alice');
 assert.equal(h.tables['emuzii_Web登録'].getLastRow(),2);
 assert.equal(h.tables['emuzii_Web登録'].data[1][7],'MIO-0001');
});
test('same ColorSing nickname can never automatically approve another browser',()=>{
 const h=makeServer();
 const id=webId('b'),token=hash('2');
 const r=h.call('register',id,token,'Alice');
 assert.equal(r.ok,true);assert.equal(r.verified,true);
 assert.equal(r.status,'承認待ち');assert.equal(r.autoApproved,false);
 assert.equal(r.needsIdentityProof,true);
 const newRecord=h.tables['emuzii_Web登録'].data[2];
 assert.equal(newRecord[0],id);
 assert.equal(newRecord[5],'承認待ち');
 assert.equal(newRecord[7],'','no existing MIO-ID assigned');
 assert.equal(newRecord[10],id,'no canonical ID silently assigned');
 assert.equal(newRecord[11],'確認待ち');
 assert.equal(h.tables['emuzii_参加者'].getLastRow(),2);
});
test('legacy eight-character login ID cannot impersonate a participant',()=>{
 const h=makeServer(),id=webId('b'),token=hash('2');
 h.tables['emuzii_Web登録'].data[1][20]='MIO-ABCD-1234';
 const result=h.call('register',id,token,'Alice',{loginId:'MIO-ABCD-1234'});
 assert.equal(result.status,'承認待ち');
 assert.equal(h.tables['emuzii_Web登録'].data[2][5],'承認待ち');
 assert.equal(h.tables['emuzii_Web登録'].data[2][7],'');
});
test('pending browser cannot view history or draw/check in and status never auto-links ID',()=>{
 const h=makeServer(),id=webId('b'),token=hash('2');
 h.call('register',id,token,'Alice');
 const record=h.tables['emuzii_Web登録'].data[2];
 assert.equal(h.call('status',id,token).status,'承認待ち');
 assert.equal(record[7],'','no pending name-only MIO linking on status');
 for(const action of ['catalog','draw','history','checkin']){
  const out=h.call(action,id,token,'Alice',{day:10,keyword:'AAA',drawId:'a'.repeat(32),mode:'通常'});
  assert.equal(out.ok,false,action+' must be denied');
 }
 assert.equal(record[5],'承認待ち');
});
test('same nickname spelling after unicode normalization is still review-only',()=>{
 const h=makeServer();
 const r=h.call('register',webId('b'),hash('2'),'Ａｌｉｃｅ');
 assert.equal(r.status,'承認待ち');
 assert.equal(h.tables['emuzii_Web登録'].data[2][5],'承認待ち');
});
test('nickname appearing only in participant ledger is never auto-approved',()=>{
 const h=makeServer();
 h.tables['emuzii_Web登録'].data.pop();
 const r=h.call('register',webId('b'),hash('2'),'Alice');
 assert.equal(r.status,'承認待ち');
 assert.equal(h.tables['emuzii_Web登録'].data[1][7],'');
});
test('new user without existing name follows standard manual approval',()=>{
 const h=makeServer();
 const result=h.call('register',webId('c'),hash('3'),'Bob');
 assert.equal(result.ok,true);
 assert.equal(result.status,'承認待ち');
 assert.equal(h.tables['emuzii_Web登録'].data[2][5],'承認待ち');
 assert.equal(h.tables['emuzii_参加者'].getLastRow(),2);
});
test('invalid existing token does not inherit existing approved status',()=>{
 const h=makeServer();
 const r=h.call('status',webId('a'),hash('2'));
 assert.equal(r.ok,false);
 assert.equal(h.tables['emuzii_Web登録'].data[1][5],'承認済み');
});
test('legacy browser owner remains approved and not accidentally disabled',()=>{
 const h=makeServer();
 h.tables['emuzii_Web登録'].data[1][8]='別ブラウザ自動承認';
 const r=h.call('status',webId('a'),hash('1'));
 assert.equal(r.ok,true);assert.equal(r.status,'承認済み');
});

test('pending browser re-register cannot acquire an existing participant MIO-ID',()=>{
  const h=makeServer(),id=webId('b'),token=hash('2');
  const pending=h.call('register',id,token,'Alice');
  assert.equal(pending.status,'承認待ち');
  const recovered=h.call('register',id,token,'Alice',{loginId:'MIO-ABCD-1234'});
  assert.equal(recovered.status,'承認待ち');
  assert.equal(recovered.integratedParticipantId,'');
  const rows=h.tables['emuzii_Web登録'].data;
  assert.equal(rows[2][7],'');
  assert.equal(rows[2][10],id);
  assert.equal(rows[2][11],'確認待ち');
});

test('new participant later appearing in roster cannot auto-repair pending browser on re-register',()=>{
  const h=makeServer(),id=webId('b'),token=hash('2');
  h.call('register',id,token,'Bob');
  h.tables['emuzii_参加者'].appendRow(['MIO-0002','Bob']);
  const out=h.call('register',id,token,'Bob');
  assert.equal(out.status,'承認待ち');
  assert.equal(out.integratedParticipantId,'');
  const candidate=h.tables['emuzii_Web登録'].data[2];
  assert.equal(candidate[7],'');
  assert.equal(h.call('status',id,token).status,'承認待ち');
});

test('historically approved but unlinked browser is not silently matched by nickname',()=>{
  const h=makeServer();
  const row=h.tables['emuzii_Web登録'].data[1];
  row[7]='';row[10]='';row[11]='確認待ち';
  const status=h.call('status',webId('a'),hash('1'));
  assert.equal(status.ok,false);
  assert.equal(row[7],'');
  const repeated=h.call('register',webId('a'),hash('1'));
  assert.equal(repeated.integratedParticipantId,'');
  assert.equal(row[7],'');
});

test('v1.9.7 contains no caller that invokes name-based MIO auto-repair',()=>{
  assert.doesNotMatch(source,/=\\s*autoLinkWebParticipant_\\(/);
  assert.doesNotMatch(source,/\\|\\|\\s*autoLinkWebParticipant_\\(/);
  assert.match(source,/function autoLinkWebParticipant_\\([\\s\\S]{0,250}return '';/);
});
