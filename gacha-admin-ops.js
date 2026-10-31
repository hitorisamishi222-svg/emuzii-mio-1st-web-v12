/* Operator intake and gacha grant UI, attached to the existing live gate page.
   Nothing is submitted until the owner explicitly confirms the action. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
let state=null,selected=null,processing=false,lastPendingCount=null;
const PENDING_KEY='mio_web_admin_pending_operation_v1';
let pending=null;
try{
 const saved=JSON.parse(sessionStorage.getItem(PENDING_KEY)||'null');
 if(saved&&['approve','grant','create','intake','review'].includes(saved.action)&&
    typeof saved.operationId==='string'&&/^[a-f0-9]{32}$/.test(saved.operationId))
  pending=saved;
}catch{}
function storePending(value){
 pending=value;
 try{if(value)sessionStorage.setItem(PENDING_KEY,JSON.stringify(value));
     else sessionStorage.removeItem(PENDING_KEY)}catch{}
 renderPending();
}
function renderPending(){
 const button=el('opsRetry'),info=el('opsRetryInfo');
 button.hidden=!pending;button.disabled=!pending||processing||!ready();
 info.hidden=!pending;
 info.textContent=pending?'⚠️ 前回の操作結果が未確認です。新しい操作は行わず、同じ操作IDで再確認してください。':'';
}
const opsStatus=el('opsStatus');
const opsGuide=el('opsInstallGuide');
const setupToggle=el('opsSetupToggle');
function showGuide(visible){
 opsGuide.hidden=!visible;
 setupToggle.setAttribute('aria-expanded',String(visible));
 setupToggle.textContent=visible?'接続手順を閉じる' :'Code.gs全貼り付け手順を開く';
}
setupToggle.addEventListener('click',()=>showGuide(opsGuide.hidden));
function notice(t,bad=false){opsStatus.textContent=t;opsStatus.className=bad?'ops-error':'ops-ok'}
function safe(t){return String(t??'')}
function node(tag,text,cls){
 const e=document.createElement(tag);
 if(text!==undefined)e.textContent=safe(text);
 if(cls)e.className=cls;
 return e;
}
function button(label,handler,readOnly=false){
 const b=node('button',label,'ops-action');b.type='button';b.disabled=processing||!!pending||(!readOnly&&!state?.writeEnabled);b.addEventListener('click',handler);return b;
}
function updateBell(count,{failed=false}={}){
 const bell=el('opsBell');
 if(!bell)return;
 bell.className='ops-pill'+(failed?' blocked':Number(count)>0?' alert':'');
 bell.textContent=failed?'⚠️ 受付状況を取得できません':Number(count)>0?'🔔 承認待ち '+count+' 件':'✅ 承認待ち 0 件';
 if(!failed&&lastPendingCount!==null&&count>lastPendingCount){
  bell.textContent='🔔 新しい承認待ち '+(count-lastPendingCount)+' 件（合計 '+count+' 件）';
 }
 if(!failed)lastPendingCount=count;
}
// Resolve identities by exact Web ID only; never guess from matching nicknames.
window.mioResolveIncidentIdentity=function(webId){
 if(!state||!/^MIO-W-[a-f0-9]{24}$/.test(webId||''))return null;
 const webLinks=Array.isArray(state.webLinks)?state.webLinks:[];
 const linked=webLinks.filter(x=>x?.webId===webId);
 if(linked.length>1)return {status:'conflict'};
 if(linked.length===1){
  const x=linked[0];
  if(typeof x.name!=='string'||!x.name.trim())return null;
  const verified=x.verified===true&&/^MIO-\d{4}$/.test(x.mioId||'');
  return {status:'found',name:x.name.slice(0,80),mioId:verified?x.mioId:'',
   verified};
 }
 const pending=(state.pending||[]).filter(x=>x.webId===webId);
 if(pending.length!==1||typeof pending[0].name!=='string')return null;
 return {status:'found',name:pending[0].name.slice(0,80),mioId:'',verified:false};
};
// Read-only possible account candidates for admin review.
// A name match or a claimed MIO-ID is NEVER proof of identity.
window.mioManualRecoveryCandidates=function(name,claimedMioId){
 if(!state||!Array.isArray(state.roster))return {status:'unavailable',items:[]};
 const text=String(name||'').trim().normalize('NFKC').replace(/[\s\u3000]/g,'').toLowerCase();
 const id=String(claimedMioId||'').trim();
 if(!text)return {status:'unavailable',items:[]};
 const all=state.roster.filter(x=>/^MIO-\d{4}$/.test(x.mioId||'')&&typeof x.name==='string');
 let matches;
 if(id){
  matches=all.filter(x=>x.mioId===id);
  if(matches.length!==1||matches[0].name.normalize('NFKC').replace(/[\s\u3000]/g,'').toLowerCase()!==text)
   return {status:'conflict',items:[]};
 }else{
  matches=all.filter(x=>x.name.normalize('NFKC').replace(/[\s\u3000]/g,'').toLowerCase()===text);
 }
 return {status:matches.length===1?'possible':matches.length>1?'multiple':'none',
  items:matches.slice(0,4).map(x=>({name:x.name,mioId:x.mioId}))};
};
function identityUpdated(){
 if(typeof window.dispatchEvent==='function'&&typeof Event==='function')
  window.dispatchEvent(new Event('mio:admin-identities-updated'));
}
function ready(){return snapshot&&typeof snapshot.normalOpen==='boolean'}
function request(action,values={}){
 if(!ready())throw Error('先に管理者コードで受付管理へ接続してください');
 return fetch('/api/gacha-admin-ops',{
  method:'POST',headers:{'Content-Type':'application/json'},
  credentials:'same-origin',cache:'no-store',body:JSON.stringify({code,action,...values})
 }).then(async r=>{
  const json=await r.json().catch(()=>({}));
  if(!r.ok||json.ok!==true){const error=Error(json.error||'管理データと接続できません');error.code=json.code||'';error.httpStatus=r.status;throw error;}
  return json;
 });
}
function uuid(){return [...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('')}
function blocked(v){processing=v;el('opsReload').disabled=v;el('opsGrant').disabled=v||!!pending||!state?.writeEnabled||!selected?.gacha?.checked;el('opsIntakeCreate').disabled=v||!!pending||!state?.writeEnabled;renderPending()}
async function refresh({automatic=false}={}){
 if(processing||!ready()||(automatic&&(document.hidden||pending)))return;
 const editing=automatic&&!!document.querySelector('#opsAdminPanel input:focus, #opsAdminPanel select:focus');
 blocked(true);
 if(!automatic)notice('管理台帳から最新の受付情報を取得中…');
 try{
  const response=await request('read');
  state=response;
  identityUpdated();
  showGuide(false);
  updateBell(Number(state.totalPending)||0);
  if(editing)el('opsCount').textContent='要確認 '+state.totalPending+' 件';else render();
  if(!automatic)notice(pending?'未確定の操作があります。再確認ボタンから同じIDで照合してください。':state.writeEnabled?'最新の受付情報を読み込みました。':'受付情報の接続を確認しました。承認・回数付与はまだ停止中です。');
 }catch(e){state=null;updateBell(0,{failed:true});render();showGuide(e.code==='GAS_UPDATE_REQUIRED');notice(e.message,true)}
 finally{blocked(false);if(!editing)render()}
}
el('opsReload').addEventListener('click',refresh);
el('opsIntakeCreate').addEventListener('click',async()=>{
 const name=el('opsNewName').value.trim(),note=el('opsNewNote').value.trim();
 if(!name||name.length>40||note.length>120){notice('初訪問者名・メモを確認してください',true);return}
 if(!window.confirm(name+' の初訪問を受付記録へ追加しますか？\n※この操作だけでは参加者承認になりません。'))return;
 await mutate('intake',{name,note});
});
function render(){
 el('opsPending').replaceChildren();
 el('opsSimple').replaceChildren();
 el('opsGrants').replaceChildren();
 renderRoster();
 if(!state){
  el('opsCount').textContent='未接続';
  el('opsPending').append(node('p','接続すると新規受付の一覧が表示されます。'));
  el('opsSimple').append(node('p','接続すると簡易受付の一覧が表示されます。'));
  return;
 }
 for(const g of (state.grants||[]).slice(0,30)){
  const item=node('div',undefined,'ops-item');
  item.append(node('strong',g.name+' / '+g.mioId+' +'+g.count+'回'));
  item.append(node('small',g.reason));
  el('opsGrants').append(item);
 }
 if(!(state.grants||[]).length)el('opsGrants').append(node('p','付与履歴はありません。'));
 el('opsCount').textContent='要確認 '+state.totalPending+' 件'+(state.rejectedCount?' / 却下済み '+state.rejectedCount+' 件':'');
 const items=state.pending||[];
 if(!items.length)el('opsPending').append(node('p','承認待ちはありません。'));
 for(const item of items){
  const wrap=node('article',undefined,'ops-item'),hdr=node('div',undefined,'ops-head');
  hdr.append(node('strong',item.name||'名前未設定'));
  hdr.append(node('small',item.status+' / '+(item.mioId||'MIO-ID 未照合')));
  wrap.append(hdr);
  wrap.append(node('p','Web登録ID: '+item.webId));
  if(item.linkedName)wrap.append(node('p','照合先: '+item.linkedName+'（'+item.mioId+'）'));
  if(item.status==='承認待ち'){
   const member=node('select',undefined,'ops-select');
   member.setAttribute('aria-label','メンシプ確認');
   for(const [value,label] of [['no','メンシプ未確認'],['yes','メンシプ確認済み']]){
    const opt=node('option',label);opt.value=value;member.append(opt);
   }
   member.value=item.member==='確認済み'?'yes':'no';
   wrap.append(member);
   const grant=button('本人照合して承認',async()=>{
    const target=window.prompt('照合済みの参加者ID（MIO-0000形式）を入力',item.mioId||'');
    if(target===null)return;
    const id=target.trim();
    if(!/^MIO-\d{4}$/.test(id)){notice('MIO-IDの形式を確認してください',true);return}
    if(!window.confirm(item.name+' / '+id+' を承認しますか？\n'+(member.value==='yes'?'メンシプ確認済み':'メンシプ未確認')))return;
    await mutate('approve',{webId:item.webId,mioId:id,memberConfirmed:member.value==='yes',expectedStatus:'承認待ち'});
   });
   wrap.append(grant);
   if(!item.mioId){
     wrap.append(button('初訪問者のMIO-IDを新規作成',async()=>{
       if(!window.confirm(item.name+' に新しい参加者IDを作成しますか？\n既存登録がある場合は作成されません。'))return;
       await mutate('create',{webId:item.webId,expectedStatus:'承認待ち'});
     }));
   }
  }
  el('opsPending').append(wrap);
 }
 const simple=state.simple||[];
 if(!simple.length)el('opsSimple').append(node('p','簡易受付はありません。'));
 for(const item of simple){
  const wrap=node('article',undefined,'ops-item');
  wrap.append(node('strong',item.name));
  wrap.append(node('p','受付状態: '+item.status+' / 行 '+item.row));
  if(item.status!=='確認済み'){
   wrap.append(button('受付内容を確認済みにする',async()=>{
     if(!window.confirm(item.name+' の簡易受付を確認済みにしますか？\n※参加者登録の承認・ガチャ付与は別操作です。'))return;
     await mutate('review',{row:item.row,expectedStatus:item.status});
   }));
  }
  el('opsSimple').append(wrap);
 }
}
function renderRoster(){
 const div=el('opsRoster'),query=el('opsSearch').value.trim().toLowerCase();
 div.replaceChildren();
 if(!state){selected=null;el('opsPerson').textContent='参加者を選択してください';return}
 const all=(state.roster||[]).filter(x=>x.name.toLowerCase().includes(query)||x.mioId.toLowerCase().includes(query)).slice(0,45);
 for(const item of all){
  div.append(button(item.name+' ('+item.mioId+')',()=>{
    selected=item;
    const g=item.gacha;
    el('opsPerson').textContent=item.name+' / '+item.mioId+
      (g?'　総権利 '+g.total+' / 残り '+g.remaining+' / 特別付与 '+g.special:'　ガチャ台帳要確認');
    el('opsGrant').disabled=processing||!!pending||!state?.writeEnabled||!g||!g.checked;
  },true));
 }
 if(!all.length)div.append(node('p','該当者がいません。'));
 if(selected){
  const latest=(state.roster||[]).find(x=>x.mioId===selected.mioId);
  selected=latest||null;
  if(selected?.gacha)el('opsPerson').textContent=selected.name+' / '+selected.mioId+
    '　総権利 '+selected.gacha.total+' / 残り '+selected.gacha.remaining+' / 特別付与 '+selected.gacha.special;
 }else el('opsPerson').textContent='参加者を選択してください';
 el('opsGrant').disabled=processing||!!pending||!state?.writeEnabled||!selected?.gacha?.checked;
}
el('opsSearch').addEventListener('input',renderRoster);
async function verifyPending(){
 if(processing||!pending)return;
 const attempted=pending;
 blocked(true);
 notice('前回と同じ操作IDで台帳への反映を確認中…');
 try{
  const result=await request(attempted.action,attempted);
  // The GAS operation ID is confirmed. Even if the following read fails,
  // the mutation must never be reissued with a new operation ID.
  storePending(null);
  selected=null;
  try{
   state=await request('read');render();
   notice(result.result?.replayed?'同じ操作は処理済みでした。二重更新はありません。':'操作を確定しました。最新の状態を読み込みました。');
  }catch(e){
   state=null;render();notice('操作は確定しましたが一覧の再読込が失敗しました。受付情報を読み直してください。',true);
  }
 }catch(e){
  if([400,401,403,405,413,415,503].includes(e.httpStatus)){
   // These responses reject the request before forwarding it to GAS.
   storePending(null);state=null;render();
   notice('操作は受け付けられませんでした。'+e.message,true);
  }else{
   // Timeout, disconnected network, and 409 may follow a partial GAS write.
   // Keep the exact ID and payload for a safe, explicit retry.
   state=null;render();
   notice('操作結果が未確認です。別の操作IDでやり直さず「同じIDで再確認」を押してください。'+e.message,true);
  }
 }finally{blocked(false);render()}
}
el('opsRetry').addEventListener('click',()=>{
 if(!pending||processing)return;
 const label=pending.action==='grant'?pending.mioId+' に '+pending.count+'回付与'
   :pending.action==='approve'?pending.webId+' の登録承認':'管理操作 '+pending.action;
 if(window.confirm(label+' の結果を、前回と同じ操作IDで確認しますか？\n新しい付与や承認を作らず、既存の操作を照合します。'))
  void verifyPending();
});
async function mutate(action,payload){
 if(processing)return;
 if(pending){notice('前回の操作結果が未確認です。先に同じ操作IDで再確認してください。',true);return}
 storePending({action,...payload,operationId:uuid()});
 await verifyPending();
}
el('opsGrant').addEventListener('click',async()=>{
 const g=selected?.gacha,count=Number(el('opsQuantity').value),reason=el('opsReason').value.trim();
 if(!g||!g.checked||!Number.isInteger(count)||count<1||count>50||reason.length<2||reason.length>120){
  notice('参加者・付与回数（1〜50）・理由を確認してください。',true);return;
 }
 if(!window.confirm(selected.name+' / '+selected.mioId+' に '+count+' 回付与しますか？\n現在の特別付与 '+g.special+' → '+(g.special+count)+'\n理由：'+reason))return;
 await mutate('grant',{mioId:selected.mioId,count,expectedSpecial:g.special,reason});
});
el('opsRoster').append(node('p','管理者コードで接続後に検索できます。'));
window.addEventListener('mio:admin-connected',()=>{el('opsReload').disabled=false;void refresh();});
window.setInterval(()=>{if(ready()&&!processing&&!pending)void refresh({automatic:true});},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready()&&!processing&&!pending)void refresh({automatic:true});});
renderPending();
})();
