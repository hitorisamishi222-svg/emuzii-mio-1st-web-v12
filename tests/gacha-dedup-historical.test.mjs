/**
 * New-only tests for permanent per-participant duplicate exclusion when
 * catalog names, IDs or optional duplicate keys change after earlier wins.
 * Real staged GAS logic is evaluated in memory with a SINGLE function
 * replacement. Never use live participant Sheets or production GAS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const baseline = readFileSync(process.env.MIO_GACHA_CORE_PATH,'utf8');
const replacement=readFileSync('gacha-ui/patches/gacha-won-duplicate-keys-replacement-v216.gs','utf8').trim();
const functionRegex=/^function wonDuplicateKeys_\(ss,id\)\{[\s\S]*?^\}/gm;
const blocks=[...baseline.matchAll(functionRegex)];
assert.equal(blocks.length,1,'require exactly one original GAS definition');
assert.match(replacement,/function wonDuplicateKeys_\(ss,id\)\{/);
const staged=baseline.replace(functionRegex,replacement);
assert.equal([...staged.matchAll(/^function wonDuplicateKeys_\(ss,id\)\{/gm)].length,1,'no duplicate GAS declarations');

const pid='MIO-MOCK-1',web='web-mock-1';
function row(mode,id,name,key='',chance=50){
 return [mode,id,name,'R',chance,true,'','https://example.org/'+id+'.jpg','',key];
}
function historyRow({id='MEM-A',name='Crystal Gift',key='old-a',participant=pid,mode='通常',confirmed=true,serial=1}={}){
 return [String(serial).padStart(32,'a').slice(0,32),web,participant,'SYNTHETIC',mode,id,name,50,new Date(),serial,confirmed?'確定':'取消','R','',key];
}
function fixture({catalog=[],history=[],total=10}={}){
 let serial=0;
 const data={
  'emuzii_参加者':[[pid,'SYNTHETIC']],
  'emuzii_ガチャ':[Object.assign(Array(17).fill(''),{0:pid,1:'SYNTHETIC',5:total,6:0,9:0,12:'OK',13:'OK'})],
  'emuzii_景品設定':catalog,
  'emuzii_当選履歴':history
 };
 const ss={getSheetByName(tab){
  if(tab==='emuzii_管理画面')return {getRange(){return {getValue:()=>5}}};
  if(!(tab in data))throw Error('Unexpected sheet '+tab);
  return {appendRow(v){data[tab].push(v)}};
 }};
 const sandbox={
  Date,
  console:{log(){},error(){}},
  SpreadsheetApp:{flush(){}},
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},getUuid(){serial++;return 'uuid-'+serial;},computeDigest(){return Array(32).fill(0)}}
 };
 runInNewContext(staged,sandbox,{timeout:3000});
 sandbox.rows_=(ss,tab)=>data[tab]||[];
 sandbox.gachaOpenState_=()=>({normalOpen:true,festOpen:true,configured:true});
 const person=[web,'test-token','SYNTHETIC','',new Date(),'承認済み','確認済み',pid];
 return {ss,sandbox,data,person,catalog(){return sandbox.gachaAction_(ss,person,{action:'catalog'})},
   draw(mode='通常',id='f'.repeat(32)){return sandbox.gachaAction_(ss,person,{action:'draw',mode,drawId:id})}};
}
const prizes=()=>[
 row('通常','MEM-A','Crystal Gift','original-key'),
 row('通常','MEM-B','Normal Bonus','normal-other'),
 row('ラキフェス','LF-A','Crystal Gift','different-fest-key'),
 row('ラキフェス','LF-B','Festival Bonus','fest-other')
];
function with4History(first){
 return [first,...[1,2,3].map(i=>historyRow({serial:i+1,id:'PAST-'+i,name:'past-'+i,key:'past-'+i}))];
}
const entries=c=>c.fest.prizes.map(x=>x.id);

test('same name with DIFFERENT explicit duplicate keys is blocked across modes',()=>{
 const s=fixture({catalog:prizes(),history:with4History(historyRow({key:'original-key'}))});
 assert.deepEqual(entries(s.catalog()),['LF-B']);
 const result=s.draw('ラキフェス');assert.equal(result.ok,true);assert.equal(result.prize,'Festival Bonus');
 assert.equal(s.data['emuzii_当選履歴'].length,5);
});
test('renamed prize and changed explicit key still match original prize ID and new cross-mode name',()=>{
 const p=prizes();p[0][2]='Renamed Crystal';p[0][9]='new-mem-key';p[2][2]='Renamed Crystal';p[2][9]='new-lf-key';
 const s=fixture({catalog:p,history:with4History(historyRow({name:'Crystal Gift',key:'old-key'}))});
 assert.deepEqual(entries(s.catalog()),['LF-B']);
});
test('legacy history without a key or present catalog ID still matches current NAME with explicit keys',()=>{
 const p=prizes();p[2][2]='Crystal Gift';p[2][9]='different-id-key';
 const s=fixture({catalog:p,history:with4History(historyRow({id:'legacy-deleted-id',name:'Crystal Gift',key:''}))});
 assert.deepEqual(entries(s.catalog()),['LF-B']);
});
test('stable duplicate key survives name and ID changes together',()=>{
 const p=prizes();p[0][2]='New Name';p[0][9]='evergreen-key';p[2][2]='New Name';p[2][9]='evergreen-key';
 const s=fixture({catalog:p,history:with4History(historyRow({id:'legacy-id-no-longer-used',name:'Old Name',key:'evergreen-key'}))});
 assert.deepEqual(entries(s.catalog()),['LF-B']);
});
test('normalized names handle case and whitespace differences',()=>{
 const p=prizes();p[2][2]='CRYSTAL   GIFT';p[2][9]='festival-override';
 const s=fixture({catalog:p,history:with4History(historyRow({id:'lost-id',name:'crystal gift',key:''}))});
 assert.deepEqual(entries(s.catalog()),['LF-B']);
});
test('cancelled wins do not wrongly block prizes',()=>{
 const s=fixture({catalog:prizes(),history:[historyRow({confirmed:false})]});
 assert.deepEqual(entries(s.catalog()),['LF-A','LF-B']);
});
test('another participants wins never block our catalog',()=>{
 const s=fixture({catalog:prizes(),history:[historyRow({participant:'DIFFERENT-PERSON'})]});
 assert.deepEqual(entries(s.catalog()),['LF-A','LF-B']);
});
test('normal mode also excludes previously won names with changed explicit keys',()=>{
 const p=prizes();p[0][9]='changed-after-win';
 const s=fixture({catalog:p,history:[historyRow({id:'old-removed-id',name:'Crystal Gift',key:''})]});
 assert.deepEqual(s.catalog().normal.prizes.map(x=>x.id),['MEM-B']);
});
test('when all festival gifts are owned, catalog disables festival; draw does not charge a right',()=>{
 const s=fixture({catalog:prizes(),history:with4History(historyRow({name:'Crystal Gift'})).concat(historyRow({serial:8,id:'LF-B',name:'Festival Bonus',key:'fest-other'}))});
 const before=s.data['emuzii_当選履歴'].length;
 assert.equal(s.catalog().fest.ready,false);
 assert.equal(s.draw('ラキフェス').ok,false);
 assert.equal(s.data['emuzii_当選履歴'].length,before);
});
test('first win and then another mode never pick the identical name',()=>{
 const s=fixture({catalog:prizes(),history:with4History(historyRow({id:'PAST-X',name:'unrelated',key:'unrelated'}))});
 const first=s.draw('通常','1'.repeat(32));
 assert.equal(first.ok,true);assert.equal(first.prize,'Crystal Gift');
 const next=s.draw('ラキフェス','2'.repeat(32));
 assert.equal(next.ok,true);assert.equal(next.prize,'Festival Bonus');
 assert.equal(s.data['emuzii_当選履歴'].length,6);
});
