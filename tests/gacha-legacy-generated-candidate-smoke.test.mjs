/**
 * NEW only — smoke-execute the generated legacy-main *candidate*, not just
 * match its text.  No connection to Google / Vercel or real participants.
 * This does NOT establish production compatibility or permission to deploy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Script,runInNewContext} from 'node:vm';

const tool=resolve('gacha-ui/tools/gacha-legacy-main-candidate.mjs');
const main=resolve(process.env.MIO_MAIN_CODE_PATH);
const staged=resolve(process.env.MIO_GACHA_CORE_PATH);
const patch=resolve('gacha-ui/patches/gacha-won-duplicate-keys-replacement-v216.gs');
const dir=mkdtempSync(join(tmpdir(),'mio-gacha-smoke-'));
const out=join(dir,'candidate.gs'),report=join(dir,'report.json');
const input=join(dir,'source.gs');
writeFileSync(input,readFileSync(main,'utf8')); // distinct input path: preserve pinned baseline untouched
process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
const result=spawnSync(process.execPath,[tool,
 '--source',input,'--baseline',main,'--stage',staged,'--patch',patch,
 '--out',out,'--report',report],{encoding:'utf8',timeout:10000});
assert.equal(result.status,0,result.stderr+' '+result.stdout);
const metadata=JSON.parse(readFileSync(report,'utf8'));
assert.equal(metadata.deployable,false);
assert.equal(metadata.liveGASVerified,false);
const candidate=readFileSync(out,'utf8');
const script=new Script(candidate,{filename:'dry-run-only-gacha-Code.gs'});
const web='MIO-W-'+'a'.repeat(24),mio='MIO-4512',nick='FAKE_TEST';
const gift=(mode,id,name,key)=>[mode,id,name,'R',50,true,'','https://example.org/'+id+'.jpg','',key];
function setup({total=6,prior=0,gateNormal=true,gateFest=true}={}){
 const data={
  'emuzii_参加者':[[mio,nick]],
  'emuzii_ガチャ':[Object.assign(Array(17).fill(''),{0:mio,1:nick,5:total,6:0,9:0,12:'OK',13:'OK'})],
  'emuzii_景品設定':[
   gift('通常','MEM-A','共有宝物',''),
   gift('通常','MEM-B','通常専用',''),
   gift('ラキフェス','LF-A','共有宝物',''),
   gift('ラキフェス','LF-B','祭典専用','')],
  'emuzii_当選履歴':[]
 };
 for(let i=0;i<prior;i++){
  const name=i===0?'共有宝物':'過去に獲得済み'+i;
  data['emuzii_当選履歴'].push([
   i.toString(16).padStart(32,'f'),web,mio,nick,'通常',
   i===0?'MEM-A':'OLD-'+i,name,50,new Date(),i+1,'確定','R','',name
  ]);
 }
 const sheet={getSheetByName(name){
  if(name==='emuzii_管理画面')return {getRange(x){assert.equal(x,'B23');return {getValue(){return 5}}}};
  if(!Object.hasOwn(data,name))throw Error('Unexpected mock table: '+name);
  return {appendRow(row){data[name].push(row.slice())}};
 }};
 let count=0;
 const vm={Date,console:{log(){},error(){}},
  SpreadsheetApp:{flush(){}},
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},
   getUuid(){return 'isolated-uuid-'+(++count)},
   computeDigest(){return Array(32).fill(0)}}};
 script.runInNewContext(vm,{timeout:5000});
 vm.rows_=(ss,tab)=>data[tab]||[];
 vm.gachaOpenState_=()=>({normalOpen:gateNormal,festOpen:gateFest,configured:true});
 const participant=[web,'synthetic-token',nick,'',new Date(),'承認済み','確認済み',mio];
 const send=(action,mode='通常',drawId='a'.repeat(32))=>vm.gachaAction_(sheet,participant,{action,mode,drawId});
 return {send,data};
}
test('generated candidate is executable GAS-compatible JavaScript',()=>{
 assert.doesNotThrow(()=>new Script(candidate));
 assert.ok(candidate.includes('function gachaOpenState_'));
});
test('candidate: before 4 confirmed Web draws, festival cannot spend right',()=>{
 const h=setup({total:6,prior:3});
 const r=h.send('draw','ラキフェス');
 assert.equal(r.ok,false);
 assert.match(r.error,/Webで4回抽選後/);
 assert.equal(h.data['emuzii_当選履歴'].length,3);
});
test('candidate: 5th festival draw does not repeat normal prize and commits history',()=>{
 const h=setup({total:6,prior:4});
 const c=h.send('catalog');
 assert.equal(c.festUnlocked,true);
 assert.deepEqual(c.fest.prizes.map(x=>x.name),['祭典専用']);
 const d=h.send('draw','ラキフェス','e'.repeat(32));
 assert.equal(d.ok,true,JSON.stringify(d));
 assert.equal(d.prize,'祭典専用');
 assert.equal(d.ordinal,5);
 assert.equal(h.data['emuzii_当選履歴'].length,5);
 const again=h.send('draw','ラキフェス','b'.repeat(32));
 assert.equal(again.ok,false);
 assert.equal(h.data['emuzii_当選履歴'].length,5);
});
test('candidate: last right is not overspent, no repeated prize',()=>{
 const h=setup({total:1,prior:0});
 assert.equal(h.send('draw','通常','1'.repeat(32)).ok,true);
 assert.equal(h.send('draw','通常','2'.repeat(32)).ok,false);
 assert.equal(h.data['emuzii_当選履歴'].length,1);
 assert.equal(h.send('catalog').remaining,0);
});
