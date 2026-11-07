import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileGachaBrowserLinks} from '../tools/mio-operator-reconciliation.mjs';
const id=i=>'MIO-'+String(i).padStart(4,'0');
const gacha=(i,remaining=1,checked=true)=>{
 const row=Array(15).fill('');
 row[0]=id(i);row[1]='private-name-'+i;row[5]=2;
 row[7]=remaining;row[12]=checked?'OK':'未確認';
 row[13]=checked?'OK':'未確認';row[14]=0;return row;
};
const web=(i,{approved=true,consistent=true,old=false}={})=>{
 const row=Array(12).fill('');
 row[0]=approved?'承認済み':'承認待ち';row[2]=id(i);
 row[5]=consistent?id(i):id(9999);row[6]='確認済み';
 row[10]=id(i);row[11]=old?'旧端末':'使用中';
 return row;
};
const fixture=()=>{
 const gachaRows=Array.from({length:51},(_,i)=>gacha(i+1,i<11?1:0));
 const webRows=[
  ...Array.from({length:8},(_,i)=>web(i+1)),
  ...[10,10,11,11].map(i=>web(i)),
  web(9,{approved:false}),web(9,{old:true})
 ];
 return {gachaRows,webRows};
};
test('8 single / 1 missing / 2 multiple linked candidate rows summarized with no names',()=>{
 const out=reconcileGachaBrowserLinks(fixture());
 assert.equal(out.ok,true);assert.equal(out.status,'READ_ONLY_PRELIMINARY');
 assert.deepEqual(out.counts,{
  gachaRows:51,positiveChecked:11,singleCandidate:8,noCandidate:1,
  multipleCandidates:2,creditsNeedReview:0,zeroBalance:40
 });
 assert.equal(out.personIdentityVerified,false);assert.equal(out.drawAuthorization,false);
 assert.equal(out.writeAllowed,false);
 assert.equal(JSON.stringify(out).includes('private-name'),false);
});
test('old devices, pending and inconsistent lookup do not authorize a link',()=>{
 for(const variant of [{approved:false},{old:true},{consistent:false}]){
  const out=reconcileGachaBrowserLinks({webRows:[web(1,variant)],gachaRows:[gacha(1)]});
  assert.equal(out.counts.noCandidate,1);
  assert.equal(out.counts.singleCandidate,0);
 }
});
test('balance greater than total or missing gacha fields trigger review, not positive count',()=>{
 const bad=gacha(1,3),unchecked=gacha(2,1,false),missing=gacha(3,1);
 missing[14]='';
 const out=reconcileGachaBrowserLinks({webRows:[web(1),web(2),web(3)],gachaRows:[bad,unchecked,missing]});
 assert.equal(out.ok,true);assert.equal(out.counts.creditsNeedReview,3);
 assert.equal(out.counts.positiveChecked,0);
});
test('duplicate gacha identifiers reject all reconciliation as unsafe',()=>{
 const out=reconcileGachaBrowserLinks({webRows:[web(1)],gachaRows:[gacha(1),gacha(1)]});
 assert.equal(out.ok,false);assert.equal(out.reason,'DUPLICATE_GACHA_ID');
 assert.equal(out.writeAllowed,false);
});
test('empty, malformed or too-large sheet responses fail closed',()=>{
 for(const input of [
  {webRows:null,gachaRows:[]},
  {webRows:[],gachaRows:null},
  {webRows:[{}],gachaRows:[]},
  {webRows:[],gachaRows:[{}]},
  {webRows:Array(1001).fill([]),gachaRows:[]},
  {webRows:[],gachaRows:Array(501).fill([])}
 ]){
  const out=reconcileGachaBrowserLinks(input);
  assert.equal(out.status,'STOP');assert.equal(out.writeAllowed,false);
 }
});
test('zero balance row does not imply confirmed identity or draw permission',()=>{
 const out=reconcileGachaBrowserLinks({webRows:[web(1)],gachaRows:[gacha(1,0)]});
 assert.equal(out.ok,true);assert.equal(out.counts.zeroBalance,1);
 assert.equal(out.counts.positiveChecked,0);
 assert.equal(out.drawAuthorization,false);
});
test('module has no provider API, mutation verbs or browser access',()=>{
 const src=readFileSync(new URL('../tools/mio-operator-reconciliation.mjs',import.meta.url),'utf8');
 for(const token of ['fetch(','.setValues(','.setValue(','.appendRow(','.insertSheet(','.deleteSheet(','SpreadsheetApp.','DriveApp.','document.','window.'])
  assert.equal(src.includes(token),false);
});
