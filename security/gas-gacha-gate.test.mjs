import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../Code.gs', import.meta.url), 'utf8');
function fixture(seed = new Map([['A1', '既存の管理設定'], ['B1', '変更しない']])){
  const cells = new Map(seed);
  const calls = [];
  let last = 8;
  const range = (row, col, count = 1) => ({
    getDisplayValues: () => Array.from({ length: count }, (_, i) => [cells.get('A'+(row+i)) || '']),
    getValue: () => cells.get((col === 1 ? 'A' : 'B')+row) ?? '',
    setValue(value) { cells.set((col === 1 ? 'A' : 'B')+row, value); last=Math.max(last,row); return this; },
    insertCheckboxes() { cells.set('B'+row, false); return this; },
    setBackground() { return this; },
    setFontWeight() { return this; }
  });
  const admin = { getLastRow: () => last, getRange: range };
  const ss = { getSheetByName(name) { calls.push(name); assert.equal(name,'emuzii_管理画面'); return admin; } };
  const context = vm.createContext({
    console: { log() {}, error() {} },
    SpreadsheetApp: { openById() { return ss; } }
  });
  vm.runInContext(source,context);
  return { context, cells, calls, ss, admin };
}

test('受付専用初期化は管理画面の末尾に停止中のスイッチを追加し、他のシートに触れない',()=>{
  const f=fixture();
  const state=f.context.setupGachaGate();
  assert.equal(state.configured,true);
  assert.equal(state.normalOpen,false);
  assert.equal(state.festOpen,false);
  assert.equal(f.cells.get('A10'),'メンシプガチャ受付');
  assert.equal(f.cells.get('A11'),'ラキフェス受付');
  assert.equal(f.cells.get('B1'),'変更しない');
  assert.ok(f.calls.every(name=>name==='emuzii_管理画面'));
});

test('再実行でスイッチを重複追加せず、既存の受付状態を保持する',()=>{
  const f=fixture();
  f.context.setupGachaGate();
  f.cells.set('B10',true);
  const before=f.cells.size;
  const state=f.context.setupGachaGate();
  assert.equal(f.cells.size,before);
  assert.equal(state.normalOpen,true);
  assert.equal(state.festOpen,false);
});

test('受付設定なし・シート読取失敗では両方停止になる',()=>{
  const f=fixture();
  for(const ss of [
    {getSheetByName:()=>null},
    {getSheetByName:()=>{throw Error('unavailable');}}
  ]){
    const state=f.context.gachaOpenState_(ss);
    assert.equal(state.configured,false);
    assert.equal(state.normalOpen,false);
    assert.equal(state.festOpen,false);
  }
});

function stoppedFixture(){
  const f=fixture();
  f.context.setupGachaGate();
  const person=['P1','テスト'];
  const g=['P1','テスト',1,0,0,5,0,5,1,0,5,'','OK','OK'];
  const r=['MIO-W-'+'a'.repeat(24),'hash','テスト','','','承認済み','確認済み','P1'];
  f.context.rows_=(_ss,name)=>{
    if(name==='emuzii_参加者')return [person];
    if(name==='emuzii_ガチャ')return [g];
    if(name==='emuzii_当選履歴')return [];
    throw Error('停止中に別シートを読んだ: '+name);
  };
  f.context.draws_=()=>[];
  f.context.catalog_=()=>{throw Error('停止中に景品を読んだ');};
  return {...f,r};
}

test('停止中の一覧取得は景品を読み込まず、空の一覧を返す',()=>{
  const f=stoppedFixture();
  const result=f.context.gachaAction_(f.ss,f.r,{action:'catalog'});
  assert.equal(result.ok,true);
  assert.equal(result.normalOpen,false);
  assert.equal(result.festOpen,false);
  assert.equal(result.normal.prizes.length,0);
  assert.equal(result.fest.prizes.length,0);
});

test('停止中は通常・ラキフェスとも新規抽選を拒否する',()=>{
  const f=stoppedFixture();
  for(const mode of ['通常','ラキフェス']){
    const result=f.context.gachaAction_(f.ss,f.r,{action:'draw',mode,drawId:'b'.repeat(32)});
    assert.equal(result.ok,false);
    assert.match(result.error,/停止中/);
  }
});
