// OFFLINE ONLY: produce a reviewed plan for monthly attendance sheet structure.
// Grounded in the LIVE 2026-10 header A1:AI1, read-only on 2026-11-12.
// Does not copy members, overwrite sheets, perform API calls or enable a month.
import {OCTOBER_MONTH,OCTOBER_SOURCE,planAttendanceCalendar} from './mio-attendance-month-plan.mjs';

export const LIVE_OCTOBER_HEADERS=Object.freeze([
 '参加者ID','ColorSing名',
 ...Array.from({length:31},(_,i)=>'10/'+(i+1)),
 '確認済日数','皆勤結果'
]);
export const FUTURE_TAB_PREFIX='emuzii_皆勤_';
const safeMonth=month=>typeof month==='string'&&
 /^(20[2-9][0-9]|2100)-(0[1-9]|1[0-2])$/.test(month);
const stop=reason=>({ok:false,status:'STOP',reason,readOnly:true,
 sheetWriteAllowed:false,publishAllowed:false,requests:[]});
const sameArray=(a,b)=>Array.isArray(a)&&a.length===b.length&&
 a.every((v,i)=>typeof v==='string'&&v===b[i]);
export function sheetColumn(n){
 if(!Number.isSafeInteger(n)||n<1||n>18278)return null;
 let out='';
 while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26)}
 return out;
}
/** tab list and headers are a bounded snapshot provided by an authenticated
 * read-only inspector. They are NOT credentials or permission to write.
 * For existing new-month tabs, their exact header must also be supplied.
 */
export function planMonthSheetSchema({
 month,octoberHeader,sheetNames,existingMonthHeader
}={}){
 if(!safeMonth(month))return stop('INVALID_MONTH');
 if(!sameArray(octoberHeader,LIVE_OCTOBER_HEADERS))
  return stop('PROTECTED_OCTOBER_HEADER_NOT_VERIFIED');
 if(!Array.isArray(sheetNames)||sheetNames.length>250||
  sheetNames.some(x=>typeof x!=='string'||!x||x.length>100)||
  new Set(sheetNames).size!==sheetNames.length||
  !sheetNames.includes(OCTOBER_SOURCE.sheet))
  return stop('LIVE_SHEET_METADATA_UNVERIFIED');
 if(month===OCTOBER_MONTH)return {
  ok:true,status:'OCTOBER_ORIGINAL_PROTECTED',readOnly:true,
  sheetWriteAllowed:false,publishAllowed:false,requests:[],
  month,tab:OCTOBER_SOURCE.sheet,
  headerColumns:35,lastColumn:'AI',header:[...LIVE_OCTOBER_HEADERS],
  reuseExistingOnly:true,createNewTab:false,
  memberCopyAllowed:false,backendReady:false
 };
 const view=planAttendanceCalendar({
  selectedMonth:month,
  otherMonths:[{month,title:month,visible:true}]
 });
 if(!view.ok||!Number.isSafeInteger(view.dayCount))return stop('CALENDAR_INVALID');
 const [year,mm]=month.split('-');
 const tab=FUTURE_TAB_PREFIX+year+'_'+mm;
 if(tab===OCTOBER_SOURCE.sheet)return stop('LEGACY_TAB_COLLISION');
 const headers=[
  '参加者ID','ColorSing名',
  ...Array.from({length:view.dayCount},(_,i)=>Number(mm)+'/'+(i+1)),
  '確認済日数','皆勤結果'
 ];
 const exists=sheetNames.includes(tab);
 if(exists&&!sameArray(existingMonthHeader,headers))
  return stop('EXISTING_MONTH_TAB_NEEDS_EXACT_HEADER_REVIEW');
 if(!exists&&existingMonthHeader!==undefined)
  return stop('NONEXISTENT_TAB_MUST_NOT_HAVE_HEADER');
 return {
  ok:true,
  status:exists?'EXISTING_MONTH_STRUCTURE_REVIEWED':'NEW_MONTH_STRUCTURE_PROPOSED',
  readOnly:true,sheetWriteAllowed:false,publishAllowed:false,requests:[],
  month,tab,header:headers,headerColumns:headers.length,
  firstDateColumn:'C',lastDateColumn:sheetColumn(2+view.dayCount),
  countColumn:sheetColumn(3+view.dayCount),
  resultColumn:sheetColumn(4+view.dayCount),
  lastColumn:sheetColumn(headers.length),
  days:view.dayCount,monthVisibleByDefault:false,
  backendReady:false,memberCopyAllowed:false,checkinEnabled:false,
  existingTab:exists,createNewTab:false,reviewRequired:true
 };
}
