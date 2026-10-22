import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../Code.gs',import.meta.url),'utf8');
const ID='MIO-0010',OLD_ID='MIO-0040';
const OLD_BROWSER='MIO-W-111111111111111111111111';
const ORIGINAL_BROWSER='MIO-W-222222222222222222222222';
const LIGHT_BROWSER='MIO-W-333333333333333333333333';
const HASH='a'.repeat(64),SECRET='test-secret';
const ALIAS='Singer✨',ORIGINAL='Singer';

function fixture(){
 const sheets={
  emuzii_参加者:[
   ['id','name','prediction'],[ID,ORIGINAL,'2026/10/10'],[OLD_ID,ALIAS,'']
  ],
  emuzii_本人統合:[
   ['canonical','source','alias','approved','','','browser'],
   [ID,OLD_ID,ALIAS,'確認済み','','',LIGHT_BROWSER]
  ],
  emuzii_Web登録:[
   ['id','hash','name','membership','date','status','member','linkedId','note','review','canonical','reviewedAt'],
   [ORIGINAL_BROWSER,'b'.repeat(64),ORIGINAL,'','','承認済み','未確認',ID,'','既存一致',ID,'確認済み'],
   [OLD_BROWSER,'c'.repeat(64),ALIAS,'','','承認済み','未確認',OLD_ID,'','既存一致',OLD_ID,'確認済み']
  ],
  emuzii_皆勤31日:[
   Array.from({length:35},(_,i)=>i===0?'id':i===1?'name':'day'),
   [ID,ORIGINAL,...Array(31).fill(''),0,''],
   [OLD_ID,ALIAS,...Array(31).fill(''),0,'']
  ],
  emuzii_ガチャ:[
   Array.from({length:17},(_,i)=>String(i)),
   [ID,ORIGINAL,1,0,0,1,0,0,0,0,0,'','OK','OK',0,0,''],
   [OLD_ID,ALIAS,1,0,0,1,0,0,0,0,0,'','OK','OK',0,0,'']
  ],
  emuzii_FA:[
   Array(13).fill('header'),
   ...['FA1','FA2','FA3'].map((id,i)=>[id,ALIAS,i+1,'','','','','','','','受付'])
  ],
  emuzii_当選履歴:[
   ['drawId','browserId','participantId','name','mode','prizeId','prizeName','chance','date','num','result'],
   ['draw-one',OLD_BROWSER,OLD_ID,ALIAS,'通常','p1','prize',1,'2026/10/20',1,'確定']
  ]
 };
 const ss={
  getSheetByName(name){
   const rows=sheets[name]; if(!rows)return null;
   return {
    getLastRow(){return rows.length},
    getLastColumn(){return rows[0].length},
    getRange(row,col,height=1,width=1){
     return {
      getValues(){return rows.slice(row-1,row-1+height).map(r=>
       Array.from({length:width},(_,i)=>r[col+i-1]??''))},
      getDisplayValues(){return this.getValues().map(r=>r.map(String))},
      getValue(){return this.getValues()[0][0]},
      getDisplayValue(){return String(this.getValue())},
      setValue(value){rows[row-1][col-1]=value}
     };
    },
    appendRow(values){rows.push(values)}
   };
  }
 };
 const sandbox={
  SpreadsheetApp:{openById(){return ss},flush(){}},
  LockService:{getScriptLock(){return {tryLock(){return true},releaseLock(){}}}},
  PropertiesService:{getScriptProperties(){return{getProperty(){return SECRET}}}},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput(body){return{body,setMimeType(){return this}}}},
  Utilities:{formatDate(){return '2026-10-22'}}
 };
 const context=vm.createContext(sandbox);
 vm.runInContext(source,context,{filename:'Code.gs'});
 const send=(action,payload={})=>JSON.parse(context.doPost({
  postData:{contents:JSON.stringify({secret:SECRET,action,
   participantId:LIGHT_BROWSER,tokenHash:HASH,...payload})}
 }).body);
 return {sheets,send,context};
}

