// Development-only month-management preview. No API calls or persistence.
// All changes live only in this browser tab and disappear on reload.
import {planAttendanceCalendar,OCTOBER_MONTH} from './tools/mio-attendance-month-plan.mjs';

export const initialPreviewState=()=>({
 selectedMonth:OCTOBER_MONTH,octoberVisible:true,
 otherMonths:[{month:'2026-11',title:'2026年11月',visible:true}]
});
const monthIsValid=s=>typeof s==='string'&&/^(20[2-9][0-9]|2100)-(0[1-9]|1[0-2])$/.test(s);
export const monthIsListed=(s,m)=>m===OCTOBER_MONTH||s.otherMonths.some(x=>x.month===m);
export const visibleMonthList=s=>[
 {month:OCTOBER_MONTH,visible:s.octoberVisible,title:'2026年10月',historicalProtected:true},
 ...s.otherMonths.map(x=>({...x,historicalProtected:false}))
].filter(x=>x.visible);
export function addPreviewMonth(state,month){
 if(!monthIsValid(month)||monthIsListed(state,month)||state.otherMonths.length>=36)
  return {state,ok:false,message:'年月が不正、または登録済みです。'};
 const [year,n]=month.split('-').map(Number);
 const otherMonths=[...state.otherMonths,{month,title:year+'年'+n+'月',visible:true}];
 const next={...state,selectedMonth:month,otherMonths};
 if(!planAttendanceCalendar(next).ok)
  return {state,ok:false,message:'この月はプレビューに追加できません。'};
 return {state:next,ok:true,message:month+' をプレビューに追加しました（保存されません）。'};
}
export function setPreviewVisibility(state,month,visible){
 if(!monthIsListed(state,month)||typeof visible!=='boolean')
  return {state,ok:false,message:'対象月が見つかりません。'};
 const current=visibleMonthList(state);
 if(!visible&&current.length===1&&current[0].month===month)
  return {state,ok:false,message:'この確認画面では最後の表示月を残してください。'};
 const next=month===OCTOBER_MONTH?
  {...state,octoberVisible:visible}:
  {...state,otherMonths:state.otherMonths.map(x=>x.month===month?{...x,visible}:x)};
 if(!visible&&state.selectedMonth===month)
  next.selectedMonth=visibleMonthList(next)[0]?.month||OCTOBER_MONTH;
 return {state:next,ok:true,message:month+' の表示設定を変更しました。10月の記録は削除されません。'};
}
export function selectPreviewMonth(state,month){
 if(!visibleMonthList(state).some(x=>x.month===month))
  return {state,ok:false,message:'非表示または未登録の月は開けません。'};
 return {state:{...state,selectedMonth:month},ok:true,message:''};
}
export const getPreviewPlan=state=>planAttendanceCalendar(state);

if(typeof document!=='undefined'){
 const $=id=>document.getElementById(id);
 let state=initialPreviewState(),notice='';
 const titleMonth=m=>{const [y,n]=m.split('-');return y+'年'+Number(n)+'月';};
 function setNotice(message){notice=message;const n=$('notice');n.textContent=message||'画面上の確認だけです。GAS・台帳への変更はありません。';}
 function render(){
  const plan=getPreviewPlan(state);
  const select=$('monthSelect');select.replaceChildren();
  for(const month of visibleMonthList(state)){
   const option=document.createElement('option');option.value=month.month;option.textContent=month.title;
   select.appendChild(option);
  }
  select.value=state.selectedMonth;
  const controls=$('monthControls');controls.replaceChildren();
  for(const item of [{month:OCTOBER_MONTH,visible:state.octoberVisible,title:'2026年10月',historicalProtected:true},...state.otherMonths]){
   const row=document.createElement('label');row.className='month-row';
   const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=item.visible;
   toggle.dataset.month=item.month;toggle.setAttribute('aria-label',item.title+' を表示');
   const label=document.createElement('span');label.textContent=item.title+(item.historicalProtected?' · 既存記録を保護':' · 新月の表示例');
   toggle.addEventListener('change',()=>{
    const result=setPreviewVisibility(state,item.month,toggle.checked);
    state=result.state;render();setNotice(result.message);
   });
   row.append(toggle,label);controls.appendChild(row);
  }
  const board=$('calendar');board.replaceChildren();
  if(!plan.ok){setNotice('設定を確認してください。'+plan.reason);return;}
  $('calendarTitle').textContent=titleMonth(state.selectedMonth);
  $('dayCount').textContent=plan.dayCount+'日間 · '+(state.selectedMonth===OCTOBER_MONTH?'既存10月の表示例':'将来月の表示例');
  const weekNames=['月','火','水','木','金','土','日'];
  for(const name of weekNames){
   const cell=document.createElement('span');cell.className='weekday';cell.textContent=name;board.appendChild(cell);
  }
  for(let i=0;i<plan.firstWeekdayMondayZero;i++){
   const pad=document.createElement('span');pad.className='pad';pad.setAttribute('aria-hidden','true');board.appendChild(pad);
  }
  for(const day of plan.days){
   const cell=document.createElement('button');cell.type='button';cell.className='day';
   cell.textContent=String(day.day);cell.setAttribute('aria-label',day.displayLabel+'（表示のみ）');
   cell.addEventListener('click',()=>setNotice(day.displayLabel+'：日付の表示確認のみ。実際の皆勤記録や入力状態は取得していません。'));
   board.appendChild(cell);
  }
  $('dataNotice').textContent='※ '+titleMonth(state.selectedMonth)+' の日付枠のみ。実際の出欠・確認文字・入力回数は表示していません。';
  setNotice(notice);
 }
 $('monthSelect').addEventListener('change',ev=>{
  const x=selectPreviewMonth(state,ev.target.value);state=x.state;notice=x.message;render();
 });
 $('addForm').addEventListener('submit',ev=>{
  ev.preventDefault();
  const x=addPreviewMonth(state,$('addMonth').value);state=x.state;notice=x.message;render();
 });
 $('reset').addEventListener('click',()=>{state=initialPreviewState();notice='初期表示に戻しました。実データには影響ありません。';render();});
 render();
}
