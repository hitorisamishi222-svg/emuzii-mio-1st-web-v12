/**
 * Focused recovery tests, independent of production.
 * Executes staged GAS gachaAction_ against isolated in-memory Sheets.
 * Use: MIO_GACHA_CORE_PATH=../gacha-core/Code.gs node --test tests/gacha-retry-recovery.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const path=process.env.MIO_GACHA_CORE_PATH;
if(!path)throw Error('Set MIO_GACHA_CORE_PATH to a staged Code.gs file');
const code=readFileSync(path,'utf8');
function fixture(){
 const webid='MIO-W-'+'a'.repeat(24),identity='MIO-SYNTH',name='TEST_ONLY',drawId='d'.repeat(32);
 const prizes=[
  ['通常','N01','test normal','R',100,true,'','https://example.invalid/normal.jpg','',''],
  ['ラキフェス','F01','test festival','R',100,true,'','https://example.invalid/festival.jpg','','']
 ];
 const history=[],data={
  'emuzii_参加者':[[identity,name]],
  'emuzii_ガチャ':[Object.assign(Array(17).fill(''),{0:identity,1:name,5:5,6:0,9:0,12:'OK',13:'OK'})],
  'emuzii_景品設定':prizes,
  'emuzii_当選履歴':history
 };
 let normalOpen=true,festOpen=true;
 const ss={getSheetByName(tab){
  if(tab==='emuzii_管理画面')return {getRange(){return {getValue(){return 5}}}};
  if(!Object.hasOwn(data,tab))throw Error('Unexpected tab '+tab);
  return {appendRow(r){data[tab].push(r)}};
 }};
 const ctx={
  Date, console:{log(){},error(){}},SpreadsheetApp:{flush(){}},
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},getUuid(){return 'uuid'},computeDigest(){return Array(32).fill(0)}}
 };
 runInNewContext(code,ctx,{timeout:2500});
 ctx.rows_=(_,tab)=>data[tab]||[];
 ctx.gachaOpenState_=()=>({normalOpen,festOpen,configured:true});
 const user=[webid,'hash',name,'',new Date(),'承認済み','確認済み',identity];
 const invoke=(mode='通常',id=drawId)=>ctx.gachaAction_(ss,user,{action:'draw',drawId:id,mode});
 return {invoke,history,drawId,disable(){normalOpen=false;festOpen=false},changeOwner(){user[0]='MIO-W-'+'b'.repeat(24)},changeMioId(){user[7]='OTHER-ID'},changeMode(){},get remaining(){return 5-history.length}};
}
test('response-lost after commit: same request recovers original win without spending another right',()=>{
 const s=fixture(),first=s.invoke();
 assert.equal(first.ok,true);
 // The browser misses first response; replay is all it can safely request.
 const replay=s.invoke();
 assert.equal(replay.ok,true);
 assert.equal(replay.replayed,true);
 assert.equal(replay.drawId,first.drawId);
 assert.equal(replay.prize,first.prize);
 assert.equal(s.history.length,1);
 assert.equal(s.remaining,4);
});
test('response-lost then admin closes both gates: old draw can be recovered without new spend',()=>{
 const s=fixture(),first=s.invoke();
 assert.equal(first.ok,true);
 s.disable();
 const replay=s.invoke();
 assert.equal(replay.ok,true);
 assert.equal(replay.replayed,true);
 assert.equal(s.history.length,1);
 const newRequest=s.invoke('通常','e'.repeat(32));
 assert.equal(newRequest.ok,false);
 assert.equal(s.history.length,1);
});
test('unknown draw after gate closure cannot be mistaken for earlier confirmed draw',()=>{
 const s=fixture();
 assert.equal(s.invoke().ok,true);
 s.disable();
 const result=s.invoke('通常','f'.repeat(32));
 assert.equal(result.ok,false);
 assert.equal(result.replayed,undefined);
 assert.equal(s.history.length,1);
});
test('attempted replay under another browser Web ID never reveals stored win',()=>{
 const s=fixture();
 assert.equal(s.invoke().ok,true);
 s.changeOwner();
 const r=s.invoke();
 assert.equal(r.ok,false);
 assert.equal(s.history.length,1);
});
test('attempted replay under another MIO ID never reveals stored win',()=>{
 const s=fixture();
 assert.equal(s.invoke().ok,true);
 s.changeMioId();
 const r=s.invoke();
 assert.equal(r.ok,false);
 assert.equal(s.history.length,1);
});
