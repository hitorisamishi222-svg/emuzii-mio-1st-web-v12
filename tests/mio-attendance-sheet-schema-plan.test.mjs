import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 LIVE_OCTOBER_HEADERS,FUTURE_TAB_PREFIX,planMonthSheetSchema,sheetColumn
} from '../tools/mio-attendance-sheet-schema-plan.mjs';
const base={octoberHeader:[...LIVE_OCTOBER_HEADERS],
 sheetNames:['emuzii_皆勤31日','emuzii_参加者','emuzii_Web登録']};
const plan=(month,overrides={})=>planMonthSheetSchema({...base,month,...overrides});

test('exact live 10月 A1:AI1 has participant columns, 31 days and preserved formulas result columns',()=>{
 assert.equal(LIVE_OCTOBER_HEADERS.length,35);
 assert.equal(LIVE_OCTOBER_HEADERS[0],'参加者ID');
 assert.equal(LIVE_OCTOBER_HEADERS[1],'ColorSing名');
 assert.deepEqual(LIVE_OCTOBER_HEADERS.slice(2,33),
  Array.from({length:31},(_,i)=>'10/'+(i+1)));
 assert.equal(LIVE_OCTOBER_HEADERS[33],'確認済日数');
 assert.equal(LIVE_OCTOBER_HEADERS[34],'皆勤結果');
 const r=plan('2026-10');
 assert.equal(r.ok,true);
 assert.equal(r.status,'OCTOBER_ORIGINAL_PROTECTED');
 assert.equal(r.tab,'emuzii_皆勤31日');
 assert.equal(r.lastColumn,'AI');
 assert.equal(r.createNewTab,false);
 assert.equal(r.memberCopyAllowed,false);
 assert.equal(r.sheetWriteAllowed,false);
 assert.deepEqual(r.requests,[]);
});

test('future November 30 day schema has correct C:AF days and AG/AH totals',()=>{
 const r=plan('2026-11');
 assert.equal(r.ok,true);
 assert.equal(r.status,'NEW_MONTH_STRUCTURE_PROPOSED');
 assert.equal(r.tab,FUTURE_TAB_PREFIX+'2026_11');
 assert.equal(r.days,30);
 assert.equal(r.headerColumns,34);
 assert.equal(r.header[2],'11/1');
 assert.equal(r.header[31],'11/30');
 assert.equal(r.firstDateColumn,'C');
 assert.equal(r.lastDateColumn,'AF');
 assert.equal(r.countColumn,'AG');
 assert.equal(r.resultColumn,'AH');
 assert.equal(r.lastColumn,'AH');
 assert.equal(r.monthVisibleByDefault,false);
 assert.equal(r.backendReady,false);
 assert.equal(r.checkinEnabled,false);
 assert.equal(r.createNewTab,false);
 assert.deepEqual(r.requests,[]);
});

test('leap-year and ordinary February use different column boundaries',()=>{
 const feb28=plan('2027-02'),feb29=plan('2028-02');
 assert.equal(feb28.days,28);
 assert.equal(feb28.headerColumns,32);
 assert.equal(feb28.lastDateColumn,'AD');
 assert.equal(feb28.countColumn,'AE');
 assert.equal(feb28.resultColumn,'AF');
 assert.equal(feb29.days,29);
 assert.equal(feb29.headerColumns,33);
 assert.equal(feb29.lastDateColumn,'AE');
 assert.equal(feb29.countColumn,'AF');
 assert.equal(feb29.resultColumn,'AG');
 assert.equal(sheetColumn(27),'AA');
 assert.equal(sheetColumn(35),'AI');
 assert.equal(sheetColumn(0),null);
});

test('existing month tab cannot be assumed safe without an exact header readback',()=>{
 const november=plan('2026-11');
 const names=[...base.sheetNames,november.tab];
 const unknown=plan('2026-11',{sheetNames:names});
 assert.equal(unknown.ok,false);
 assert.equal(unknown.reason,'EXISTING_MONTH_TAB_NEEDS_EXACT_HEADER_REVIEW');
 const damaged=plan('2026-11',{sheetNames:names,
  existingMonthHeader:[...november.header.slice(0,-1),'変更された結果']});
 assert.equal(damaged.ok,false);
 assert.equal(damaged.sheetWriteAllowed,false);
 const exact=plan('2026-11',{sheetNames:names,
  existingMonthHeader:[...november.header]});
 assert.equal(exact.ok,true);
 assert.equal(exact.status,'EXISTING_MONTH_STRUCTURE_REVIEWED');
 assert.equal(exact.createNewTab,false);
 assert.equal(exact.sheetWriteAllowed,false);
});

test('October original header mutations and missing metadata fail closed',()=>{
 for(const damagedHeader of [
  [],LIVE_OCTOBER_HEADERS.slice(0,-1),
  [...LIVE_OCTOBER_HEADERS.slice(0,2),'11/1',...LIVE_OCTOBER_HEADERS.slice(3)]
 ]){
  const r=plan('2026-11',{octoberHeader:damagedHeader});
  assert.equal(r.ok,false);
  assert.equal(r.reason,'PROTECTED_OCTOBER_HEADER_NOT_VERIFIED');
  assert.deepEqual(r.requests,[]);
 }
 for(const sheetNames of [[],['emuzii_参加者'],['emuzii_皆勤31日','emuzii_皆勤31日']]){
  const r=plan('2026-11',{sheetNames});
  assert.equal(r.ok,false);
  assert.equal(r.reason,'LIVE_SHEET_METADATA_UNVERIFIED');
 }
});

test('month format, bad existing header and injected unexpected tab names never authorize writes',()=>{
 for(const month of ['2026-13','2026-9','2026-10-01','not-a-month',null]){
  const r=plan(month);
  assert.equal(r.ok,false);
  assert.equal(r.sheetWriteAllowed,false);
 }
 const bad=plan('2026-11',{existingMonthHeader:[]});
 assert.equal(bad.reason,'NONEXISTENT_TAB_MUST_NOT_HAVE_HEADER');
 assert.equal(bad.sheetWriteAllowed,false);
});

test('schema planner is pure and never writes GAS, Sheets, HTTP or member records',()=>{
 const s=readFileSync(new URL('../tools/mio-attendance-sheet-schema-plan.mjs',import.meta.url),'utf8');
 for(const forbidden of ['fetch(', 'XMLHttpRequest(', 'SpreadsheetApp.','DriveApp.',
  '.setValues(', '.setValue(', '.appendRow(', '.insertSheet(', '.deleteSheet(',
  'localStorage.', 'process.env.','setTimeout(']){
  assert.equal(s.includes(forbidden),false,forbidden);
 }
 const externalHeader=[...LIVE_OCTOBER_HEADERS],externalNames=[...base.sheetNames];
 const r=planMonthSheetSchema({month:'2026-12',
  octoberHeader:externalHeader,sheetNames:externalNames});
 assert.equal(r.ok,true);
 r.header[2]='changed preview only';
 assert.equal(externalHeader[2],'10/1');
 assert.deepEqual(externalNames,base.sheetNames);
 assert.equal(r.sheetWriteAllowed,false);
 assert.equal(r.publishAllowed,false);
 assert.deepEqual(r.requests,[]);
});
