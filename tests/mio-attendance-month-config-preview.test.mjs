import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {
 initialMonthPreview,addMonthPreview,setMonthVisibilityPreview,
 getVisibleMonthsPreview,monthLength
} from '../attendance-month-config-preview.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const config=JSON.parse(read('vercel.json'));
const html=read('attendance-months-preview.html');

test('Oct 2026 record stays as a 31-day legacy month, visible by default',()=>{
 const m=initialMonthPreview();
 assert.deepEqual(m,[{month:'2026-10',title:'みお1周年・10月皆勤賞',
  visible:true,dayCount:31,source:'legacy-october'}]);
 assert.ok(Object.isFrozen(m)&&Object.isFrozen(m[0]));
});
test('new month has correct 28/29/30/31 dates, stays hidden until manager toggle',()=>{
 let state=initialMonthPreview();
 for(const [month,title,length] of [
  ['2026-11','11月',30],['2027-02','2月',28],['2028-02','閏年',29],
  ['2100-02','非うるう年',28],['2027-01','新年',31]]){
  assert.equal(monthLength(month),length);
  state=addMonthPreview(state,{month,title});
  assert.equal(state.find(x=>x.month===month)?.visible,false);
  assert.equal(state.find(x=>x.month===month)?.dayCount,length);
 }
 assert.equal(state.find(x=>x.month==='2026-10')?.dayCount,31);
 assert.equal(getVisibleMonthsPreview(state).length,1);
 state=setMonthVisibilityPreview(state,{month:'2026-11',visible:true});
 assert.deepEqual(getVisibleMonthsPreview(state).map(x=>x.month),['2026-11','2026-10']);
});
test('hiding existing October month never removes it or affects its stored metadata',()=>{
 let months=initialMonthPreview(),snapshot={...months[0]};
 months=setMonthVisibilityPreview(months,{month:'2026-10',visible:false});
 assert.equal(months.length,1);
 assert.deepEqual(months[0],{...snapshot,visible:false});
 assert.deepEqual(getVisibleMonthsPreview(months),[]);
 months=setMonthVisibilityPreview(months,{month:'2026-10',visible:true});
 assert.deepEqual(months[0],snapshot);
});
test('duplicate month (especially October), invalid dates and bad titles fail closed',()=>{
 let months=addMonthPreview(initialMonthPreview(),{month:'2026-11',title:'新しい月'});
 for(const v of [
  {month:'2026-10',title:'過去月を上書き'},
  {month:'2026-11',title:'二重'},
  {month:'2026-00',title:'違反'},
  {month:'2026-13',title:'違反'},
  {month:'2026-2',title:'違反'},
  {month:'2026-12',title:'\n'},
  {month:'2026-12',title:'A'.repeat(61)},
  {month:'2026-12',title:'名前\u0000'}
 ]){
  assert.throws(()=>addMonthPreview(months,v),/ATTENDANCE_MONTH_PREVIEW_/);
  assert.equal(months.length,2);
 }
 assert.throws(()=>setMonthVisibilityPreview(months,{month:'2026-12',visible:true}),/MONTH_NOT_FOUND/);
 assert.throws(()=>setMonthVisibilityPreview(months,{month:'2026-11',visible:'yes'}),/VISIBILITY_INVALID/);
});
test('immutable data and contaminated state are never silently trusted',()=>{
 let months=initialMonthPreview();
 assert.throws(()=>{months[0].visible=false},TypeError);
 assert.throws(()=>{months.push({})},TypeError);
 assert.throws(()=>addMonthPreview([], {month:'2026-11',title:'new'}),/LEGACY_OCTOBER_REQUIRED/);
 assert.throws(()=>setMonthVisibilityPreview([{...months[0],status:'published'}],{
  month:'2026-10',visible:false
 }),/COLLECTION_FIELDS_INVALID/);
 assert.throws(()=>setMonthVisibilityPreview([{...months[0],source:'new-rehearsal'}],{
  month:'2026-10',visible:false
 }),/LEGACY_MISMATCH/);
});
test('demo page exposes no real owner controls, checkin API, GAS, browser storage or external calls',()=>{
 assert.match(html,/開発用の操作練習版です/);
 assert.match(html,/この画面の変更はブラウザ内だけ/);
 assert.match(html,/新しい月を仮追加/);
 assert.match(html,/id="visitorMonths"/);
 assert.match(html,/id="monthList"/);
 assert.doesNotMatch(html,/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|authToken|secret=|GAS_URL|session_id/i);
 assert.doesNotMatch(read('attendance-month-config-preview.mjs'),/fetch\s*\(|localStorage|sessionStorage|process\.env|Sheets\.|SpreadsheetApp|setValues\(/);
 assert.ok(config.builds.some(x=>x.src==='attendance-months-preview.html'&&x.use==='@vercel/static'));
 assert.ok(config.builds.some(x=>x.src==='attendance-month-config-preview.mjs'&&x.use==='@vercel/static'));
 assert.equal(config.routes.some(x=>x.src==='/api/attendance/months'),false);
});
function fakeBrowser(){
 const el=(tag='div')=>({
  tag,children:[],className:'',attributes:{},textContent:'',value:'',listeners:{},
  appendChild(child){this.children.push(child);return child},
  replaceChildren(...args){this.children=[...args]},
  setAttribute(k,v){this.attributes[k]=String(v)},
  addEventListener(type,fn){this.listeners[type]=fn},
 });
 const ids=['addMonth','newMonth','newTitle','monthList','visitorMonths','status','resetDemo'];
 const els=Object.fromEntries(ids.map(id=>[id,el()]));
 els.newMonth.value='2026-11';els.newTitle.value='11月の皆勤賞';
 let confirmResult=true;
 const script=html.split('<script type="module">')[1]?.split('</script>')[0];
 assert.ok(script?.startsWith('\nimport'));
 const scriptNoImport=script.replace(/^\s*import [^\n]+\n/,'');
 assert.doesNotMatch(scriptNoImport,/^import /m);
 const sandbox={document:{getElementById:id=>els[id],createElement:el},
  window:{confirm:()=>confirmResult},console,
  initialMonthPreview,addMonthPreview,setMonthVisibilityPreview,
  getVisibleMonthsPreview,Date,Number,Math,Set,String};
 vm.runInNewContext(scriptNoImport,sandbox);
 const buttons=()=>els.monthList.children.map(card=>card.children.at(-1).children.at(-1));
 return {els,buttons,setConfirm:v=>confirmResult=v};
}
test('in-browser rehearsal creates hidden November, toggles visitor preview, keeps October',()=>{
 const browser=fakeBrowser(),{els}=browser;
 assert.equal(els.monthList.children.length,1);
 assert.equal(els.visitorMonths.children.length,1);
 assert.match(els.visitorMonths.children[0].children[0].textContent,/2026年10月/);
 assert.equal(els.visitorMonths.children[0].children[2].children.length,34);
 els.addMonth.listeners.submit({preventDefault(){}});
 assert.equal(els.monthList.children.length,2);
 assert.equal(els.visitorMonths.children.length,1,'new month starts hidden');
 let btn=browser.buttons()[0];
 assert.match(btn.attributes['aria-label'],/11月を表示/);
 btn.listeners.click();
 assert.equal(els.visitorMonths.children.length,2);
 assert.match(els.visitorMonths.children[0].children[0].textContent,/2026年11月/);
 assert.equal(els.visitorMonths.children[0].children[2].children.filter(x=>x.textContent).length,30);
 const october=browser.buttons()[1];october.listeners.click();
 assert.equal(els.monthList.children.length,2,'hiding must preserve 2026-10 card');
 assert.equal(els.visitorMonths.children.length,1);
 assert.match(els.status.textContent,/記録は削除していません/);
 els.addMonth.listeners.submit({preventDefault(){}});
 assert.equal(els.monthList.children.length,2,'duplicate month blocked');
 assert.match(els.status.textContent,/すでに存在/);
 browser.setConfirm(false);els.resetDemo.listeners.click();
 assert.equal(els.monthList.children.length,2,'cancelled reset keeps config');
 browser.setConfirm(true);els.resetDemo.listeners.click();
 assert.equal(els.monthList.children.length,1);
 assert.equal(els.visitorMonths.children.length,1);
 assert.match(els.status.textContent,/2026年10月/);
});
