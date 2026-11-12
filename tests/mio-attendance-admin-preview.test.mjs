import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 initialPreviewState,visibleMonthList,addPreviewMonth,
 setPreviewVisibility,selectPreviewMonth,getPreviewPlan
} from '../mio-attendance-admin-preview.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=file('mio-attendance-admin-preview.html');
const script=file('mio-attendance-admin-preview.js');
const cfg=JSON.parse(file('vercel.json'));

test('development preview starts with original October and a separate November example',()=>{
 const state=initialPreviewState();
 assert.equal(state.selectedMonth,'2026-10');
 assert.equal(state.octoberVisible,true);
 assert.deepEqual(state.otherMonths,[{month:'2026-11',title:'2026年11月',visible:true}]);
 const p=getPreviewPlan(state);
 assert.equal(p.ok,true);
 assert.equal(p.originalOctoberSheet,'emuzii_皆勤31日');
 assert.equal(p.dayCount,31);
 assert.equal(p.entryEnabled,false);
 assert.equal(p.writeAllowed,false);
});

test('adding a new month selects a correct day count and never mutates October',()=>{
 const original=initialPreviewState();
 const result=addPreviewMonth(original,'2028-02');
 assert.equal(result.ok,true);
 assert.equal(result.state.selectedMonth,'2028-02');
 assert.equal(getPreviewPlan(result.state).dayCount,29);
 assert.equal(getPreviewPlan(result.state).writeAllowed,false);
 assert.equal(original.otherMonths.length,1);
 assert.equal(original.selectedMonth,'2026-10');
 const invalid=addPreviewMonth(result.state,'2028-02');
 assert.equal(invalid.ok,false);
 assert.equal(invalid.state,result.state);
 assert.equal(addPreviewMonth(result.state,'2028-13').ok,false);
});

test('hide October without deleting it and restore visibility',()=>{
 const init=initialPreviewState();
 const hidden=setPreviewVisibility(init,'2026-10',false);
 assert.equal(hidden.ok,true);
 assert.equal(hidden.state.octoberVisible,false);
 assert.equal(hidden.state.selectedMonth,'2026-11');
 assert.equal(visibleMonthList(hidden.state).some(x=>x.month==='2026-10'),false);
 assert.equal(getPreviewPlan(hidden.state).preservedOctoberRegardlessOfVisibility,true);
 assert.equal(selectPreviewMonth(hidden.state,'2026-10').ok,false);
 const shown=setPreviewVisibility(hidden.state,'2026-10',true);
 assert.equal(shown.ok,true);
 assert.equal(selectPreviewMonth(shown.state,'2026-10').ok,true);
 assert.equal(init.octoberVisible,true);
 assert.equal(init.selectedMonth,'2026-10');
});

test('unknown months and hiding last visible month are rejected',()=>{
 const s=initialPreviewState();
 assert.equal(selectPreviewMonth(s,'2026-12').ok,false);
 assert.equal(setPreviewVisibility(s,'2026-12',false).ok,false);
 const first=setPreviewVisibility(s,'2026-11',false);
 assert.equal(first.ok,true);
 const last=setPreviewVisibility(first.state,'2026-10',false);
 assert.equal(last.ok,false);
 assert.equal(last.state,first.state);
 assert.equal(visibleMonthList(first.state).length,1);
});

test('preview has restrictive CSP, no auth bypass and no real GAS/Sheet calls',()=>{
 assert.match(html,/noindex,nofollow,noarchive/);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/form-action 'none'/);
 assert.match(html,/実際の皆勤管理画面ではありません/);
 assert.match(html,/id="monthControls"/);
 assert.match(html,/id="calendar"/);
 assert.match(html,/id="addForm"/);
 assert.match(html,/id="notice"/);
 assert.match(script,/planAttendanceCalendar/);
 for(const forbidden of ['fetch(', 'XMLHttpRequest(', 'localStorage.', 'sessionStorage.',
  'SpreadsheetApp.', 'DriveApp.', '/api/checkin', '.setValue(', '.appendRow(']){
  assert.equal(script.includes(forbidden),false,forbidden);
 }
 const paths=['mio-attendance-admin-preview.html',
  'mio-attendance-admin-preview.js','tools/mio-attendance-month-plan.mjs'];
 for(const path of paths){
  assert.equal(cfg.builds.filter(x=>x.src===path&&x.use==='@vercel/static').length,1);
  assert.equal(cfg.routes.filter(x=>x.src==='/'+path&&x.dest==='/'+path).length,1);
 }
 assert.equal(cfg.routes.find(x=>x.src==='/api/checkin')?.dest,'/api-checkin.js');
 assert.ok(cfg.builds.some(x=>x.src==='gacha.html'));
 assert.ok(cfg.builds.some(x=>x.src==='gacha-web-gate.html'));
});
