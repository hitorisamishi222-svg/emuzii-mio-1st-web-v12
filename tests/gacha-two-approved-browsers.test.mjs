/**
 * NEW targeted tests only: same MIO-ID, two approved browser Web IDs, and
 * continuous nonduplicate history. Runs staged GAS draw function and staged
 * historical dedup patch on in-memory mock rows. NO live participants / API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(process.env.MIO_GACHA_CORE_PATH,'utf8');
const patch=readFileSync('gacha-ui/patches/gacha-won-duplicate-keys-replacement-v216.gs','utf8');
const pattern=/^function wonDuplicateKeys_\(ss,id\)\{[\s\S]*?^\}/gm;
assert.equal([...source.matchAll(pattern)].length,1,'one staged function replacement');
const combined=source.replace(pattern,patch);
const webA='MIO-W-'+'a'.repeat(24),webB='MIO-W-'+'b'.repeat(24),otherWeb='MIO-W-'+'c'.repeat(24);
const idA='MIO-4001',idOther='MIO-4002',name='SYNTHETIC_USER';
const prize=(mode,id,name,duplicateKey='')=>[mode,id,name,'R',50,true,'','https://example.org/'+id+'.jpg','',duplicateKey];

function fixture({totalA=5,totalOther=5}={}){
 const data={
  'emuzii_参加者':[[idA,name],[idOther,name]],
  'emuzii_ガチャ':[
   Object.assign(Array(17).fill(''),{0:idA,1:name,5:totalA,6:0,9:0,12:'OK',13:'OK'}),
   Object.assign(Array(17).fill(''),{0:idOther,1:name,5:totalOther,6:0,9:0,12:'OK',13:'OK'})],
  'emuzii_景品設定':[
   prize('通常','MEM-A','共通景品','common'),
   prize('通常','MEM-B','通常だけ','normal-only'),
   prize('ラキフェス','LF-A','共通景品','festival-different-key'),
   prize('ラキフェス','LF-B','ラキフェスだけ','fest-only')],
  'emuzii_当選履歴':[]
 };
 const spreadsheet={getSheetByName(tab){
  if(tab==='emuzii_管理画面')return {getRange(k){assert.equal(k,'B23');return {getValue:()=>5}}};
  if(!(tab in data))throw Error('invalid tab '+tab);
  return {appendRow(row){data[tab].push(row.slice())}};
 }};
 let nonce=0;
 const context={
  Date,console:{log(){},error(){}},SpreadsheetApp:{flush(){}},
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},getUuid(){return 'synthetic'+(++nonce)},
  computeDigest(){return Array(32).fill(0)}}};
 runInNewContext(combined,context,{timeout:3000});
 context.rows_=(ss,tab)=>data[tab]||[];
 context.gachaOpenState_=()=>({normalOpen:true,festOpen:true,configured:true});
 function browser(web,mio=idA,status='承認済み',personName=name){
  // Each browser has its OWN Web ID and token. Exactly ONE stable MIO-ID.
  const r=[web,'hash-'+web,personName,'',new Date(),status,'確認済み',mio,
   '','',''+mio,'確認済み','','','',''+mio,'現行',''];
  return {record:r,catalog(){return context.gachaAction_(spreadsheet,r,{action:'catalog'})},
   draw(mode,id){return context.gachaAction_(spreadsheet,r,{action:'draw',mode,drawId:id})},
   history(){return context.gachaAction_(spreadsheet,r,{action:'history'})}};
 }
 function seed(mio,name,mode='通常',n=1,key=name){
  data['emuzii_当選履歴'].push([String(n).padStart(32,'d').slice(0,32),webA,mio,'SYNTHETIC_USER',mode,
     'LEGACY-'+n,name,50,new Date(),n,'確定','N','',key]);
 }
 return {data,context,browser,seed,a:browser(webA),b:browser(webB),other:browser(otherWeb,idOther)};
}
const drawId=x=>x.repeat(32);
const names=c=>c.prizes.map(p=>p.name);
const confirmed=f=>f.data['emuzii_当選履歴'].filter(r=>r[10]==='確定');

test('approved browser B sees browser A winnings excluded by shared MIO-ID',()=>{
 const f=fixture();
 const first=f.a.draw('通常',drawId('1'));
 assert.equal(first.ok,true);assert.equal(first.prize,'共通景品');
 assert.deepEqual(names(f.b.catalog().normal),['通常だけ']);
 assert.deepEqual(names(f.b.catalog().fest),['ラキフェスだけ']);
 assert.equal(f.b.catalog().used,1);
 assert.equal(f.b.catalog().remaining,4);
});
test('browser B draws the only other normal prize with the second right',()=>{
 const f=fixture();
 assert.equal(f.a.draw('通常',drawId('1')).prize,'共通景品');
 const second=f.b.draw('通常',drawId('2'));
 assert.equal(second.ok,true);assert.equal(second.prize,'通常だけ');
 assert.equal(second.ordinal,2);assert.equal(second.remaining,3);
 assert.equal(f.a.catalog().normal.ready,false);
 assert.equal(confirmed(f).length,2);
});
test('browser B cannot replay browser A draw ID to double use or disclose result',()=>{
 const f=fixture();
 assert.equal(f.a.draw('通常',drawId('1')).ok,true);
 const invalid=f.b.draw('通常',drawId('1'));
 assert.equal(invalid.ok,false);
 assert.match(invalid.error,/抽選ID/);
 assert.equal(confirmed(f).length,1);
});
test('same Web ID can safely replay own draw ID without another prize',()=>{
 const f=fixture();
 const first=f.a.draw('通常',drawId('1'));
 const second=f.a.draw('通常',drawId('1'));
 assert.equal(first.ok,true);assert.equal(second.ok,true);
 assert.equal(second.replayed,true);assert.equal(second.prize,first.prize);
 assert.equal(confirmed(f).length,1);
});
test('revoked browser A cannot spend; browser B retains shared winnings',()=>{
 const f=fixture();
 assert.equal(f.a.draw('通常',drawId('1')).ok,true);
 const revoked=f.browser(webA,idA,'却下');
 assert.equal(revoked.draw('通常',drawId('2')).ok,false);
 assert.deepEqual(names(f.b.catalog().normal),['通常だけ']);
 assert.equal(f.b.draw('通常',drawId('3')).prize,'通常だけ');
 assert.equal(confirmed(f).length,2);
});
test('a different MIO-ID remains independent even when nickname identical',()=>{
 const f=fixture();
 const first=f.a.draw('通常',drawId('1'));
 assert.equal(first.prize,'共通景品');
 const other=f.other.draw('通常',drawId('2'));
 assert.equal(other.ok,true);assert.equal(other.prize,'共通景品');
 assert.equal(f.b.catalog().used,1);assert.equal(f.other.catalog().used,1);
 assert.equal(confirmed(f).length,2);
});
test('older confirmed history without col N key still blocks cross-mode from both browsers',()=>{
 const f=fixture();
 for(let i=1;i<=4;i++)f.seed(idA,i===1?'共通景品':'old-prize-'+i,'通常',i,'');
 assert.equal(f.b.catalog().festUnlocked,true);
 assert.deepEqual(names(f.b.catalog().fest),['ラキフェスだけ']);
 assert.equal(f.b.draw('ラキフェス',drawId('5')).prize,'ラキフェスだけ');
 assert.equal(f.a.catalog().fest.ready,false);
 assert.equal(confirmed(f).length,5);
});
test('rights exhausted by browser A remain exhausted from browser B',()=>{
 const f=fixture({totalA:1});
 assert.equal(f.a.draw('通常',drawId('1')).ok,true);
 assert.equal(f.b.catalog().remaining,0);
 assert.equal(f.b.draw('通常',drawId('2')).ok,false);
 assert.equal(confirmed(f).length,1);
});
