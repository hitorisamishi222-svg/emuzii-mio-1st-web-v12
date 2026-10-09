/* NEXT TEST ONLY — all values generated locally. No API, cookies or live data. */
(function(){
'use strict';
const shifted=(ms)=>new Date(Date.now()+ms).toISOString();
const sample=(scenario)=>{
 if(scenario==='empty')return {ok:true,serverTime:shifted(0),notices:[],schedules:[]};
 const notices=[
  {id:'next-n1',level:'重要',title:'1周年の企画を楽しもう（表示サンプル）',body:'ここは次期アップデートの展示用です。',publishedAt:shifted(-90*60000),expiresAt:shifted(8*86400000)}
 ];
 if(scenario==='next')return {ok:true,serverTime:shifted(0),notices,schedules:[
  {id:'next-s2',title:'次回の歌枠（架空の予定）',body:'実際の配信情報ではありません。',startAt:shifted(24*3600000),endAt:shifted(26*3600000),url:''}
 ]};
 return {ok:true,serverTime:shifted(0),notices,schedules:[
  {id:'next-s1',title:'1周年記念・歌枠（動作サンプル）',body:'表示切替を試すための架空のLIVEです。',startAt:shifted(-12*60000),endAt:shifted(62*60000),url:''},
  {id:'next-s2',title:'次回の歌枠（架空の予定）',body:'実際の配信情報ではありません。',startAt:shifted(24*3600000),endAt:shifted(26*3600000),url:''}
 ]};
};
window.__MIO_HOME_DEMO__=sample('live');
document.querySelectorAll('[data-scenario]').forEach(btn=>btn.addEventListener('click',()=>{
 const scenario=btn.dataset.scenario;
 if(!['live','next','empty'].includes(scenario))return;
 window.__MIO_HOME_DEMO__=sample(scenario);
 document.querySelectorAll('[data-scenario]').forEach(other=>{
  const selected=other===btn;
  other.classList.toggle('is-active',selected);
  other.setAttribute('aria-pressed',String(selected));
 });
 window.__MIO_HOME_DEMO_REFRESH__?.();
}));
})();
