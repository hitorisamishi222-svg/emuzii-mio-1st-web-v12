/* Operator intake and gacha grant UI, attached to the existing live gate page.
   Nothing is submitted until the owner explicitly confirms the action. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
let state=null,selected=null,processing=false,lastPendingCount=null,gasCompatibilityBlocked=false;
const PENDING_KEY='mio_web_admin_pending_operation_v1';
let pending=null;
try{
 const saved=JSON.parse(sessionStorage.getItem(PENDING_KEY)||'null');
 if(saved&&['approve','member','grant','create','intake','review'].includes(saved.action)&&
    typeof saved.operationId==='string'&&/^[a-f0-9]{32}$/.test(saved.operationId))
  // Any restored pending operation might have reached GAS before the browser closed.
  pending={...saved,submitted:true};
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
 setupToggle.textContent=visible?'接続手順を閉じる' :'稼働GASの安全な照合手順を開く';
}
setupToggle.addEventListener('click',()=>showGuide(opsGuide.hidden));
function notice(t,bad=false){opsStatus.textContent=t;opsStatus.className=bad?'ops-error':'ops-ok'}
function safe(t){return String(t??'')}
function nameKey(t){return safe(t).normalize('NFKC').replace(/[\s\u3000]/g,'').toLowerCase()}
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
 // GAS Read returns approvedBrowsers, not webLinks. Only exact Web IDs
 // may be inspected, and its verified flag never authorizes a session.
 const webLinks=Array.isArray(state.approvedBrowsers)?state.approvedBrowsers:[];
 const linked=webLinks.filter(x=>x?.webId===webId);
 if(linked.length>1)return {status:'conflict'};
 if(linked.length===1){
  const x=linked[0];
  if(typeof x.name!=='string'||!x.name.trim())return null;
  const verified=x.verified===true&&/^MIO-\d{4}$/.test(x.mioId||'');
  // A previously approved browser may use a changed display name. Flag it
  // for operator review without changing the approved account or its records.
  const masters=verified&&(Array.isArray(state.roster)?state.roster:[])
   .filter(p=>p?.mioId===x.mioId);
  const nameReview=!!verified&&(masters.length!==1||
   nameKey(masters[0].name)!==nameKey(x.name));
  return {status:nameReview?'name-review':'found',name:x.name.slice(0,80),
   mioId:verified&&!nameReview?x.mioId:'',verified:verified&&!nameReview,
   nameReview};
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
function grantReady(){return !processing&&!pending&&!!state?.writeEnabled&&!!selected?.gacha?.checked&&el('opsOnsiteGrantVerified').checked===true}
function blocked(v){processing=v;el('opsReload').disabled=v;el('opsGrant').disabled=!grantReady();el('opsIntakeCreate').disabled=v||!!pending||!state?.writeEnabled;renderPending()}
async function refresh({automatic=false}={}){
 if(processing||!ready()||(automatic&&(document.hidden||pending||gasCompatibilityBlocked)))return;
 // On mobile a checked confirmation switch may lose focus before the 30s refresh.
 // Keep the operator's form visible; backend still checks the current state on submission.
 const editing=automatic&&!!document.querySelector('#opsAdminPanel input:focus, #opsAdminPanel select:focus, #opsAdminPanel textarea:focus, #opsAdminPanel input[type="checkbox"]:checked');
 blocked(true);
 if(!automatic)notice('管理台帳から最新の受付情報を取得中…');
 try{
  const response=await request('read');
  // Never keep an older onsite confirmation when the authoritative gacha balance changed.
  if(selected&&el('opsOnsiteGrantVerified').checked===true){
   const current=(response.roster||[]).find(x=>x.mioId===selected.mioId);
   const previous=selected.gacha;
   const next=current?.gacha;
   if(!next||!previous||next.remaining!==previous.remaining||
      next.total!==previous.total||next.special!==previous.special||
      next.checked!==previous.checked||current.name!==selected.name)
     el('opsOnsiteGrantVerified').checked=false;
  }
  if(selected&&el('opsMemberVerified').checked===true){
   const last=(state?.approvedBrowsers||[]).filter(x=>x.mioId===selected.mioId);
   const next=(response.approvedBrowsers||[]).filter(x=>x.mioId===selected.mioId);
   if(JSON.stringify(last)!==JSON.stringify(next))el('opsMemberVerified').checked=false;
  }
  state=response;
  gasCompatibilityBlocked=false;
  identityUpdated();
  showGuide(false);
  updateBell(Number(state.totalPending)||0);
  if(editing)el('opsCount').textContent='要確認 '+state.totalPending+' 件';else render();
  if(!automatic)notice(pending?'未確定の操作があります。再確認ボタンから同じIDで照合してください。':state.schemaReady!==true?'管理台帳を読み込みました。監査タブまたはWeb操作ID列が未準備のため、承認・回数付与は停止しています。':state.writeEnabled?'最新の受付情報を読み込みました。':'受付情報の接続を確認しました。承認・回数付与はまだ停止中です。');
 }catch(e){
  state=null;
  gasCompatibilityBlocked=e.code==='GAS_UPDATE_REQUIRED';
  updateBell(0,{failed:true});
  render();
  showGuide(gasCompatibilityBlocked);
  notice(gasCompatibilityBlocked
   ?'管理者の認証は通過しています。既存GASが運営管理の読取命令に未対応です。お客様のIDや管理者コードの再発行は不要です。接続が修正されるまで自動再取得を停止しました。'
   :e.message,true);
 }
 finally{blocked(false);if(!editing)render()}
}
el('opsReload').addEventListener('click',refresh);
for(const field of ['opsNewName','opsNewNote'])el(field).addEventListener('input',()=>{el('opsOnsiteIntakeVerified').checked=false});
el('opsIntakeCreate').addEventListener('click',async()=>{
 const name=el('opsNewName').value.trim(),note=el('opsNewNote').value.trim();
 if(el('opsOnsiteIntakeVerified').checked!==true){notice('現場で来場者名と既存登録を確認してスイッチを入れてください',true);return}
 if(!name||name.length>40||note.length>120){notice('初訪問者名・メモを確認してください',true);return}
 if(!window.confirm(name+' の初訪問を受付記録へ追加しますか？\n※この操作だけでは参加者承認になりません。'))return;
 await mutate('intake',{name,note,onSiteVerified:true});
});
function updateQuick(){
 const summary=el('opsQuickSummary'),remaining=el('opsRemainingSummary');
 if(!state){
  summary.textContent='管理者の接続待ちです。操作はできません。';
  remaining.textContent='残回数を確認するには管理者で接続してください。';
  return;
 }
 const roster=Array.isArray(state.roster)?state.roster:[];
 const eligible=roster.filter(p=>p.gacha?.checked===true&&Number.isFinite(Number(p.gacha.remaining))&&Number(p.gacha.remaining)>0);
 const unchecked=roster.filter(p=>p.gacha&&!p.gacha.checked);
 // Read-only cross-reference: mismatched approved display names must be
 // visible for review, never silently relinked or auto-verified.
 const masterNames=new Map(roster.filter(p=>/^MIO-\d{4}$/.test(p?.mioId||''))
  .map(p=>[p.mioId,nameKey(p.name)]));
 const nameReviewCount=(Array.isArray(state.approvedBrowsers)?state.approvedBrowsers:[])
  .filter(b=>b?.verified===true&&/^MIO-\d{4}$/.test(b.mioId||'')&&
   (!masterNames.has(b.mioId)||masterNames.get(b.mioId)!==nameKey(b.name))).length;
 // Server-verified browser links are triage, not proof of identity.
 // Display-name differences must not inflate the "single candidate" group.
 const links=new Map(),nameConflicts=new Set();
 for(const browser of (Array.isArray(state.approvedBrowsers)?state.approvedBrowsers:[])){
  if(browser?.verified!==true||!/^MIO-\d{4}$/.test(browser.mioId||''))continue;
  if(!masterNames.has(browser.mioId)||masterNames.get(browser.mioId)!==nameKey(browser.name)){
   nameConflicts.add(browser.mioId);
   continue;
  }
  links.set(browser.mioId,(links.get(browser.mioId)||0)+1);
 }
 const linkReview={single:0,missing:0,multiple:0,nameReview:0};
 for(const participant of eligible){
  if(nameConflicts.has(participant.mioId)){linkReview.nameReview++;continue;}
  const count=links.get(participant.mioId)||0;
  if(count===1)linkReview.single++;
  else if(count===0)linkReview.missing++;
  else linkReview.multiple++;
 }
 const gate=typeof snapshot?.normalOpen==='boolean'?(snapshot.normalOpen?'通常受付 ON':'通常受付 OFF'):'通常受付 未確認';
 const selectedLine=selected?'\n選択中：'+selected.name+' / '+selected.mioId+
  '（残り '+(selected.gacha?.remaining??'要確認')+'回）':'\n参加者未選択';
 summary.textContent='登録承認待ち '+(Number(state.totalPending)||0)+'件 / 既存ガチャ残回数あり '+eligible.length+
  '名 / ガチャ管理行要確認 '+unchecked.length+'名\n'+
  '端末照合候補：単独 '+linkReview.single+'名 / なし '+linkReview.missing+'名 / 複数 '+linkReview.multiple+'名'+
  (linkReview.nameReview?' / 表示名要照合 '+linkReview.nameReview+'名':'')+'\n'+
  (nameReviewCount?'⚠️ 承認済み表示名の差異 '+nameReviewCount+'件（既存承認・IDは変更せず要照合）\n':'')+gate+
  ' / 監査台帳 '+(state.schemaReady===true?'準備済み':'未準備')+' / 管理書込 '+(state.writeEnabled?'有効':'停止中')+' / 現場モード '+(state.writeMode==='onsite'?'個別承認':state.writeMode==='standard'?'既存運営モード':'停止中')+selectedLine+
  '\n※残回数あり＝抽選許可ではありません。端末照合候補は台帳の予備チェックです。残回数・ブラウザ一致だけでは本人確認や抽選許可になりません。';
 remaining.textContent='既存ガチャ残回数あり '+eligible.length+'名。検索・絞り込みで対象を選択できます。';
}
for(const [id,target] of [['opsQuickIntake','opsIntakeSection'],['opsQuickApproval','opsPendingSection'],
 ['opsQuickGrant','opsGrantSection'],['opsQuickGate','normalSection']]){
 el(id).addEventListener('click',()=>{
  const destination=el(target);
  if(destination&&typeof destination.scrollIntoView==='function')destination.scrollIntoView({behavior:'smooth',block:'start'});
 });
}
window.addEventListener('mio:gate-state-changed',updateQuick);
function render(){
 updateQuick();
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
   const onsite=node('label',undefined,'ops-filter');
   const onsiteBox=node('input');onsiteBox.type='checkbox';onsiteBox.setAttribute('aria-label','現場で本人とMIO-IDと登録ブラウザを照合した');
   onsite.append(onsiteBox,node('span','現場で本人・MIO-ID・登録済みブラウザを照合した'));
   wrap.append(onsite);
   const member=node('select',undefined,'ops-select');
   member.setAttribute('aria-label','メンシプ確認');
   for(const [value,label] of [['','メンシプ照合結果を選択（必須）'],['no','メンシプ未確認（登録承認のみ）'],['yes','メンシプ購入確認済み']]){
    const opt=node('option',label);opt.value=value;member.append(opt);
   }
   // An existing sheet value cannot silently qualify as the operator's verification.
   member.value='';
   member.addEventListener('change',()=>{onsiteBox.checked=false});
   wrap.append(member);
   // Search by nickname; identity must still be verified on site, never inferred from name alone.
   const matches=(state.roster||[]).filter(p=>/^MIO-\d{4}$/.test(p.mioId||'')&&nameKey(p.name)===nameKey(item.name));
   const identity=node('select',undefined,'ops-select');
   identity.setAttribute('aria-label','本人確認した既存参加者を選択（ID入力不要）');
   const placeholder=node('option','照合済みの既存参加者を選択（必須）');placeholder.value='';identity.append(placeholder);
   for(const person of matches){
    const option=node('option',person.name+' / '+person.mioId);option.value=person.mioId;identity.append(option);
   }
   identity.value='';
   identity.addEventListener('change',()=>{onsiteBox.checked=false});
   wrap.append(identity);
   if(matches.length>1)wrap.append(node('p','⚠️ 同名候補が複数あります。MIO-ID・元の登録ブラウザ・本人確認が完了するまで承認しないでください。'));
   else if(matches.length===0)wrap.append(node('p','⚠️ 既存参加者を確認できません。新規ID発行前に過去の登録・途中受付を確認してください。'));
   const grant=button('本人照合して承認',async()=>{
    if(onsiteBox.checked!==true){notice('現場確認スイッチで本人・MIO-ID・ブラウザを確認してください',true);return}
    if(member.value!=='yes'&&member.value!=='no'){notice('メンシプ照合結果を管理者が選択してください',true);return}
    const id=identity.value;
    if(!/^MIO-\d{4}$/.test(id)||!matches.some(person=>person.mioId===id)){
     notice('本人確認した既存参加者を候補から選択してください。お客様のID暗記は不要です。',true);return;
    }
    if(item.mioId&&item.mioId!==id){notice('登録済みのMIO-IDと選択した参加者が一致しません。承認を停止しました。',true);return}
    if(!window.confirm(item.name+' / '+id+' を承認しますか？\n'+(member.value==='yes'?'メンシプ確認済み':'メンシプ未確認')))return;
    await mutate('approve',{webId:item.webId,mioId:id,memberConfirmed:member.value==='yes',expectedStatus:'承認待ち',onSiteVerified:true});
   });
   wrap.append(grant);
   if(!item.mioId&&matches.length===0){
     wrap.append(button('初訪問者のMIO-IDを新規作成',async()=>{
        if(onsiteBox.checked!==true){notice('現場で本人・既存登録の照合スイッチを入れてください',true);return}
       if(!window.confirm(item.name+' に新しい参加者IDを作成しますか？\n既存登録がある場合は作成されません。'))return;
       await mutate('create',{webId:item.webId,expectedStatus:'承認待ち',onSiteVerified:true});
     }));
   }else if(!item.mioId&&matches.length){
     wrap.append(node('p','既存MIO-ID候補が見つかりました。新しいIDを作らず、現場で元の登録情報を照合してください。'));
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
  if(['未確認','管理確認待ち'].includes(item.status)){
   const onsite=node('label',undefined,'ops-filter');
   const verified=node('input');verified.type='checkbox';verified.setAttribute('aria-label','現場で簡易受付の本人を確認した');
   onsite.append(verified,node('span','現場で受付内容と本人を確認した'));
   wrap.append(onsite);
   wrap.append(button('受付内容を確認済みにする',async()=>{
     if(verified.checked!==true){notice('現場で簡易受付の本人を確認してスイッチを入れてください',true);return}
     if(!item.createdAt||typeof item.browserId!=='string'){notice('受付日時か登録端末の情報が不足しています。確認操作を停止しました。',true);return}
     if(!window.confirm(item.name+' の簡易受付を確認済みにしますか？\n※参加者登録の承認・ガチャ付与は別操作です。'))return;
     await mutate('review',{row:item.row,expectedStatus:item.status,expectedName:item.name,
       expectedBrowserId:item.browserId||'',expectedCreatedAt:item.createdAt||'',onSiteVerified:true});
   }));
  }else if(item.status!=='確認済み'){
   wrap.append(node('p','⚠️ 過去の登録・承認・動作確認の記録です。操作対象外のため変更しません。'));
  }
  el('opsSimple').append(wrap);
 }
}
function renderMemberBrowsers(){
 const host=el('opsMemberBrowsers');host.replaceChildren();
 if(!state||!selected){
  host.append(node('p','対象の参加者を選択してください。'));return;
 }
 const links=(state.approvedBrowsers||[]).filter(x=>
   x.mioId===selected.mioId&&x.verified===true&&
   nameKey(x.name)===nameKey(selected.name));
 if(!links.length){
  host.append(node('p','本人確認済みの承認ブラウザがありません。端末の照合が必要です。'));return;
 }
 for(const item of links){
  const row=node('article',undefined,'ops-item');
  row.append(node('strong',item.name+' / '+item.mioId));
  row.append(node('p','既存ブラウザ：'+item.webId+'　メンシプ：'+item.member));
  if(item.member==='未確認'){
   const confirmButton=button('この登録端末のメンシプを確認済みにする',async()=>{
    if(el('opsMemberVerified').checked!==true){
      notice('本人・既存ブラウザ・購入内容の確認チェックを入れてください',true);return;
    }
    if(!state?.approvedBrowsers?.some(x=>x.webId===item.webId&&
       x.mioId===selected.mioId&&x.member==='未確認'&&x.verified===true)){
      notice('台帳の状態が変わっています。再読み込みしてください',true);return;
    }
    if(!window.confirm(item.name+' / '+item.mioId+' の既存端末 '+item.webId+
       ' のメンシプを確認済みにしますか？\nガチャ券や登録IDは変更しません。'))return;
    await mutate('member',{webId:item.webId,mioId:item.mioId,
      expectedMember:'未確認',memberConfirmed:true,onSiteVerified:true});
   });
   confirmButton.disabled=confirmButton.disabled||el('opsMemberVerified').checked!==true;
   row.append(confirmButton);
  }else if(item.member==='確認済み'){
   row.append(node('p','✅ この登録端末はメンシプ確認済みです。'));
  }else row.append(node('p','⚠️ 状態不明のため確認操作できません。'));
  host.append(row);
 }
}
function renderRoster(){
 const div=el('opsRoster'),query=el('opsSearch').value.trim().toLowerCase();
 div.replaceChildren();
 if(!state){
  selected=null;
  el('opsMemberVerified').checked=false;
  el('opsPerson').textContent='参加者を選択してください';
  renderMemberBrowsers();
  return;
 }
 const onlyRemaining=el('opsOnlyRemaining').checked;
 const all=(state.roster||[]).filter(x=>(x.name.toLowerCase().includes(query)||x.mioId.toLowerCase().includes(query))&&
  (!onlyRemaining||(x.gacha?.checked===true&&Number(x.gacha.remaining)>0)))
  .sort((a,b)=>onlyRemaining?Number(b.gacha?.remaining||0)-Number(a.gacha?.remaining||0):0).slice(0,45);
 for(const item of all){
  div.append(button(item.name+' ('+item.mioId+')'+(item.needsReview?' ⚠️ 台帳要確認':''),()=>{
    selected=item;
    el('opsOnsiteGrantVerified').checked=false;
    el('opsMemberVerified').checked=false;
    const g=item.gacha;
    el('opsPerson').textContent=item.name+' / '+item.mioId+
      (g?'　総権利 '+g.total+' / 残り '+g.remaining+' / 特別付与 '+g.special:'　ガチャ台帳要確認');
    el('opsGrant').disabled=!grantReady();
    updateQuick();renderMemberBrowsers();
  },true));
 }
 if(!all.length)div.append(node('p','該当者がいません。'));
 if(selected){
  const latest=(state.roster||[]).find(x=>x.mioId===selected.mioId);
  selected=latest||null;
  if(selected?.gacha)el('opsPerson').textContent=selected.name+' / '+selected.mioId+
    '　総権利 '+selected.gacha.total+' / 残り '+selected.gacha.remaining+' / 特別付与 '+selected.gacha.special;
 }else el('opsPerson').textContent='参加者を選択してください';
 el('opsGrant').disabled=!grantReady();
 updateQuick();renderMemberBrowsers();
}
el('opsMemberVerified').addEventListener('change',renderMemberBrowsers);
el('opsSearch').addEventListener('input',renderRoster);
el('opsOnlyRemaining').addEventListener('change',renderRoster);
el('opsOnsiteGrantVerified').addEventListener('change',()=>{el('opsGrant').disabled=!grantReady()});
for(const field of ['opsQuantity','opsReason']){
 el(field).addEventListener('input',()=>{
  el('opsOnsiteGrantVerified').checked=false;
  el('opsGrant').disabled=!grantReady();
 });
}
async function verifyPending(){
 if(processing||!pending)return;
 const wasSubmitted=pending.submitted===true;
 // Persist before network activity. A subsequent reload must treat any previous attempt
 // as uncertain, even when a later retry gets a pre-bridge 403/503 response.
 const attempted={...pending,submitted:true};
 storePending(attempted);
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
  if([400,401,403,405,413,415,503].includes(e.httpStatus)&&!wasSubmitted){
   // First confirmed pre-bridge rejection: no earlier attempt exists to reconcile.
   storePending(null);state=null;render();
   notice('操作は受け付けられませんでした。'+e.message,true);
  }else{
   // A prior write may already have committed. A later 403/503/400 on retry
   // is NOT evidence that the first attempt did not change the ledger.
   state=null;render();
   notice('操作結果が未確認です。新しい操作IDを発行せず、管理者認証・接続を復旧してから同じIDで再確認してください。'+e.message,true);
  }
 }finally{blocked(false);render()}
}
el('opsRetry').addEventListener('click',()=>{
 if(!pending||processing)return;
 const label=pending.action==='grant'?pending.mioId+' に '+pending.count+'回付与'
   :pending.action==='approve'?pending.webId+' の登録承認'
   :pending.action==='member'?pending.webId+' のメンシプ確認':'管理操作 '+pending.action;
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
 if(el('opsOnsiteGrantVerified').checked!==true){notice('本人・メンシプ・既存残回数・付与理由の現場確認スイッチを入れてください',true);return}
 if(!g||!g.checked||!Number.isInteger(count)||count<1||count>50||reason.length<2||reason.length>120){
  notice('参加者・付与回数（1〜50）・理由を確認してください。',true);return;
 }
 if(!window.confirm(selected.name+' / '+selected.mioId+' に '+count+' 回付与しますか？\n現在の特別付与 '+g.special+' → '+(g.special+count)+'\n理由：'+reason))return;
 await mutate('grant',{mioId:selected.mioId,count,expectedSpecial:g.special,reason,onSiteVerified:true});
});
el('opsRoster').append(node('p','管理者コードで接続後に検索できます。'));
window.addEventListener('mio:admin-connected',()=>{el('opsReload').disabled=false;void refresh();});
window.setInterval(()=>{if(ready()&&!processing&&!pending)void refresh({automatic:true});},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready()&&!processing&&!pending)void refresh({automatic:true});});
renderPending();
})();
