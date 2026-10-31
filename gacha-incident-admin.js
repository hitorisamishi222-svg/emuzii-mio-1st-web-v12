/* Admin-only incident inbox. Actual data only from authenticated API. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
if(!el('incidentPanel'))return;
let latest=null,loading=false,connected=false;
const STORAGE_KEY='mio_incident_triage_pending_v1';
const labels={
 DRAW_UNKNOWN:'抽選結果の確定状況が不明',
 DRAW_CLIENT_UNCONFIRMED:'参加者の画面で抽選結果が未表示',
 AUTH_COOKIE_MISSING:'既存端末のログイン認証が見つからない',
 GAS_TIMEOUT:'連携先の応答待ちが長い',
 UPSTREAM_FAILED:'ガチャ情報の取得に失敗',
 STATUS_UNAVAILABLE:'登録状態の取得に失敗'
};
const statuses={unhandled:'未対応',working:'対応中',resolved:'解決'};
const categories=['DRAW_UNKNOWN','DRAW_CLIENT_UNCONFIRMED','AUTH_COOKIE_MISSING','GAS_TIMEOUT','UPSTREAM_FAILED','STATUS_UNAVAILABLE'];
const states=['unhandled','working','resolved'];
const GACHA_URL='https://emuzii-mio-1st-web-v12.vercel.app/gacha.html';
function recoveryInstructions(category){
 if(category==='DRAW_UNKNOWN'||category==='DRAW_CLIENT_UNCONFIRMED'||category==='GAS_TIMEOUT'){
  return '【前回のガチャ結果を確認する方法】\\n'+
   'ガチャを引いた時と同じSafari・Chromeでこちらを開いてください。\\n'+
   GACHA_URL+'\\n'+
   '当選結果が確定済みなら同じ景品が表示されます。再登録や新しいガチャのやり直しはしないでください。\\n'+
   '結果が確認できない場合、前回のガチャを再開すると未確定分は権利を使う場合があるため、続行前に管理者へご相談ください。';
 }
 return '【ログイン・登録情報の確認】\\n'+
  '以前登録したSafari・Chromeなど、元のブラウザからアクセスしてください。\\n'+
  GACHA_URL+'\\n'+
  'LINE・X内ブラウザは別の端末情報になる場合があります。再登録はせず、運営に本人確認と端末の復旧を依頼してください。';
}
const $=id=>el(id);
let pending=null;
try{
 const stored=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
 if(stored&&['start','resolve'].includes(stored.action)&&/^[a-f0-9]{32}$/.test(stored.operationId||''))
   pending=stored;
}catch{}
function setPending(v){
 pending=v;
 try{if(v)sessionStorage.setItem(STORAGE_KEY,JSON.stringify(v));
     else sessionStorage.removeItem(STORAGE_KEY)}catch{}
 $('incidentRetry').hidden=!pending;
 $('incidentRetry').disabled=!pending||loading||!connected;
}
function msg(text,bad=false){
 $('incidentMessage').textContent=text;
 $('incidentMessage').className=bad?'ops-error':'ops-message';
}
function node(tag,value,cls){
 const item=document.createElement(tag);
 if(value!==undefined)item.textContent=String(value);
 if(cls)item.className=cls;
 return item;
}
function request(data){
 if(!connected||!snapshot)throw Error('管理者でログインしてください');
 return fetch('/api/mio-incidents',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({code, ...data})
 }).then(async r=>{
  const v=await r.json().catch(()=>({}));
  if(!r.ok||v.ok!==true){
   const e=Error(v.error||'障害台帳を取得できません');
   e.code=v.code||'';e.status=r.status;throw e;
  }
  return v;
 });
}
function counts(){
 const s=latest?.counts||{};
 for(const type of states){
  $('incidentCount'+type).textContent=String(Number(s[type]||0));
 }
 const n=Number(s.unhandled||0);
 $('incidentBell').className='ops-pill'+(n>0?' alert':'');
 $('incidentBell').textContent=n?'🔔 未対応 '+n+' 件':'未対応 0 件';
}
function render(){
 counts();
 const box=$('incidentList');box.replaceChildren();
 if(!latest){box.append(node('p','ログイン後に障害の受付状況を表示します。'));return}
 const items=Array.isArray(latest.items)?latest.items:[];
 if(!items.length){box.append(node('p','記録された障害はありません。'));return}
 for(const v of items){
  const valid=states.includes(v.state)&&categories.includes(v.category);
  if(!valid)continue;
  const card=node('article',undefined,'ops-item');
  const head=node('div',undefined,'ops-head');
  head.append(node('strong',labels[v.category]||v.category));
  head.append(node('small',statuses[v.state]));
  card.append(head);
  const person=typeof window.mioResolveIncidentIdentity==='function'?
   window.mioResolveIncidentIdentity(v.participantRef):null;
  if(person?.status==='conflict')card.append(node('p','名前：登録IDが重複しています（要確認）'));
  else if(person?.status==='found')
   card.append(node('p','名前：'+person.name+(person.verified?'（本人照合済み）':'（入力名・未照合）')+
    (person.mioId?' / '+person.mioId:'')));
  else card.append(node('p','名前：未照合（管理者台帳の登録IDと確認が必要）'));
  card.append(node('p','Web登録ID: '+v.participantRef));
  if(v.drawId)card.append(node('p','抽選ID: '+v.drawId));
  card.append(node('p','発生回数: '+Number(v.count||1)+' / 最終検知: '+new Date(v.lastSeenAt).toLocaleString('ja-JP')));
  const actions=node('div',undefined,'ops-grid');
  if(v.state==='unhandled'){
   const start=node('button','対応を開始','ops-action');
   start.disabled=latest.readOnly||!!pending||loading;
   start.addEventListener('click',()=>void mutate(v,'start'));
   actions.append(start);
  }
  if(v.state!=='resolved'){
   const resolve=node('button','解決済みにする','ops-action');
   resolve.disabled=latest.readOnly||!!pending||loading;
   resolve.addEventListener('click',()=>void mutate(v,'resolve'));
   actions.append(resolve);
  }
  if(actions.children.length)card.append(actions);
  const copy=node('button','参加者向けの復旧案内をコピー','ops-action ops-secondary');
  copy.addEventListener('click',async()=>{
   try{
    if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
    await navigator.clipboard.writeText(recoveryInstructions(v.category));
    msg('復旧案内をコピーしました。本人に送ってください。チケットは未解決のままです。');
   }catch{msg('案内のコピーに失敗しました。元のブラウザでガチャページを開くようご案内ください。',true)}
  });
  card.append(copy);
  box.append(card);
 }
}
async function refresh({automatic=false}={}){
 if(!connected||loading||pending||automatic&&document.hidden)return;
 loading=true;$('incidentReload').disabled=true;
 try{
  latest=await request({action:'read'});
  render();
  if(!automatic)msg(latest.readOnly?'障害台帳を読み取りで確認しました。状態の変更は準備中です。':'障害台帳を更新しました。');
 }catch(e){
  latest=null;render();
  msg(e.code==='INCIDENT_CENTER_DISABLED'?'障害通知の保存・閲覧は準備中です。':
   e.code==='INCIDENT_READ_UNAVAILABLE'?'障害管理台帳の接続状態を確認してください。':
   '⚠️ '+e.message,e.code!=='INCIDENT_CENTER_DISABLED');
 }finally{loading=false;$('incidentReload').disabled=false;render()}
}
function uuid(){return [...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function replay(){
 if(!pending||loading||!connected)return;
 loading=true;setPending(pending);
 msg('前回と同じ操作IDで対応状態を照合しています…');
 try{
  const result=await request(pending);
  setPending(null);
  msg(result.result?.replayed?'対応状態は既に記録済みでした。重複更新はありません。':'対応状態を保存しました。');
 }catch(e){
  if([400,401,403,405,413,415,503].includes(e.status)&&e.code!=='INCIDENT_READ_UNAVAILABLE'){
   // Only deterministic pre-write rejection can be discarded.
   setPending(null);
  }
  msg('操作状態は未確認です。'+e.message,true);
 }finally{
  loading=false;
  setPending(pending);
  if(!pending)void refresh();
  else render();
 }
}
function mutate(ticket,action){
 if(pending||loading||latest?.readOnly)return;
 const confirmText=action==='start'?'対応中に変更しますか？':'解決済みに変更しますか？';
 if(!window.confirm((labels[ticket.category]||ticket.category)+'\n'+ticket.participantRef+'\n'+confirmText))return;
 setPending({action,incidentId:ticket.incidentId,expectedState:ticket.state,operationId:uuid()});
 void replay();
}
$('incidentReload').addEventListener('click',()=>void refresh());
$('incidentRetry').addEventListener('click',()=>{
 if(pending&&window.confirm('前回の対応を同じ操作IDで再確認しますか？'))void replay();
});
window.addEventListener('mio:admin-identities-updated',()=>{if(latest&&!loading)render();});
window.addEventListener('mio:admin-connected',()=>{
 connected=true;$('incidentReload').disabled=false;
 if(pending){msg('前回の管理操作が未確認です。同じ操作IDで再確認してください。',true);setPending(pending)}
 else void refresh();
});
if(typeof snapshot!=='undefined'&&snapshot&&typeof snapshot.normalOpen==='boolean'){
 connected=true;$('incidentReload').disabled=false;
 if(!pending)void refresh();
}
window.setInterval(()=>{if(connected&&!pending&&!loading)void refresh({automatic:true})},30000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&connected&&!pending&&!loading)void refresh({automatic:true});
});
render();setPending(pending);
})();
