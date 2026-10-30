/* Operator intake and gacha grant UI, attached to the existing live gate page.
   Nothing is submitted until the owner explicitly confirms the action. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
let state=null,selected=null,processing=false;
const opsStatus=el('opsStatus');
function notice(t,bad=false){opsStatus.textContent=t;opsStatus.className=bad?'ops-error':'ops-ok'}
function safe(t){return String(t??'')}
function node(tag,text,cls){
 const e=document.createElement(tag);
 if(text!==undefined)e.textContent=safe(text);
 if(cls)e.className=cls;
 return e;
}
function button(label,handler){
 const b=node('button',label,'ops-action');b.type='button';b.addEventListener('click',handler);return b;
}
function ready(){return snapshot&&typeof snapshot.normalOpen==='boolean'}
function request(action,values={}){
 if(!ready())throw Error('先に管理者コードで受付管理へ接続してください');
 return fetch('/api/gacha-admin-ops',{
  method:'POST',headers:{'Content-Type':'application/json'},
  credentials:'same-origin',cache:'no-store',body:JSON.stringify({code,action,...values})
 }).then(async r=>{
  const json=await r.json().catch(()=>({}));
  if(!r.ok||json.ok!==true)throw Error(json.error||'管理データと接続できません');
  return json;
 });
}
function uuid(){return [...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('')}
function blocked(v){processing=v;el('opsReload').disabled=v;el('opsGrant').disabled=v||!selected?.gacha?.checked;el('opsIntakeCreate').disabled=v}
async function refresh(){
 if(processing)return;
 blocked(true);
 notice('管理台帳から最新の受付情報を取得中…');
 try{
  state=await request('read');
  render();
  notice('最新の受付情報を読み込みました。');
 }catch(e){state=null;render();notice(e.message,true)}
 finally{blocked(false)}
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
 el('opsCount').textContent='要確認 '+state.totalPending+' 件';
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
    el('opsGrant').disabled=processing||!g||!g.checked;
  }));
 }
 if(!all.length)div.append(node('p','該当者がいません。'));
 if(selected){
  const latest=(state.roster||[]).find(x=>x.mioId===selected.mioId);
  selected=latest||null;
  if(selected?.gacha)el('opsPerson').textContent=selected.name+' / '+selected.mioId+
    '　総権利 '+selected.gacha.total+' / 残り '+selected.gacha.remaining+' / 特別付与 '+selected.gacha.special;
 }else el('opsPerson').textContent='参加者を選択してください';
 el('opsGrant').disabled=processing||!selected?.gacha?.checked;
}
el('opsSearch').addEventListener('input',renderRoster);
async function mutate(action,payload){
 if(processing)return;
 const operationId=uuid();
 blocked(true);notice('台帳の更新を確認中…');
 try{
  const result=await request(action,{...payload,operationId});
  const replay=result.result?.replayed;
  notice(replay?'同じ操作は処理済みです。二重更新はありません。':'更新を確認しました。最新の状態を取得します。');
  state=await request('read');selected=null;render();
 }catch(e){state=null;render();notice(e.message+'。再読込して状態を確認してください。',true)}
 finally{blocked(false)}
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
})();
