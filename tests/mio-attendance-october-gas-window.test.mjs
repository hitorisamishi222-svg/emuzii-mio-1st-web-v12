import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs',import.meta.url),'utf8');
const beg=src.indexOf('function checkinAction_(ss,r,d){');
const end=src.indexOf('\nvar PRIZE_TAB=',beg);
assert.ok(beg>0&&end>beg,'original checkinAction_ needs to exist intact');
const code=src.slice(beg,end);
const originalSchema=src.slice(0,beg);
const WEB='MIO-W-'+'a'.repeat(24),PERSON='MIO-0001';
const row=()=>{const r=[];r[0]=WEB;r[2]='架空管理者';r[5]='承認済み';r[7]=PERSON;return r};
function fixture({today='2026-11-06',keyword='correct',attempts=0,confirmed=[],ownerApproved=true,personMatch=true}={}){
 const state={attempts,checks:Object.fromEntries(confirmed.map(n=>[n,'○'])),writes:[],flush:0,readNames:[]};
 const admin={
  getRange(row,col){assert.equal(col,2);return {
   getDisplayValue(){return row===76+15?keyword:'correct'}
  }}
 };
 const attendance={
  getLastRow(){return 2},
  getRange(...args){
   if(args.length===4){
    assert.deepEqual(args,[2,1,1,2]);
    return {getValues:()=>[[PERSON,'架空管理者']]};
   }
   assert.equal(args.length,2);
   const [rowNum,column]=args;assert.equal(rowNum,2);
   assert.ok(column>=3&&column<=33);
   const day=column-2;
   return {getValue:()=>state.checks[day]||'',setValue:value=>{
    state.writes.push({day,value});
    state.checks[day]=value;
   }};
  }
 };
 const sheets={'emuzii_管理画面':admin,'emuzii_皆勤31日':attendance};
 const ss={getSheetByName:name=>{state.readNames.push(name);if(!(name in sheets))throw Error('UNEXPECTED_SHEET');return sheets[name]}};
 const r=row();if(!ownerApproved)r[5]='承認待ち';if(!personMatch)r[7]='MIO-9999';
 const scope={
  rows_:(db,name)=>{assert.equal(db,ss);assert.equal(name,'emuzii_参加者');return [[PERSON,'架空管理者']]},
  jstYmd_:()=>today,
  equal_:(a,b)=>String(a)===String(b),
  checkinAttempts_:()=>state.attempts,
  setCheckinAttempts_:(id,day,count)=>{assert.equal(id,PERSON);state.attempts=count},
  SpreadsheetApp:{flush:()=>state.flush++},
  Date,Number,String,Math,isFinite
 };
 const f=vm.runInNewContext(code+'\ncheckinAction_',scope);
 const run=(day,answer='correct')=>f(ss,r,{day,keyword:answer});
 return {state,run};
}
test('October 2026: before the month cannot enter any date',()=>{
 const {run,state}=fixture({today:'2026-09-30'});
 const result=run(1);assert.equal(result.ok,false);
 assert.match(result.error,/まだ始まっていません/);
 assert.equal(state.writes.length,0);
});
test('October 2026: future day is still blocked until it arrives',()=>{
 const {run,state}=fixture({today:'2026-10-05'});
 const result=run(6);assert.equal(result.ok,false);
 assert.match(result.error,/未来の日付/);assert.equal(state.writes.length,0);
});
test('November: verified October catch-up for all 31 day slots, not only same day-of-month',()=>{
 for(const day of [1,6,7,15,30,31]){
  const {run,state}=fixture({today:'2026-11-06'});
  const result=run(day);
  assert.equal(result.ok,true,'expected Oct '+day+' to remain open');
  assert.equal(result.participantId,WEB);
  assert.deepEqual(state.writes,[{day,value:'○'}]);
  assert.equal(state.attempts,0);
  assert.equal(state.flush,1);
 }
});
test('later months do not silently create November/December records or a new table',()=>{
 const {run,state}=fixture({today:'2026-12-10'});
 const result=run(31);
 assert.equal(result.ok,true);
 assert.deepEqual(state.writes,[{day:31,value:'○'}]);
 assert.ok(state.readNames.every(name=>['emuzii_管理画面','emuzii_皆勤31日'].includes(name)));
});
test('already confirmed October date remains idempotent without any write',()=>{
 const {run,state}=fixture({today:'2026-11-06',confirmed:[12]});
 const result=run(12);
 assert.equal(result.ok,true);assert.equal(result.already,true);
 assert.equal(state.flush,0);assert.equal(state.writes.length,0);
});
test('original 2-attempt lock, identity and admin approval continue to reject writes',()=>{
 const locked=fixture({attempts:2});
 const denied=locked.run(14);
 assert.equal(denied.ok,false);assert.equal(denied.locked,true);
 assert.equal(locked.state.writes.length,0);
 const wrong=fixture({attempts:0});
 const failed=wrong.run(14,'incorrect');
 assert.equal(failed.ok,false);assert.equal(wrong.state.attempts,1);
 assert.equal(wrong.state.writes.length,0);
 const second=wrong.run(14,'incorrect');
 assert.equal(second.ok,false);assert.equal(second.locked,true);assert.equal(wrong.state.writes.length,0);
 for(const config of [{ownerApproved:false},{personMatch:false}]){
  const f=fixture(config);assert.equal(f.run(14).ok,false);assert.equal(f.state.writes.length,0);
 }
});
test('invalid day or empty keyword never writes to original October sheet',()=>{
 const {run,state}=fixture();
 for(const [day,answer] of [[0,'correct'],[32,'correct'],['something','correct'],[20,''],[1.2,'correct']]){
  assert.equal(run(day,answer).ok,false);
 }
 assert.equal(state.writes.length,0);
});
test('October column mapping and access safeguards unchanged',()=>{
 assert.match(code,/var cell=sh\.getRange\(row,day\+2\)/);
 assert.match(code,/var expected=String\(admin\.getRange\(76\+day,2\)/);
 assert.match(code,/CHECKIN_MAX_ATTEMPTS/);
 assert.match(code,/checkinAttempts_\(r\[7\],day\)/);
 assert.match(code,/if\(cell\.getValue\(\)==='○'\)/);
 assert.match(code,/if\(!r\[7\]\|\|people\.length!==1\)/);
 assert.match(originalSchema,/var CHECKIN_MAX_ATTEMPTS = 2/);
 assert.doesNotMatch(code,/removeRow|deleteRow|deleteSheet|clearContent|clear\(\)|setup\(/i);
});
