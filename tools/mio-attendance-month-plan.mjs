// MIO monthly attendance: read-only plan for the future admin calendar.
// Do not import into the live API or replace October's existing app.js/GAS.
// This helper has no network, storage, Sheet or mutation actions.
// 2026-10 is the protected original source; later months need independently
// verified GAS handlers and sheets before any entry may be enabled.
export const OCTOBER_MONTH='2026-10';
export const OCTOBER_SOURCE=Object.freeze({
  month:OCTOBER_MONTH, sheet:'emuzii_皆勤31日',
  dayKeyType:'legacy-day-number',
  attemptsStorageKey:'mioAttendanceAttemptsV1',
  checkinRoute:'/api/checkin'
});

const stop=reason=>({ok:false,status:'STOP',reason,previewOnly:true,
  writeAllowed:false,operations:[]});
const validMonth=month=>typeof month==='string'&&
  /^(20[2-9][0-9]|2100)-(0[1-9]|1[0-2])$/.test(month);
const safeTitle=text=>typeof text==='string'&&text.length<=60&&
  !/[\x00-\x1f<>]/.test(text);

export function monthlyAttemptKey(month,day){
 if(!validMonth(month)||!Number.isSafeInteger(day))return null;
 const [year,m]=month.split('-').map(Number);
 const max=new Date(Date.UTC(year,m,0)).getUTCDate();
 if(day<1||day>max)return null;
 return month===OCTOBER_MONTH?
  {kind:'legacy',storageKey:OCTOBER_SOURCE.attemptsStorageKey,entry:String(day)}:
  {kind:'separate-month',storageKey:'mioAttendanceAttemptsMonth:'+month,entry:String(day)};
}

/** Preview data ONLY: even a visible/selected future month cannot submit.
 * Never infer a future backend or sheet from calendar appearance.
 */
export function planAttendanceCalendar({
 selectedMonth=OCTOBER_MONTH,octoberVisible=true,otherMonths=[]
}={}){
 if(!validMonth(selectedMonth)||typeof octoberVisible!=='boolean'||
   !Array.isArray(otherMonths)||otherMonths.length>36)return stop('INVALID_CONFIGURATION');
 const map=new Map([[OCTOBER_MONTH,{
   month:OCTOBER_MONTH,visible:octoberVisible,title:'2026年10月',
   historicalProtected:true,source:'ORIGINAL_OCTOBER'
 }]]);
 for(const item of otherMonths){
  if(!item||!validMonth(item.month)||item.month===OCTOBER_MONTH||
     typeof item.visible!=='boolean'||!safeTitle(item.title||'')||
     map.has(item.month))return stop('MONTH_CONFIG_CONFLICT');
  map.set(item.month,{
   month:item.month,visible:item.visible,
   title:item.title||item.month,historicalProtected:false,
   source:'FUTURE_MONTH_BACKEND_UNVERIFIED'
  });
 }
 const selected=map.get(selectedMonth);
 if(!selected||!selected.visible)return stop('MONTH_NOT_VISIBLE');
 const [year,month]=selectedMonth.split('-').map(Number);
 const dayCount=new Date(Date.UTC(year,month,0)).getUTCDate();
 const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
 const days=Array.from({length:dayCount},(_,i)=>{
  const day=i+1;
  const key=monthlyAttemptKey(selectedMonth,day);
  return {day,dayKey:key,displayLabel:month+'月'+day+'日'};
 });
 return {
  ok:true,status:'PREVIEW_ONLY',previewOnly:true,writeAllowed:false,
  operations:[],selectedMonth,visibleMonths:[...map.values()].filter(v=>v.visible),
  protectedOriginalMonth:OCTOBER_MONTH,
  originalOctoberSheet:OCTOBER_SOURCE.sheet,
  backendReady:false,entryEnabled:false,
  // A hidden month is still retained in its original storage.
  preservedOctoberRegardlessOfVisibility:true,
  firstWeekdayMondayZero:offset,dayCount,days
 };
}