test('light enrollment only activates for administrator-reviewed alias',()=>{
 const f=fixture(),initial=f.sheets.emuzii_Web登録.length;
 assert.equal(f.send('integrateLight',{name:'Someone else',integratedParticipantId:ID}).ok,false);
 assert.equal(f.send('integrateLight',{name:ALIAS,integratedParticipantId:OLD_ID}).ok,false);
 assert.equal(f.sheets.emuzii_Web登録.length,initial);
 const first=f.send('integrateLight',{name:ALIAS,integratedParticipantId:ID});
 assert.equal(first.ok,true);
 assert.equal(first.created,true);
 assert.equal(f.sheets.emuzii_Web登録.length,initial+1);
 const again=f.send('integrateLight',{name:ALIAS,integratedParticipantId:ID});
 assert.equal(again.ok,true);
 assert.equal(again.created,false);
 assert.equal(f.sheets.emuzii_Web登録.length,initial+1);
 const conflict=f.send('integrateLight',{name:ALIAS,integratedParticipantId:ID,tokenHash:'d'.repeat(64)});
 assert.equal(conflict.ok,false);
 assert.equal(f.sheets.emuzii_Web登録.at(-1)[1],HASH);
});

test('new, old-alias and original browsers share one canonical identity and three artworks',()=>{
 const f=fixture();
 assert.equal(f.send('integrateLight',{name:ALIAS,integratedParticipantId:ID}).ok,true);
 for(const [participantId,tokenHash] of [
  [LIGHT_BROWSER,HASH],[OLD_BROWSER,'c'.repeat(64)],[ORIGINAL_BROWSER,'b'.repeat(64)]
 ]){
  const d=f.send('status',{participantId,tokenHash});
  assert.equal(d.ok,true);
  assert.equal(d.integratedParticipantId,ID);
  assert.equal(d.progress.prediction,true);
  assert.equal(d.progress.fa,3);
  assert.equal(d.attendanceLinked,true);
  assert.ok(Array.isArray(d.progress.attendanceConfirmedDays));
  assert.ok(Array.isArray(d.progress.attendanceLockedDays));
  assert.equal(d.progress.gacha.remaining,0);
 }
});

test('old winner records remain visible; no second prize entitlement is created',()=>{
 const f=fixture();
 assert.equal(f.send('integrateLight',{name:ALIAS,integratedParticipantId:ID}).ok,true);
 const history=f.send('history');
 assert.equal(history.ok,true);
 assert.equal(history.history.length,1);
 assert.equal(history.history[0].drawId,'draw-one');
});

test('identity integration does not rewrite source attendance, predictions, artwork, or prize rows',()=>{
 const f=fixture();
 const protectedTabs=['emuzii_参加者','emuzii_FA','emuzii_皆勤31日','emuzii_ガチャ','emuzii_当選履歴'];
 const before=protectedTabs.map(name=>JSON.stringify(f.sheets[name]));
 assert.equal(f.send('integrateLight',{name:ALIAS,integratedParticipantId:ID}).ok,true);
 const status=f.send('status');
 assert.equal(status.ok,true);
 protectedTabs.forEach((name,i)=>assert.equal(JSON.stringify(f.sheets[name]),before[i]));
});

test('non-admin alias, wrong token, or wrong canonical ID cannot gain access',()=>{
 const f=fixture();
 f.sheets.emuzii_本人統合[1][3]='未確認';
 assert.equal(f.send('integrateLight',{name:ALIAS,integratedParticipantId:ID}).ok,false);
 f.sheets.emuzii_本人統合[1][3]='確認済み';
 assert.equal(f.send('integrateLight',{name:ALIAS,integratedParticipantId:ID}).ok,true);
 assert.equal(f.send('status',{tokenHash:'d'.repeat(64)}).ok,false);
 assert.equal(f.send('status',{participantId:OLD_BROWSER,tokenHash:'c'.repeat(64)}).integratedParticipantId,ID);
});
