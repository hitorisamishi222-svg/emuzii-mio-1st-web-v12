import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../gas/mio-verified-alias-v213.gs',import.meta.url),'utf8');
function fixture(){
 const canonical='MIO-0010',legacy='MIO-0040',name='まーくん',alias='まーくん💎🐳ྀི🎃🎁✨️';
 const light='MIO-W-e1a31c322e98578b68f9b31c';
 const web=[light,'a'.repeat(64),alias,'','2026-10-19','承認済み','未確認',canonical,'','管理者本人確認済み',canonical,'確認済み','','','',legacy];
 const gacha=(id,n,total=0,used=0,fest=0)=>{const row=Array(17).fill('');row[0]=id;row[1]=n;row[5]=total;row[6]=used;row[9]=fest;row[12]='OK';row[13]='OK';return row};
 const attendance=(id,n)=>[id,n,...Array(31).fill(''),'0'];
 const data={
  emuzii_参加者:[[canonical,name,'2026/10/10'],[legacy,alias,'']],
  emuzii_本人統合:[[canonical,legacy,alias,'確認済み','2026/10/22','本人確認済み',light]],
  emuzii_皆勤31日:[attendance(canonical,name),attendance(legacy,alias)],
  emuzii_ガチャ:[gacha(canonical,name,6,1),gacha(legacy,alias,0,1)],
  emuzii_当選履歴:[['draw1','browser1',legacy,alias,'通常','','景品','','',1,'確定']]
 };
 const originals=structuredClone(data);
 const attempts=new Map();
 const context={};
 vm.createContext(context);
 vm.runInContext(
  'var DRAW_TAB="emuzii_当選履歴", CHECKIN_MAX_ATTEMPTS=2;'+
  'function rows_(ss,name){return ss[name]||[];}'+
  'function checkinAttempts_(id,day){return globalThis.attempts.get(id+":"+day)||0;}'+source,
  Object.assign(context,{attempts}));
 return {context,canonical,legacy,name,alias,light,web,data,originals,attempts};
}
test('module syntax, explicit administrator mapping and FA participant names are preserved',()=>{
 const f=fixture(),m=f.context.mioAliasMapV213_(f.data,f.canonical);
 assert.equal(m.canonical[0],f.canonical);
 assert.deepEqual(Array.from(m.ids),[f.canonical,f.legacy]);
 assert.deepEqual(Array.from(m.names),[f.name,f.alias]);
 assert.deepEqual(Array.from(f.context.mioCanonicalPersonV213_(f.data,f.web)),f.data.emuzii_参加者[0]);
 assert.equal(f.context.mioAliasIntegrityV213_(f.data,f.web),true);
});
test('new registration cannot claim an alias by name, wrong admin mapping, or unexpected device',()=>{
 const f=fixture();
 assert.equal(f.context.mioCanonicalPersonV213_(f.data,[...f.web.slice(0,9),'既存一致',...f.web.slice(10)]),null);
 assert.equal(f.context.mioAliasIntegrityV213_(f.data,[...f.web.slice(0,15),'MIO-0888']),false);
 f.data.emuzii_本人統合[0][3]='未確認';
 assert.equal(f.context.mioCanonicalPersonV213_(f.data,f.web),null);
});
test('existing source and canonical browser sessions resolve a single identity',()=>{
 const f=fixture();
 const old=[f.light,'a'.repeat(64),f.alias,'','','承認済み','未確認',f.legacy,'','既存一致',f.legacy,'確認済み'];
 const original=[f.light,'a'.repeat(64),f.name,'','','承認済み','未確認',f.canonical,'','既存一致',f.canonical,'確認済み'];
 assert.equal(f.context.mioCanonicalPersonV213_(f.data,old)[0],f.canonical);
 assert.equal(f.context.mioCanonicalPersonV213_(f.data,original)[0],f.canonical);
});
test('attendance days from two rows are a union; original days never overwritten',()=>{
 const f=fixture();f.data.emuzii_皆勤31日[0][2]='○';f.data.emuzii_皆勤31日[0][4]='○';
 f.data.emuzii_皆勤31日[1][4]='○';f.data.emuzii_皆勤31日[1][8]='○';
 const before=structuredClone(f.data.emuzii_皆勤31日);
 const days=f.context.mioMergedDaysV213_(f.data,f.canonical);
 assert.deepEqual(Array.from(days),[1,3,7]);
 assert.deepEqual(f.data.emuzii_皆勤31日,before);
});
test('two failed attempts across two IDs cannot be reset by switching browsers',()=>{
 const f=fixture();f.attempts.set(f.canonical+':5',1);f.attempts.set(f.legacy+':5',1);
 assert.equal(f.context.mioMergedAttemptsV213_(f.data,f.canonical,5),2);
 assert.ok(Array.from(f.context.mioMergedLockedDaysV213_(f.data)).includes(5));
});
test('manual gacha and prize history are counted once; no new entitlements',()=>{
 const f=fixture();
 assert.equal(f.context.mioMergedManualV213_(f.data,f.canonical),2);
 const draws=f.context.mioMergedDrawsV213_(f.data,f.canonical);
 assert.equal(draws.length,1);
 assert.equal(draws[0][0],'draw1');
 assert.deepEqual(f.data,f.originals);
});
test('second nonzero entitlement or ambiguous history must halt instead of crediting',()=>{
 const f=fixture();
 f.data.emuzii_ガチャ[1][5]=3;
 assert.equal(f.context.mioMergedManualV213_(f.data,f.canonical),null);
 f.data.emuzii_ガチャ[1][5]=0;
 f.data.emuzii_本人統合.push([...f.data.emuzii_本人統合[0]]);
 assert.equal(f.context.mioAliasMapV213_(f.data,f.canonical),null);
 assert.equal(f.context.mioMergedDaysV213_(f.data,f.canonical),null);
 assert.equal(f.context.mioMergedManualV213_(f.data,f.canonical),null);
});
