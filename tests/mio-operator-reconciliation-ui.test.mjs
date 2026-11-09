import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../gacha-admin-ops.js',import.meta.url),'utf8');
const start=ui.indexOf('function updateQuick(){');
const end=ui.indexOf("\nfor(const [id,target] of",start);
assert.ok(start>0&&end>start,'actual operator UI contains updateQuick()');
const segment=ui.slice(start,end);
// Execute the source's own name normalization helper alongside the extracted
// read-only summary, so tests fail only for real contract regressions.
const helperStart=ui.indexOf('function safe(');
const helperEnd=ui.indexOf('\nfunction node(',helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart,'actual operator UI contains safe/nameKey helpers');
const helpers=ui.slice(helperStart,helperEnd);
const id=n=>'MIO-'+String(n).padStart(4,'0');
const participant=n=>({mioId:id(n),name:'local-secret-name',gacha:{remaining:1,checked:true,total:2,special:0}});
const browser=(n,verified=true)=>({mioId:id(n),verified,webId:'synthetic-browser',name:'local-secret-name'});
const run=state=>{
 const summary={textContent:''},remaining={textContent:''};
 const ctx={
  el:n=>n==='opsQuickSummary'?summary:n==='opsRemainingSummary'?remaining:null,
  state,selected:null,snapshot:{normalOpen:false}
 };
 vm.runInNewContext(helpers+'\n'+segment+'\nupdateQuick();',ctx);
 return {summary:summary.textContent,remaining:remaining.textContent};
};
test('operator UI displays 8 single / 1 missing / 2 multiple candidates from VERIFIED approved browsers',()=>{
 const roster=Array.from({length:11},(_,i)=>participant(i+1));
 const approvedBrowsers=[
  ...Array.from({length:8},(_,i)=>browser(i+1)),
  browser(10),browser(10),browser(11),browser(11),
  browser(9,false)
 ];
 const x=run({
  roster,approvedBrowsers,totalPending:0,writeEnabled:false,
  schemaReady:false,writeMode:'locked'
 });
 assert.match(x.summary,/端末照合候補：単独 8名 \/ なし 1名 \/ 複数 2名/);
 assert.match(x.summary,/管理書込 停止中/);
 assert.match(x.summary,/既存ガチャ残回数あり 11名/);
 assert.match(x.summary,/抽選許可になりません/);
 assert.doesNotMatch(x.summary,/local-secret-name|synthetic-browser/);
});
test('absence of browser metadata never becomes a confirmed candidate',()=>{
 const x=run({roster:[participant(1)],approvedBrowsers:[],
  totalPending:0,schemaReady:true,writeEnabled:false,writeMode:'locked'});
 assert.match(x.summary,/単独 0名 \/ なし 1名 \/ 複数 0名/);
});
test('no admin connection shows neutral message without stale reconciliation',()=>{
 const x=run(null);
 assert.match(x.summary,/管理者の接続待ち/);
 assert.doesNotMatch(x.summary,/端末照合候補/);
});
test('multiple approved browsers are not silently considered one identity',()=>{
 const x=run({roster:[participant(1)],approvedBrowsers:[browser(1),browser(1)],
  totalPending:0,schemaReady:false,writeEnabled:false,writeMode:'locked'});
 assert.match(x.summary,/単独 0名 \/ なし 0名 \/ 複数 1名/);
});
test('read-only reconciliation cannot enable write buttons or mark identity approved',()=>{
 assert.match(segment,/browser\?\.verified!==true/);
 assert.match(segment,/ブラウザ一致だけでは本人確認や抽選許可になりません/);
 assert.doesNotMatch(segment,/state\.writeEnabled\s*=|\.disabled\s*=\s*false/);
});


test('approved display-name conflict cannot count as a single verified browser candidate',()=>{
 const roster=[participant(1),participant(2)];
 const approvedBrowsers=[
  {...browser(1),name:'local-secret-name'},
  {...browser(2),name:'old-display-name'}
 ];
 const x=run({roster,approvedBrowsers,totalPending:0,writeEnabled:false,
  schemaReady:false,writeMode:'locked'});
 assert.match(x.summary,/端末照合候補：単独 1名 \/ なし 0名 \/ 複数 0名 \/ 表示名要照合 1名/);
 assert.match(x.summary,/承認済み表示名の差異 1件/);
 assert.match(x.summary,/管理書込 停止中/);
 assert.doesNotMatch(x.summary,/old-display-name|local-secret-name/);
});

test('a matching browser plus a conflicting approved browser cannot be called single',()=>{
 const approvedBrowsers=[
  {...browser(1),name:'local-secret-name'},
  {...browser(1),name:'different-registered-display-name'}
 ];
 const x=run({roster:[participant(1)],approvedBrowsers,totalPending:0,
  schemaReady:false,writeEnabled:false,writeMode:'locked'});
 assert.match(x.summary,/端末照合候補：単独 0名 \/ なし 0名 \/ 複数 0名 \/ 表示名要照合 1名/);
 assert.match(x.summary,/承認済み表示名の差異 1件/);
});
