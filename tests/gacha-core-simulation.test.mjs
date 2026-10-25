/**
 * Isolated MIO gacha server simulation.
 *
 * These tests execute the real staged GAS function definitions inside node:vm
 * with in-memory SpreadsheetApp mocks. Nothing is sent to production.
 * The staged source is supplied by env MIO_GACHA_CORE_PATH.
 *
 * Run from CI: MIO_GACHA_CORE_PATH="$PWD/gacha-core/Code.gs" node --test gacha-ui/tests/gacha-core-simulation.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const srcPath = process.env.MIO_GACHA_CORE_PATH;
if (!srcPath) throw Error('MIO_GACHA_CORE_PATH is required; point it to the staged Code.gs, NEVER live GAS');
const gas = readFileSync(srcPath, 'utf8');

function state(opts = {}) {
  const {
    total = 6, manual = 0, draws = 0,
    normalOpen = true, festOpen = true,
    approved = true, confirmed = true,
    festFrom = 5, prizes: ownPrizes
  } = opts;
  const web = 'web-001', name = 'TEST_SYNTHETIC', mioId = 'MIO-TEST-001';
  const prizeRow = (mode, id, prizeName, chance = 50, stock = '') =>
    [mode,id,prizeName,'R',chance,true,stock,'https://example.org/'+id+'.jpg','',''];
  const defaults = [
    prizeRow('通常','MEM-A','shared'),
    prizeRow('通常','MEM-B','normal-other'),
    prizeRow('ラキフェス','LF-A','shared'),
    prizeRow('ラキフェス','LF-B','fest-other')
  ];
  const data = {
    'emuzii_参加者': [[mioId,name]],
    'emuzii_ガチャ': [Object.assign(Array(17).fill(''),{0:mioId,1:name,5:total,6:manual,9:0,12:'OK',13:'OK'})],
    'emuzii_当選履歴': [],
    'emuzii_景品設定': ownPrizes || defaults
  };
  for (let n = 0; n < draws; n++) {
    data['emuzii_当選履歴'].push([
      n.toString(16).padStart(32,'0'), web,mioId,name,'通常',
      'TEST-PRE-'+n,'already-owned-'+n,1,new Date(),n+1,'確定','N','','already-owned-'+n
    ]);
  }
  const ss = {
    getSheetByName(tab) {
      if(tab === 'emuzii_管理画面') {
        return {getRange(range){assert.equal(range,'B23');return {getValue:()=>festFrom}}};
      }
      if (!Object.prototype.hasOwnProperty.call(data,tab)) throw Error('Unexpected tab '+tab);
      return {appendRow(row){data[tab].push(row)}};
    }
  };
  let nonce = 0;
  const sandbox = {
    Date,
    console:{log(){},error(){}},
    SpreadsheetApp:{flush(){}},
    Utilities:{
      DigestAlgorithm:{SHA_256:'SHA_256'},
      getUuid(){nonce++;return String(nonce).padStart(36,'0')},
      computeDigest(){return Array(32).fill(0)}
    }
  };
  runInNewContext(gas,sandbox,{timeout:2500, filename:'gacha-core-staged.gs'});
  // Isolate only storage and admin settings. Catalog, win filtering,
  // availability checks, draw selection, and append are ORIGINAL GAS logic.
  sandbox.rows_=(spreadsheet,tab)=>data[tab] || [];
  sandbox.gachaOpenState_=()=>({normalOpen,festOpen,configured:true});
  const participant = [web,'tokenhash',name,'',new Date(),approved?'承認済み':'承認待ち',confirmed?'確認済み':'未確認',mioId];
  const action = (d)=>sandbox.gachaAction_(ss,participant,d);
  return { action, data, participant, ss, sandbox, prizeRow, get history(){return data['emuzii_当選履歴']} };
}
const drawId = c => c.repeat(32);
const catalog = s => s.action({action:'catalog'});
const draw = (s,mode='通常',id=drawId('a')) => s.action({action:'draw',mode,drawId:id});

test('entitlement alone never unlocks festival before four confirmed Web draws',()=>{
  for (const n of [0,1,2,3]) {
    const s = state({total:6,draws:n});
    assert.equal(catalog(s).festUnlocked,false);
  }
});
test('festival becomes selectable after exactly four confirmed Web draws',()=>{
  const s=state({total:6,draws:4});
  const c=catalog(s);
  assert.equal(c.festUnlocked,true);
  assert.equal(c.festAvailableFrom,5);
});
test('server rejects festival before fourth Web draw even when switch is ON',()=>{
  const s=state({total:6,draws:3});
  const r=draw(s,'ラキフェス');
  assert.equal(r.ok,false);
  assert.match(r.error,/Webで4回抽選後/);
  assert.equal(s.history.length,3);
});
test('server rejects festival when total grants under five',()=>{
  const s=state({total:4,draws:3});
  const r=draw(s,'ラキフェス');
  assert.equal(r.ok,false);
  assert.match(r.error,/総ガチャ権利5回以上/);
});
test('one approved normal draw spends one right and saves one committed history',()=>{
  const s=state({total:5});
  const r=draw(s);
  assert.equal(r.ok,true);
  assert.equal(r.remaining,4);
  assert.equal(r.ordinal,1);
  assert.equal(s.history.length,1);
  assert.equal(s.history[0][10],'確定');
});
test('same draw ID is idempotent (no second history row)',()=>{
  const s=state({total:5});
  const first=draw(s);
  const again=draw(s);
  assert.equal(first.ok,true);
  assert.equal(again.replayed,true);
  assert.equal(again.prize,first.prize);
  assert.equal(s.history.length,1);
});
test('same draw ID with different mode cannot be reused',()=>{
  const s=state({total:6,draws:4});
  assert.equal(draw(s,'通常',drawId('f')).ok,true);
  const rejected=draw(s,'ラキフェス',drawId('f'));
  assert.equal(rejected.ok,false);
  assert.equal(s.history.length,5);
});
test('festival OFF blocks new draw without spending rights',()=>{
  const s=state({total:6,draws:4,festOpen:false});
  const r=draw(s,'ラキフェス');
  assert.equal(r.ok,false);
  assert.equal(s.history.length,4);
});
test('normal OFF blocks new draw without spending rights',()=>{
  const s=state({normalOpen:false});
  const r=draw(s);
  assert.equal(r.ok,false);
  assert.equal(s.history.length,0);
});
test('membership unconfirmed blocks spending rights',()=>{
  const s=state({confirmed:false});
  const r=draw(s);
  assert.equal(r.ok,false);
  assert.equal(s.history.length,0);
});
test('unapproved participant cannot draw',()=>{
  const s=state({approved:false});
  const r=draw(s);
  assert.equal(r.ok,false);
  assert.equal(s.history.length,0);
});
test('zero remaining rights cannot draw',()=>{
  const s=state({total:0});
  assert.equal(draw(s).ok,false);
  assert.equal(s.history.length,0);
});
test('invalid draw IDs fail closed',()=>{
  const s=state({});
  const r=s.action({action:'draw',mode:'通常',drawId:'invalid'});
  assert.equal(r.ok,false);
  assert.equal(s.history.length,0);
});
test('cross-mode duplicate prize names are excluded after a prior win',()=>{
  const s=state({total:6,draws:4});
  s.history[0][6]='shared';
  s.history[0][5]='MEM-A';
  s.history[0][13]='shared';
  const r=draw(s,'ラキフェス');
  assert.equal(r.ok,true);
  assert.equal(r.prize,'fest-other');
});
test('a depleted prize blocks drawing until inventory settings are corrected',()=>{
  const s=state({});
  s.data['emuzii_景品設定'][0][6]=0;
  assert.equal(catalog(s).normal.ready,false);
  assert.equal(draw(s).ok,false);
});
test('invalid probability sum blocks drawing',()=>{
  const s=state({});
  s.data['emuzii_景品設定'][0][4]=49;
  assert.equal(catalog(s).normal.ready,false);
  assert.equal(draw(s).ok,false);
});
