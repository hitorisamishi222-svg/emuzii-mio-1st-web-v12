// Read-only synthetic GAS execution against the *column layout* observed in
// the existing operational Sheets on 2026-11-09. No actual rows, names or
// participant IDs are copied from production. Do not turn this into a live test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const GAS=readFileSync(new URL('../GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs',import.meta.url),'utf8');
const rows={
 'emuzii_Web登録':[],
 'emuzii_参加者':[],
 'emuzii_ガチャ':[],
 'emuzii_新規簡易登録':[],
 'emuzii_ガチャ付与履歴':[]
};
const headers={
 'emuzii_Web登録':['Web参加ID','認証ハッシュ（変更不可）','ColorSing名','メンシプ申告','登録日時','登録承認','メンシプ確認','照合参加者ID','運営メモ','名前照合状態','統合参加者ID','みお確認','確認日時','端末状態','同名Web登録数','復旧先MIO-ID','運営端末指定','端末整理メモ','整理日時','統合整合チェック','ログインID'],
 'emuzii_参加者':['参加者ID','ColorSing名','予想回答日時','総配信時間予想','歌唱曲数予想','応援コメント','皆勤日数','FA応募数','ガチャ可能回数','備考'],
 'emuzii_ガチャ':['参加者ID','ColorSing名','1ヶ月購入数','3ヶ月購入数','6ヶ月購入数','総ガチャ権利','通常ガチャ手動消費','総残り回数','ラキフェス対象','ラキフェス手動消費','ラキフェス利用可残り（Web4回完了後）','管理メモ','入力チェック','名前チェック','特別付与','Web確定抽選数','ラキフェス状態'],
 'emuzii_新規簡易登録':['登録日時（UTC）','ColorSing名','簡易登録ブラウザID','基本利用','管理確認','備考','',''],
 'emuzii_ガチャ付与履歴':['日時','参加者ID','ColorSing名','付与回数','付与理由','変更前特別付与','変更後特別付与','変更後総権利','変更後残り','']
};
const dimensions={
 'emuzii_Web登録':21,'emuzii_参加者':10,'emuzii_ガチャ':17,
 'emuzii_新規簡易登録':6,'emuzii_ガチャ付与履歴':9
};
function makeSyntheticRows(){
 const fakeName='架空テスト参加者',fakeId='MIO-9001';
 const fakeWeb='MIO-W-'+'f'.repeat(24);
 const web=Array(21).fill('');web[0]=fakeWeb;web[1]='x'.repeat(64);
 web[2]=fakeName;web[5]='承認待ち';web[6]='未確認';
 const person=Array(10).fill('');person[0]=fakeId;person[1]=fakeName;
 const gacha=Array(17).fill('');gacha[0]=fakeId;gacha[1]=fakeName;
 gacha[5]=3;gacha[7]=3;gacha[12]='OK';gacha[13]='OK';gacha[14]=0;
 const intake=['2026-11-08T12:00:00Z',fakeName,'FAKE-BROWSER-ONLY','旧受付','未確認','テスト'];
 const grant=[new Date('2026-11-07T12:00:00Z'),fakeId,fakeName,1,'過去の合成記録',0,1,3,3];
 return {
  'emuzii_Web登録':[web],
  'emuzii_参加者':[person],
  'emuzii_ガチャ':[gacha],
  'emuzii_新規簡易登録':[intake],
  'emuzii_ガチャ付与履歴':[grant]
 };
}
function buildMock(data=rows){
 const writes=[],reads=[],names=new Set(Object.keys(headers));
 const sheets={};
 for(const name of names){
  const h=headers[name],body=data[name]||[];
  sheets[name]={
   getLastRow(){return body.length+1},
   getRange(row,col,height=1,width=1){
    reads.push({name,row,col,height,width});
    assert.ok(row>=1&&col>=1&&height>=0&&width>=1);
    assert.ok(col+width-1<=h.length, 'out of bounds: '+name);
    return {
     getValues(){
      const all=[h,...body];
      return all.slice(row-1,row-1+height).map(x=>x.slice(col-1,col-1+width));
     },
     setValue(){writes.push('setValue');throw Error('MUTATION_FORBIDDEN')},
     setValues(){writes.push('setValues');throw Error('MUTATION_FORBIDDEN')}
    };
   },
   appendRow(){writes.push('appendRow');throw Error('MUTATION_FORBIDDEN')}
  };
 }
 const book={
  getSheetByName(name){return name==='emuzii_Web管理操作履歴'?null:sheets[name]||null},
  insertSheet(){writes.push('insertSheet');throw Error('MUTATION_FORBIDDEN')}
 };
 const env={
  Date,Math,String,Number,JSON,
  SpreadsheetApp:{
   openById:()=>book,
   flush(){writes.push('flush');throw Error('MUTATION_FORBIDDEN')}
  },
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='BRIDGE_SECRET'?'SYNTHETIC_SECRET_NO_PRODUCTION':null})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return {text:s}}})}
 };
 vm.runInNewContext(GAS,env,{timeout:3500});
 return {
  read(action='webAdminOpsRead',secret='SYNTHETIC_SECRET_NO_PRODUCTION'){
   const value=env.doPost({postData:{contents:JSON.stringify({action,secret})}});
   return JSON.parse(value.text);
  },writes,reads
 };
}
test('saved live schema snapshot has all five required read tabs and expected columns',()=>{
 for(const [name,width] of Object.entries(dimensions))assert.ok(headers[name].length>=width,name);
 assert.equal(headers['emuzii_Web登録'][20],'ログインID');
 assert.equal(headers['emuzii_ガチャ'][14],'特別付与');
 assert.equal(headers['emuzii_ガチャ付与履歴'][9],'');
 assert.equal(headers['emuzii_新規簡易登録'][4],'管理確認');
});
test('management read returns synthetic rows while audit tab and Web操作ID are absent',()=>{
 const env=buildMock(makeSyntheticRows()),r=env.read();
 assert.equal(r.ok,true);
 assert.equal(r.pending.length,1);
 assert.equal(r.roster.length,1);
 assert.equal(r.simple.length,1);
 assert.equal(r.grants.length,1);
 assert.equal(r.schemaReady,false);
 assert.equal(r.auditReady,false);
 assert.equal(r.grantLogReady,false);
 assert.equal(r.roster[0].needsReview,false);
 assert.deepEqual(env.writes,[]);
 assert.ok(env.reads.some(x=>x.name==='emuzii_ガチャ付与履歴'&&x.row===1&&x.col===10));
});
test('read works for empty registration, gacha and historical ledger rows without writes',()=>{
 const env=buildMock(),r=env.read();
 assert.equal(r.ok,true);
 assert.equal(r.totalPending,0);
 assert.equal(r.roster.length,0);
 assert.equal(r.grants.length,0);
 assert.equal(r.schemaReady,false);
 assert.deepEqual(env.writes,[]);
});
test('bad shared secret fails before the workbook is inspected',()=>{
 const env=buildMock(makeSyntheticRows()),r=env.read('webAdminOpsRead','WRONG_FAKE_SECRET');
 assert.equal(r.ok,false);
 assert.equal(r.error,'unauthorized');
 assert.deepEqual(env.reads,[]);
 assert.deepEqual(env.writes,[]);
});
