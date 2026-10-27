/**
 * NEW CASES ONLY: deterministic lock-contention injection into staged GAS
 * doPost for two approved browsers sharing a MIO-ID.
 * A nested B request is dispatched from A's appendRow BEFORE the first
 * history row commits. This proves the stage ScriptLock rejects an interleaved
 * request, and sequential retries read A's committed shared history.
 * NOT real network parallelism; never touches production or actual Sheets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const original=readFileSync(process.env.MIO_GACHA_CORE_PATH,'utf8');
const patch=readFileSync('gacha-ui/patches/gacha-won-duplicate-keys-replacement-v216.gs','utf8');
const functionDefinition=/^function wonDuplicateKeys_\(ss,id\)\{[\s\S]*?^\}/gm;
assert.equal([...original.matchAll(functionDefinition)].length,1,'exactly one replacement');
const staged=original.replace(functionDefinition,patch);
const secret='ISOLATED-NOT-REAL-SECRET',normal='通常',festival='ラキフェス';
const webA='MIO-W-'+'a'.repeat(24),webB='MIO-W-'+'b'.repeat(24),webC='MIO-W-'+'c'.repeat(24);
const tokenA='a'.repeat(64),tokenB='b'.repeat(64),tokenC='c'.repeat(64);
const mioA='MIO-1234',mioC='MIO-7890',nameA='FICTIONAL_A',nameC='FICTIONAL_C';
const drawId=x=>x.repeat(32);

function mkWeb(id,token,mio,name){
 const r=Array(22).fill('');
 r[0]=id;r[1]=token;r[2]=name;r[4]=new Date();r[5]='承認済み';
 r[6]='確認済み';r[7]=mio;r[10]=mio;r[11]='確認済み';
 r[15]=mio;r[16]='現行';return r;
}
function mkPrize(mode,id,name,key){
 return [mode,id,name,'R',50,true,'','https://example.invalid/'+id+'.jpg','',key];
}
function harness({rights=1,secondaryRights=1,seedNormal=0}={}){
 const webRows=[
  mkWeb(webA,tokenA,mioA,nameA),mkWeb(webB,tokenB,mioA,nameA),
  mkWeb(webC,tokenC,mioC,nameC)
 ];
 const history=[];
 for(let i=0;i<seedNormal;i++)history.push([
   i.toString(16).padStart(32,'0'),webA,mioA,nameA,normal,
   'OLD-'+i,'previous-prize-'+i,50,new Date(),i+1,'確定','N','','previous-prize-'+i
 ]);
 const data={
  'emuzii_参加者':[[mioA,nameA],[mioC,nameC]],
  'emuzii_ガチャ':[
    Object.assign(Array(17).fill(''),{0:mioA,1:nameA,5:rights,6:0,9:0,12:'OK',13:'OK'}),
    Object.assign(Array(17).fill(''),{0:mioC,1:nameC,5:secondaryRights,6:0,9:0,12:'OK',13:'OK'})
  ],
  'emuzii_景品設定':[
   mkPrize(normal,'MEM-SHARED','共有の宝物','shared-key'),
   mkPrize(normal,'MEM-OTHER','別の宝物','normal-key'),
   mkPrize(festival,'LF-SHARED','共有の宝物','another-key'),
   mkPrize(festival,'LF-OTHER','ラキフェス限定','fest-key')
  ],
  'emuzii_当選履歴':history
 };
 let locked=false,acquired=0,released=0,attempts=0,flushes=0,appends=0;
 let injection=null,failedOnce=false,injectResult=null;
 const lock={
  tryLock(waitMillis){
   assert.equal(waitMillis,10000);
   attempts++;
   if(locked)return false;
   locked=true;acquired++;return true;
  },
  releaseLock(){
   assert.equal(locked,true);
   locked=false;released++;
  }
 };
 const ss={
  getSheetByName(tab){
   if(tab==='emuzii_管理画面')return {getRange(cell){assert.equal(cell,'B23');return {getValue:()=>5}}};
   if(tab==='emuzii_Web登録')return {mockOnly:true};
   if(!Object.hasOwn(data,tab))throw Error('unexpected sheet '+tab);
   return {appendRow(row){
    assert.equal(tab,'emuzii_当選履歴','only draw result may append');
    assert.equal(locked,true,'the entire commit must be within ScriptLock');
    if(injection){
      const callback=injection;injection=null;
      injectResult=callback();
      assert.equal(locked,true,'nested call must not release caller lock');
    }
    if(failedOnce){failedOnce=false;throw Error('synthetic write interrupted before commit')}
    data[tab].push(row.slice());appends++;
   }};
  }
 };
 const context={
  Date,console:{log(){},error(){}},
  PropertiesService:{getScriptProperties(){return {getProperty(k){assert.equal(k,'BRIDGE_SECRET');return secret}}}},
  LockService:{getScriptLock(){return lock}},
  SpreadsheetApp:{openById(){return ss},flush(){assert.equal(locked,true);flushes++}},
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},getUuid(){return 'MOCK-UUID'},
     computeDigest(){return Array(32).fill(0)}}
 };
 runInNewContext(staged,context,{timeout:3500,filename:'development-GAS-only.gs'});
 // Only provider and Sheets access are mocked. doPost, auth, per-MIO rules,
 // lock lifetime, duplicate filter and draw selection remain source functions.
 context.rows_=(s,tab)=>data[tab]||[];
 context.equal_=(a,b)=>a===b;
 context.json_=result=>result;
 context.ensureLoginIdHeader_=()=>{};
 context.webActualRows_=()=>webRows;
 context.gachaOpenState_=()=>({normalOpen:true,festOpen:true,configured:true});
 const send=(who,drawId,mode=normal)=>{
  const [participantId,tokenHash]=who==='A'?[webA,tokenA]:who==='B'?[webB,tokenB]:[webC,tokenC];
  return context.doPost({postData:{contents:JSON.stringify({
   action:'draw',secret,participantId,tokenHash,mode,drawId
  })}});
 };
 const catalog=(who)=>{
  const [participantId,tokenHash]=who==='A'?[webA,tokenA]:who==='B'?[webB,tokenB]:[webC,tokenC];
  return context.doPost({postData:{contents:JSON.stringify({
   action:'catalog',secret,participantId,tokenHash
  })}});
 };
 return {send,catalog,history,inject(next){injection=next},failNextAppend(){failedOnce=true},
  get nested(){return injectResult},get stats(){return {locked,acquired,released,attempts,flushes,appends}}};
}

test('last right: browser B interleaves before A commit, gets busy, then no rights remain',()=>{
 const h=harness({rights:1});
 h.inject(()=>h.send('B',drawId('2')));
 const a=h.send('A',drawId('1'));
 assert.equal(a.ok,true);assert.equal(a.prize,'共有の宝物');
 assert.equal(h.nested.ok,false);assert.match(h.nested.error,/処理中/);
 assert.equal(h.history.length,1);
 const b=h.send('B',drawId('2'));
 assert.equal(b.ok,false);assert.match(b.error,/残り回数がありません/);
 assert.equal(h.history.length,1);
 assert.equal(h.catalog('B').remaining,0);
 assert.equal(h.stats.locked,false);
 assert.equal(h.stats.acquired,h.stats.released);
});
test('two rights: B retry after simultaneous attempt draws DIFFERENT prize, ordinal 2',()=>{
 const h=harness({rights:2});
 h.inject(()=>h.send('B',drawId('2')));
 const a=h.send('A',drawId('1'));
 assert.equal(a.ok,true);
 assert.equal(h.nested.ok,false);assert.match(h.nested.error,/処理中/);
 const b=h.send('B',drawId('2'));
 assert.equal(b.ok,true);assert.equal(b.prize,'別の宝物');
 assert.equal(b.ordinal,2);assert.equal(b.remaining,0);
 assert.equal(h.history.length,2);
 assert.equal(new Set(h.history.map(x=>x[6])).size,2);
 assert.equal(h.stats.locked,false);
 assert.equal(h.stats.acquired,h.stats.released);
});
test('same draw ID submitted across devices while locked remains invalid after release',()=>{
 const h=harness({rights:2});
 h.inject(()=>h.send('B',drawId('1')));
 assert.equal(h.send('A',drawId('1')).ok,true);
 assert.match(h.nested.error,/処理中/);
 const stolen=h.send('B',drawId('1'));
 assert.equal(stolen.ok,false);assert.match(stolen.error,/抽選ID/);
 assert.equal(h.history.length,1);
 assert.equal(h.stats.acquired,h.stats.released);
});
test('failure before commit still releases lock; B can safely take the sole right',()=>{
 const h=harness({rights:1});
 h.failNextAppend();
 h.inject(()=>h.send('B',drawId('2')));
 const a=h.send('A',drawId('1'));
 assert.equal(a.ok,false);
 assert.match(a.error,/連携処理/);
 assert.match(h.nested.error,/処理中/);
 assert.equal(h.history.length,0);
 const b=h.send('B',drawId('2'));
 assert.equal(b.ok,true);
 assert.equal(h.history.length,1);
 assert.equal(b.ordinal,1);
 assert.equal(h.stats.acquired,h.stats.released);
});
test('festival unlock boundary: B cannot start before A fourth commit, then 5th draw is safe',()=>{
 const h=harness({rights:5,seedNormal:3});
 h.inject(()=>h.send('B',drawId('2'),festival));
 const a=h.send('A',drawId('1'));
 assert.equal(a.ok,true);assert.equal(a.ordinal,4);
 assert.match(h.nested.error,/処理中/);
 assert.equal(h.catalog('B').festUnlocked,true);
 const b=h.send('B',drawId('2'),festival);
 assert.equal(b.ok,true);assert.equal(b.ordinal,5);
 assert.equal(b.prize,'ラキフェス限定');
 assert.equal(h.history.length,5);
 assert.equal(new Set(h.history.map(r=>r[6])).size,5);
 assert.equal(h.stats.acquired,h.stats.released);
});
test('ScriptLock is global: another MIO waits, then draws independently',()=>{
 const h=harness({rights:1,secondaryRights:1});
 h.inject(()=>h.send('C',drawId('3')));
 assert.equal(h.send('A',drawId('1')).ok,true);
 assert.match(h.nested.error,/処理中/);
 const c=h.send('C',drawId('3'));
 assert.equal(c.ok,true);assert.equal(c.prize,'共有の宝物');
 assert.equal(c.ordinal,1);
 assert.equal(h.history.length,2);
 assert.notEqual(h.history[0][2],h.history[1][2]);
 assert.equal(h.stats.acquired,h.stats.released);
});
