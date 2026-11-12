import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OCTOBER_MONTH,OCTOBER_SOURCE,monthlyAttemptKey,planAttendanceCalendar}
 from '../tools/mio-attendance-month-plan.mjs';

test('original October always remains mapped to the existing sheet and attempt key',()=>{
 const plan=planAttendanceCalendar();
 assert.equal(plan.ok,true);
 assert.equal(plan.selectedMonth,'2026-10');
 assert.equal(plan.dayCount,31);
 assert.equal(plan.firstWeekdayMondayZero,3);
 assert.equal(plan.originalOctoberSheet,'emuzii_皆勤31日');
 assert.equal(OCTOBER_SOURCE.attemptsStorageKey,'mioAttendanceAttemptsV1');
 assert.deepEqual(monthlyAttemptKey(OCTOBER_MONTH,31),{
  kind:'legacy',storageKey:'mioAttendanceAttemptsV1',entry:'31'
 });
 assert.equal(plan.writeAllowed,false);
 assert.equal(plan.operations.length,0);
});

test('each future month has independent attempt storage, not October local day counters',()=>{
 const plans=[
  ['2026-11',30,6],['2027-02',28,0],['2028-02',29,1]
 ];
 for(const [month,expectedDays,weekday] of plans){
  const plan=planAttendanceCalendar({selectedMonth:month,
   otherMonths:[{month,title:month,visible:true}]});
  assert.equal(plan.dayCount,expectedDays);
  assert.equal(plan.days.length,expectedDays);
  assert.equal(plan.firstWeekdayMondayZero,weekday);
  assert.equal(plan.entryEnabled,false);
  assert.equal(plan.writeAllowed,false);
  assert.equal(plan.backendReady,false);
  assert.equal(monthlyAttemptKey(month,1)?.storageKey,'mioAttendanceAttemptsMonth:'+month);
  assert.notEqual(monthlyAttemptKey(month,1)?.storageKey,monthlyAttemptKey(OCTOBER_MONTH,1)?.storageKey);
  assert.equal(monthlyAttemptKey(month,expectedDays+1),null);
 }
});

test('administrator can hide October in the preview without erasing historical source',()=>{
 const plan=planAttendanceCalendar({selectedMonth:'2026-11',octoberVisible:false,
  otherMonths:[{month:'2026-11',title:'2026年11月',visible:true}]});
 assert.equal(plan.ok,true);
 assert.equal(plan.visibleMonths.some(v=>v.month==='2026-10'),false);
 assert.equal(plan.preservedOctoberRegardlessOfVisibility,true);
 assert.equal(plan.originalOctoberSheet,'emuzii_皆勤31日');
 assert.equal(plan.operations.length,0);
 assert.equal(plan.writeAllowed,false);
 assert.equal(planAttendanceCalendar({octoberVisible:false}).reason,'MONTH_NOT_VISIBLE');
});

test('hidden future months cannot be selected, even with valid dates',()=>{
 const plan=planAttendanceCalendar({selectedMonth:'2026-12',
  otherMonths:[{month:'2026-12',title:'12月',visible:false}]});
 assert.equal(plan.ok,false);
 assert.equal(plan.reason,'MONTH_NOT_VISIBLE');
 assert.equal(plan.writeAllowed,false);
 assert.deepEqual(plan.operations,[]);
});

test('duplicate, malformed, dangerous or October-redefinition configs all stop',()=>{
 const bad=[
  {selectedMonth:'2026-13'},
  {selectedMonth:'2026-1'},
  {octoberVisible:'true'},
  {otherMonths:[{month:'2026-10',visible:true}]},
  {otherMonths:[{month:'2026-11',visible:true},{month:'2026-11',visible:true}]},
  {otherMonths:[{month:'2026-11',visible:'yes'}]},
  {otherMonths:[{month:'2026-11',visible:true,title:'<script>'}]},
  {otherMonths:[{month:'2026-11',visible:true,title:'hello\nworld'}]},
  {otherMonths:null}
 ];
 for(const config of bad){
  const plan=planAttendanceCalendar(config);
  assert.equal(plan.ok,false,JSON.stringify(config));
  assert.equal(plan.writeAllowed,false,JSON.stringify(config));
  assert.deepEqual(plan.operations,[]);
 }
 assert.equal(monthlyAttemptKey('2026-13',1),null);
 assert.equal(monthlyAttemptKey('2026-10',32),null);
 assert.equal(monthlyAttemptKey('2026-10',0),null);
 assert.equal(monthlyAttemptKey('2026-10',1.5),null);
});

test('read-only module cannot alter Sheets, GAS or participant IDs',()=>{
 const code=readFileSync(new URL('../tools/mio-attendance-month-plan.mjs',import.meta.url),'utf8');
 for(const token of ['fetch(','.setValue(','.setValues(','.appendRow(','.clearContent(',
  'SpreadsheetApp.','DriveApp.','localStorage.setItem(', 'process.env.']){
  assert.equal(code.includes(token),false,token);
 }
 const original=Object.freeze({month:'2026-11',title:'新しい月',visible:true});
 const list=[original];
 const plan=planAttendanceCalendar({selectedMonth:'2026-11',otherMonths:list});
 assert.equal(plan.ok,true);
 assert.equal(original.title,'新しい月');
 assert.equal(list.length,1);
 assert.equal(plan.writeAllowed,false);
});
