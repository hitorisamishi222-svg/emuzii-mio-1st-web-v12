import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=file('app.js'),html=file('index.html'),cfg=JSON.parse(file('vercel.json'));
const start=js.indexOf('if(attendanceDay){');
const end=js.indexOf("try{const saved=localStorage.getItem(NAME_KEY)",start);
assert.ok(start>0&&end>start,'source must include October calendar logic');
const calendarScript=js.slice(start,end);

function element(tag){
 return {tag,options:[],children:[],dataset:{},attributes:{},textContent:'',value:'',disabled:false,
  listeners:{},setAttribute(key,value){this.attributes[key]=String(value)},
  appendChild(child){this.children.push(child);if(this.tag==='select')this.options.push(child)},
  addEventListener(type,fn){this.listeners[type]=fn},
  querySelectorAll(selector){
   assert.equal(selector,'button[data-day]');
   return this.children.filter(x=>x.tag==='button'&&x.dataset.day);
  }};
}
function fixture({confirmed=[],locked=[],attempts={},achieved=false}={}){
 const nodes={
  attendanceDay:element('select'),attendanceCalendar:element('div'),
  attendanceKeyword:element('input'),attendanceSubmit:element('button'),
  attendanceMessage:element('p'),attendanceMonthStatus:element('p')
 };
 for(let d=1;d<=31;d++){
  const option=element('option');option.value=String(d);
  nodes.attendanceDay.options.push(option);
 }
 const ctx=vm.createContext({
  attendanceDay:nodes.attendanceDay,attendanceCalendar:nodes.attendanceCalendar,
  document:{createElement:element},
  attendanceDayChosen:false,attendanceConfirmedDays:new Set(confirmed),
  attendanceLockedDays:new Set(locked),attendanceAchieved:achieved,
  localAttempts:day=>attempts[day]||0,
  $:id=>nodes[id],Date,Array,Number,String,Set
 });
 vm.runInContext(calendarScript,ctx);
 return {ctx,nodes,run:source=>vm.runInContext(source,ctx)};
}
const day=(nodes,d)=>nodes.attendanceCalendar.children.find(x=>x.dataset.day===String(d));

test('October 2026 calendar remains rendered after month end; all 31 day choices stay available for inspection',()=>{
 const {nodes}=fixture();
 assert.equal(nodes.attendanceDay.value,'1');
 assert.equal(nodes.attendanceCalendar.children.length,34); // Thursday begins after Mon/Tue/Wed.
 assert.equal(nodes.attendanceCalendar.children.filter(x=>x.tag==='button').length,31);
 assert.equal(day(nodes,1).type,'button');
 assert.equal(day(nodes,31).type,'button');
 assert.equal(day(nodes,31).attributes['aria-label'],'10月31日 入力可能');
 assert.match(nodes.attendanceMonthStatus.textContent,/2026年10月/);
 assert.equal(nodes.attendanceSubmit.disabled,false);
});
test('a preconfirmed October 1 automatically selects first remaining open date on verified status',()=>{
 const {nodes,ctx,run}=fixture({confirmed:[1,2,3],locked:[4],attempts:{5:2}});
 run('preferAvailableOctoberDay();syncAttendanceLock()');
 assert.equal(nodes.attendanceDay.value,'6');
 assert.equal(day(nodes,1).dataset.state,'confirmed');
 assert.equal(day(nodes,4).dataset.state,'locked');
 assert.equal(day(nodes,5).dataset.state,'locked');
 assert.equal(day(nodes,6).attributes['aria-pressed'],'true');
 assert.equal(nodes.attendanceSubmit.disabled,false);
 assert.match(nodes.attendanceMonthStatus.textContent,/入力可能な日付 26日/);
 assert.equal(ctx.attendanceConfirmedDays.size,3,'confirmed server history remains unchanged');
});
test('operator explicitly selected a day: never overwrite manual choice after a status refresh',()=>{
 const {nodes,run}=fixture({confirmed:[1]});
 day(nodes,25).listeners.click();
 assert.equal(nodes.attendanceDay.value,'25');
 run('attendanceConfirmedDays.add(25);preferAvailableOctoberDay();syncAttendanceLock()');
 assert.equal(nodes.attendanceDay.value,'25');
 assert.equal(nodes.attendanceSubmit.disabled,true);
 assert.match(nodes.attendanceMessage.textContent,/確認済み/);
 day(nodes,26).listeners.click();
 assert.equal(nodes.attendanceSubmit.disabled,false);
 assert.equal(day(nodes,26).attributes['aria-pressed'],'true');
});
test('lock and achieved states are not bypassed by the calendar',()=>{
 const {nodes}=fixture({confirmed:[1],locked:[2],attempts:{3:2},achieved:true});
 day(nodes,4).listeners.click();
 assert.equal(nodes.attendanceSubmit.disabled,true);
 assert.equal(nodes.attendanceKeyword.disabled,true);
 assert.match(nodes.attendanceMonthStatus.textContent,/皆勤達成済み/);
 day(nodes,3).listeners.click();
 assert.equal(day(nodes,3).dataset.state,'locked');
 assert.equal(nodes.attendanceSubmit.disabled,true);
});
test('all 31 blocked days do not produce false claim of restoration',()=>{
 const all=Array.from({length:31},(_,i)=>i+1);
 const {nodes,run}=fixture({locked:all});
 run('preferAvailableOctoberDay();syncAttendanceLock()');
 assert.equal(nodes.attendanceSubmit.disabled,true);
 assert.match(nodes.attendanceMonthStatus.textContent,/入力可能な日付が表示されていません/);
});
test('retains original 2026 October backend identity and routes, without writing historical participant records',()=>{
 assert.match(html,/2026年10月 · 記録を保持しています/);
 assert.match(html,/id="attendanceCalendar"/);
 assert.match(html,/id="attendanceDay"/);
 assert.match(html,/id="attendanceKeyword"/);
 assert.match(html,/id="attendanceSubmit"/);
 assert.match(js,/post\('\/api\/checkin',\{keyword:k\.value\.trim\(\),day\}\)/);
 assert.match(js,/attendanceAchieved\|\|done\|\|locked/);
 assert.doesNotMatch(js,/attendanceDay\.value=String\(Math\.min\(31,Math\.max\(1,now\.getMonth/);
 assert.equal(cfg.routes.find(x=>x.src==='/api/checkin')?.dest,'/api-checkin.js');
 const server=file('api-checkin.js');
 assert.match(server,/bridge\('checkin',\{participantId:s\.id,tokenHash:hash\(s\.token\),keyword,day\}\)/);
 assert.equal(cfg.builds.some(x=>x.src==='api-checkin.js'),true);
 assert.doesNotMatch(js,/localStorage\.clear\(\)|attendanceConfirmedDays\.clear\(\)|sessionStorage\.clear\(\)/);
});
