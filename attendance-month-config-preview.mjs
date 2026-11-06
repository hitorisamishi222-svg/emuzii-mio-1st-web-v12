// Unrouted, browser-memory-only monthly attendance configuration rehearsal.
// No GAS, sheet, authentication, API, participant data, or publish capability.
const MONTH=/^(20[2-9][0-9]|2100)-(0[1-9]|1[0-2])$/;
const hasOnly=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const fail=code=>{throw Error('ATTENDANCE_MONTH_PREVIEW_'+code)};
function validateMonth(month){
 if(typeof month!=='string'||!MONTH.test(month))fail('MONTH_INVALID');
 return month;
}
function validateTitle(value){
 if(typeof value!=='string')fail('TITLE_INVALID');
 const title=value.trim();
 if(title.length<1||title.length>60||/[\x00-\x1f\x7f]/.test(title))fail('TITLE_INVALID');
 return title;
}
function freezeEntry(entry){
 return Object.freeze({
  month:entry.month,title:entry.title,visible:entry.visible,
  dayCount:entry.dayCount,source:entry.source
 });
}
function freezeMonths(months){return Object.freeze(months.map(freezeEntry));}
function verifiedMonths(months){
 if(!Array.isArray(months)||months.length>120)fail('COLLECTION_INVALID');
 const seen=new Set();
 for(const entry of months){
  if(!hasOnly(entry,['month','title','visible','dayCount','source']))
   fail('COLLECTION_FIELDS_INVALID');
  validateMonth(entry.month);validateTitle(entry.title);
  if(typeof entry.visible!=='boolean'||!Number.isInteger(entry.dayCount)||
      entry.dayCount!==monthLength(entry.month)||
      !['legacy-october','new-rehearsal'].includes(entry.source))fail('ENTRY_INVALID');
  if(seen.has(entry.month))fail('DUPLICATE_MONTH');
  if(entry.month==='2026-10'&&entry.source!=='legacy-october')fail('LEGACY_MISMATCH');
  if(entry.month!=='2026-10'&&entry.source==='legacy-october')fail('LEGACY_MISMATCH');
  seen.add(entry.month);
 }
 if(!seen.has('2026-10'))fail('LEGACY_OCTOBER_REQUIRED');
 return months;
}
export function monthLength(month){
 validateMonth(month);
 const [year,m]=month.split('-').map(Number);
 return new Date(Date.UTC(year,m,0)).getUTCDate();
}
export function initialMonthPreview(){
 return freezeMonths([{
  month:'2026-10',title:'みお1周年・10月皆勤賞',
  visible:true,dayCount:31,source:'legacy-october'
 }]);
}
export function addMonthPreview(months,{month,title}={}){
 verifiedMonths(months);validateMonth(month);const clean=validateTitle(title);
 if(months.some(x=>x.month===month))fail('MONTH_ALREADY_EXISTS');
 if(months.length>=120)fail('COLLECTION_LIMIT');
 return freezeMonths([...months,{
  month,title:clean,visible:false,
  dayCount:monthLength(month),source:'new-rehearsal'
 }].sort((a,b)=>b.month.localeCompare(a.month)));
}
export function setMonthVisibilityPreview(months,{month,visible}={}){
 verifiedMonths(months);validateMonth(month);
 if(typeof visible!=='boolean')fail('VISIBILITY_INVALID');
 if(!months.some(x=>x.month===month))fail('MONTH_NOT_FOUND');
 return freezeMonths(months.map(entry=>entry.month===month?{...entry,visible}:entry));
}
export function getVisibleMonthsPreview(months){
 verifiedMonths(months);return freezeMonths(months.filter(entry=>entry.visible));
}
