/**
 * NEW ONLY: Complete synthetic draw exhaustion for the real 27-entry PREVIEW
 * catalog. 16 normal + 11 Lucky Festival, 7 shared = 20 unique deliverables.
 * Runs staged GAS inside node:vm with fake data, never production GAS/Sheets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const gas=readFileSync(process.env.MIO_GACHA_CORE_PATH,'utf8');
const patch=readFileSync('gacha-ui/patches/gacha-won-duplicate-keys-replacement-v216.gs','utf8');
const rex=/^function wonDuplicateKeys_\(ss,id\)\{[\s\S]*?^\}/gm;
assert.equal([...gas.matchAll(rex)].length,1,'target a single staged function only');
const staged=gas.replace(rex,patch);
const entries=JSON.parse(readFileSync('gacha-core/data/gacha-prizes-v2-preview.json','utf8')).prizes;
const norm=x=>String(x).trim().toLowerCase().replace(/\s+/g,' ');
const distinct=new Set(entries.map(p=>norm(p.name)));
assert.equal(entries.length,27);
assert.equal(distinct.size,20);
assert.equal(entries.filter(p=>p.mode==='通常').length,16);
assert.equal(entries.filter(p=>p.mode==='ラキフェス').length,11);
for(const mode of ['通常','ラキフェス'])
 assert.equal(entries.filter(p=>p.mode===mode).reduce((s,p)=>s+p.probabilityPercent,0),100);
const prizeRows=entries.map(p=>[
 p.mode,p.id,p.name,p.rarity,p.probabilityPercent,p.enabled,
 p.quantityLimit??'',p.originalImageUrl,p.note,p.duplicateKey
]);

function instance(){
 const mio='SYNTHETIC-MIO',web='SYNTHETIC-WEB',name='SYNTHETIC-TEST';
 const data={
  'emuzii_参加者':[[mio,name]],
  'emuzii_ガチャ':[Object.assign(Array(17).fill(''),{0:mio,1:name,5:40,6:0,9:0,12:'OK',13:'OK'})],
  'emuzii_景品設定':prizeRows.map(row=>row.slice()),
  'emuzii_当選履歴':[]
 };
 const sheet={getSheetByName(tab){
  if(tab==='emuzii_管理画面')return {getRange(a){assert.equal(a,'B23');return {getValue:()=>5}}};
  if(!Object.hasOwn(data,tab))throw Error('Unexpected tab '+tab);
  return {appendRow(row){data[tab].push(row.slice())}};
 }};
 let seq=0;
 const sandbox={Date,console:{log(){},error(){}},SpreadsheetApp:{flush(){}},
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},
    getUuid(){return 'synthetic-'+(++seq)},
    // Deterministic zero selects FIRST prize still eligible each time.
    // This exercises the actual staged GAS exclusion every iteration.
    computeDigest(){return Array(32).fill(0)}}};
 runInNewContext(staged,sandbox,{timeout:3000});
 sandbox.rows_=(ss,tab)=>data[tab]||[];
 sandbox.gachaOpenState_=()=>({normalOpen:true,festOpen:true,configured:true});
 const user=[web,'mock-hash',name,'',new Date(),'承認済み','確認済み',mio];
 const call=x=>sandbox.gachaAction_(sheet,user,x);
 return {data,catalog:()=>call({action:'catalog'}),
  draw:mode=>call({action:'draw',mode,drawId:(++seq).toString(16).padStart(32,'0')})};
}
function pull(s,mode){
 const earlier=s.data['emuzii_当選履歴'].map(r=>norm(r[6]));
 const result=s.draw(mode);
 assert.equal(result.ok,true,JSON.stringify({mode,error:result.error,previous:earlier.length}));
 assert.ok(!earlier.includes(norm(result.prize)),'duplicate prize '+result.prize);
 assert.equal(s.data['emuzii_当選履歴'].length,earlier.length+1);
 const last=s.data['emuzii_当選履歴'].at(-1);
 assert.equal(last[10],'確定');
 assert.equal(last[2],'SYNTHETIC-MIO');
 assert.equal(result.ordinal,earlier.length+1);
 return result;
}
function exhausted(s){
 const histories=s.data['emuzii_当選履歴'];
 const names=histories.map(x=>norm(x[6]));
 assert.equal(histories.length,20);
 assert.equal(new Set(names).size,20);
 assert.deepEqual(new Set(names),distinct);
 const c=s.catalog();
 assert.equal(c.normal.ready,false);
 assert.equal(c.fest.ready,false);
 assert.equal(c.normal.prizes.length,0);
 assert.equal(c.fest.prizes.length,0);
 assert.equal(c.remaining,20);
 const before=histories.length;
 for(const mode of ['通常','ラキフェス']){
   const r=s.draw(mode);
   assert.equal(r.ok,false);
   assert.equal(histories.length,before,'stop safely without spending a draw right');
 }
}
test('complete 27 catalog: all 16 normal first, then 4 remaining festival, no duplicates',()=>{
 const s=instance();
 for(let i=0;i<16;i++)pull(s,'通常');
 assert.equal(s.catalog().normal.ready,false);
 assert.equal(s.catalog().fest.prizes.length,4);
 for(let i=0;i<4;i++)pull(s,'ラキフェス');
 exhausted(s);
});
test('complete 27 catalog: 4 normal, then 11 festival, then 5 more normal, no duplicates',()=>{
 const s=instance();
 for(let i=0;i<4;i++)pull(s,'通常');
 assert.equal(s.catalog().festUnlocked,true);
 for(let i=0;i<11;i++)pull(s,'ラキフェス');
 assert.equal(s.catalog().fest.ready,false);
 assert.equal(s.catalog().normal.prizes.length,5);
 for(let i=0;i<5;i++)pull(s,'通常');
 exhausted(s);
});
test('probabilities re-normalize across the remaining unique prizes in both modes',()=>{
 const s=instance();
 for(let i=0;i<4;i++)pull(s,'通常');
 const used=new Set(s.data['emuzii_当選履歴'].map(r=>norm(r[6])));
 const c=s.catalog();
 for(const mode of ['normal','fest']){
  assert.ok(c[mode].prizes.length>0);
  assert.ok(c[mode].prizes.every(p=>!used.has(norm(p.name))));
  assert.equal(c[mode].total,100);
 }
});
