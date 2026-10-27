/**
 * Gate-and-lock integration tests against the staged GAS Code.gs only.
 * This suite uses synthetic IDs and in-memory data. No network, live data,
 * live Google Apps Script, real users, or Vercel endpoints are involved.
 * Unlike gacha-core-simulation.test.mjs this enters through doPost().
 *
 * MIO_GACHA_CORE_PATH=<path to staged Code.gs> node --test tests/gacha-lock-boundary.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const path = process.env.MIO_GACHA_CORE_PATH;
if (!path) throw Error('MIO_GACHA_CORE_PATH must be set to the staged, non-production Code.gs');
const stagedGAS = readFileSync(path,'utf8');
const WEB = 'MIO-W-'+'a'.repeat(24);
const TOKEN = 'b'.repeat(64);
const PARTICIPANT = 'MIO-SYNTHETIC-1';
const DRAW = 'c'.repeat(32);

function harness(opts={}) {
  const row = [WEB,TOKEN,'SYNTHETIC_ONLY','',new Date(),'承認済み','確認済み',PARTICIPANT];
  const prize=(mode,id,name,weight=50) => [mode,id,name,'R',weight,true,'','https://example.invalid/'+id+'.jpg','',''];
  const data={
    'emuzii_参加者':[[PARTICIPANT,'SYNTHETIC_ONLY']],
    'emuzii_ガチャ': [Object.assign(Array(17).fill(''),{0:PARTICIPANT,1:'SYNTHETIC_ONLY',5:opts.total??5,6:0,9:0,12:'OK',13:'OK'})],
    'emuzii_当選履歴':[],
    'emuzii_景品設定':[
      prize('通常','N1','common'),
      prize('通常','N2','other-normal'),
      prize('ラキフェス','F1','common'),
      prize('ラキフェス','F2','other-fest')
    ]
  };
  let held=false,acquired=0,released=0,appended=0,attempts=0;
  const lock={
    tryLock(){attempts++;if(held)return false;held=true;acquired++;return true;},
    releaseLock(){assert.equal(held,true);held=false;released++;}
  };
  const ss={getSheetByName(name){
    if(name==='emuzii_管理画面')return {getRange(cell){assert.equal(cell,'B23');return {getValue(){return 5}}}};
    if(name==='emuzii_Web登録')return {dummy:true};
    if(!(name in data))throw Error('Unknown sheet '+name);
    return {appendRow(values){
      assert.equal(held,true,'history writes require script lock');
      if(opts.failAppend)throw Error('synthetic write failure');
      data[name].push(values);appended++;
    }};
  }};
  const sandbox={
    console:{log(){},error(){}},Date,
    PropertiesService:{getScriptProperties(){return {getProperty(k){assert.equal(k,'BRIDGE_SECRET');return 'SYNTHETIC-SECRET'}}}},
    LockService:{getScriptLock(){return lock}},
    SpreadsheetApp:{openById(){return ss},flush(){}},
    Utilities:{
      DigestAlgorithm:{SHA_256:'SHA_256'},
      getUuid(){return 'synthetic-uuid'},
      computeDigest(){return Array(32).fill(0)}
    }
  };
  runInNewContext(stagedGAS,sandbox,{timeout:2500,filename:'staged-Code.gs'});
  sandbox.equal_=(a,b)=>a===b;
  sandbox.json_=value=>value;
  sandbox.ensureLoginIdHeader_=()=>{};
  sandbox.webActualRows_=()=>[row];
  sandbox.activeWebDeviceErrorV189_=()=>opts.inactive?'inactive synthetic device':'';
  sandbox.webIntegrityOk_=()=>!opts.badIntegrity;
  sandbox.rows_=(ss,name)=>data[name] || [];
  sandbox.gachaOpenState_=()=>({normalOpen:opts.normalOpen!==false,festOpen:opts.festOpen!==false,configured:true});
  const post=(body={})=>sandbox.doPost({
    postData:{contents:JSON.stringify({
      action:'draw',secret:'SYNTHETIC-SECRET',
      participantId:WEB,tokenHash:TOKEN,
      mode:'通常',drawId:DRAW,
      ...body
    })}
  });
  return {
    post, data, row,
    get history(){return data['emuzii_当選履歴']},
    get lockState(){return {held,attempts,acquired,released,appended}},
    hold(){held=true},
    releaseForTest(){held=false}
  };
}

test('doPost actually acquires and releases script lock around a committed draw',()=>{
  const h=harness();
  const r=h.post();
  assert.equal(r.ok,true);
  assert.equal(r.remaining,4);
  assert.equal(h.history.length,1);
  assert.deepEqual(h.lockState,{held:false,attempts:1,acquired:1,released:1,appended:1});
});

test('retry of the same drawId returns stored result without second append',()=>{
  const h=harness();
  const first=h.post(),replayed=h.post();
  assert.equal(first.ok,true);
  assert.equal(replayed.replayed,true);
  assert.equal(replayed.prize,first.prize);
  assert.equal(h.history.length,1);
  assert.equal(h.lockState.released,2);
});

test('two distinct draw IDs cannot consume more than granted rights',()=>{
  const h=harness({total:1});
  assert.equal(h.post().ok,true);
  const denied=h.post({drawId:'d'.repeat(32)});
  assert.equal(denied.ok,false);
  assert.match(denied.error,/残り回数がありません/);
  assert.equal(h.history.length,1);
});

test('a locked script rejects requests without any write or mistaken unlock',()=>{
  const h=harness();
  h.hold();
  const result=h.post();
  assert.equal(result.ok,false);
  assert.match(result.error,/処理中です/);
  assert.deepEqual(h.lockState,{held:true,attempts:1,acquired:0,released:0,appended:0});
  h.releaseForTest();
});

test('wrong shared bridge secret cannot reach draw and still releases acquired lock',()=>{
  const h=harness();
  const result=h.post({secret:'WRONG-SECRET'});
  assert.equal(result.ok,false);
  assert.equal(result.error,'unauthorized');
  assert.equal(h.history.length,0);
  assert.equal(h.lockState.released,1);
});

test('wrong token hash cannot reach a draw',()=>{
  const h=harness();
  const result=h.post({tokenHash:'c'.repeat(64)});
  assert.equal(result.ok,false);
  assert.equal(result.error,'unauthorized');
  assert.equal(h.history.length,0);
  assert.equal(h.lockState.released,1);
});

test('invalid participant ID fails closed before accessing identity',()=>{
  const h=harness();
  const result=h.post({participantId:'invalid'});
  assert.equal(result.ok,false);
  assert.equal(result.error,'invalid identity');
  assert.equal(h.history.length,0);
});

test('removed/unauthorized device is not permitted to spend a right',()=>{
  const h=harness({inactive:true});
  const result=h.post();
  assert.equal(result.ok,false);
  assert.match(result.error,/inactive synthetic device/);
  assert.equal(h.history.length,0);
  assert.equal(h.lockState.released,1);
});

test('identity integrity mismatch blocks draw',()=>{
  const h=harness({badIntegrity:true});
  const result=h.post();
  assert.equal(result.ok,false);
  assert.match(result.error,/整合/);
  assert.equal(h.history.length,0);
});

test('administrative OFF switch blocks spend at server boundary',()=>{
  const h=harness({normalOpen:false});
  const result=h.post();
  assert.equal(result.ok,false);
  assert.match(result.error,/停止中/);
  assert.equal(h.history.length,0);
  assert.equal(h.lockState.released,1);
});

test('server gate still rejects festival before four prior Web draws',()=>{
  const h=harness({total:6});
  const result=h.post({mode:'ラキフェス'});
  assert.equal(result.ok,false);
  assert.match(result.error,/Webで4回抽選後/);
  assert.equal(h.history.length,0);
});

test('a synthetic append exception safely releases lock and reports failure',()=>{
  const h=harness({failAppend:true});
  const result=h.post();
  assert.equal(result.ok,false);
  assert.equal(result.error,'連携処理を完了できませんでした');
  assert.equal(h.history.length,0);
  assert.equal(h.lockState.released,1);
});
