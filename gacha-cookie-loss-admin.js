// Logged-in operator manual intake queue. Never unlocks credentials or gacha.
(()=>{
'use strict';
const el=id=>document.getElementById(id);
if(!el('cookieLossAdminPanel'))return;
let ready=false,busy=false,pending=null;
const KEY='mio_cookie_loss_review_op_v1';
try{
 const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');
 if(saved?.action==='review'&&/^[a-f0-9]{32}$/.test(saved.operationId||''))pending=saved;
}catch{}
function save(x){pending=x;try{if(x)sessionStorage.setItem(KEY,JSON.stringify(x));else sessionStorage.removeItem(KEY)}catch{}
 el('cookieLossAdminRetry').hidden=!x;el('cookieLossAdminRetry').disabled=!x||busy||!ready;}
function note(text){el('cookieLossAdminMessage').textContent=text}
function node(tag,s){const x=document.createElement(tag);x.textContent=s;return x}
function nonce(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')}
async function api(data){
 if(!ready||!snapshot)throw Error('管理者ログインが必要です');
 const r=await fetch('/api/mio-cookie-loss-admin',{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({code,...data})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok||d.ok!==true){const e=Error(d.code||'CASE_NOT_AVAILABLE');e.status=r.status;throw e}
 return d;
}
async function refresh(){
 if(!ready||busy||pending||document.hidden)return;
 busy=true;el('cookieLossAdminRefresh').disabled=true;
 try{
  const data=await api({action:'read'}),items=Array.isArray(data.items)?data.items:[];
  const container=el('cookieLossAdminList');container.replaceChildren();
  el('cookieLossAdminCount').textContent=items.length+' 件の相談';
  if(!items.length)container.append(node('p','現在の相談はありません。'));
  for(const item of items){
   const card=node('article','');card.className='ops-item';
   card.append(node('strong',item.name));
   card.append(node('p','申告されたMIO-ID: '+(item.claimedMioId||'不明')));
   card.append(node('p','以前のブラウザ: '+item.previousBrowser));
   const label={submitted:'未確認',reviewing:'運営確認中',manual_verification_required:'別途本人確認が必要'}[item.state]||'終了';
   card.append(node('p','状態: '+label+' ／ 新端末ログイン権限: 未発行'));
   const controls=node('div','');controls.className='ops-grid';
   const choices=item.state==='submitted'?[
    ['reviewing','確認作業を開始'],['manual_verification_required','別途本人確認が必要']]:
    item.state==='reviewing'?[
    ['manual_verification_required','別途本人確認が必要'],['closed','相談を終了']]:
    item.state==='manual_verification_required'?[['closed','相談を終了']]:[];
   for(const [nextState,label]of choices){
    const b=node('button',label);b.type='button';b.className='ops-action';
    b.disabled=busy||!!pending;
    b.addEventListener('click',()=>{
     if(pending||!window.confirm(item.name+' の相談状態を変更しますか？\nこの操作はログイン・ガチャ権利を発行しません。'))return;
     save({action:'review',requestId:item.requestId,expectedState:item.state,nextState,operationId:nonce()});
     void review();
    });
    controls.append(b);
   }
   card.append(controls);container.append(card);
  }
  note('氏名・申告MIO-IDだけでは本人確認済みになりません。既存台帳と運営による本人確認が必要です。');
 }catch(e){note(e.message==='MANUAL_INTAKE_DISABLED'?'新端末相談受付は準備中です。':'⚠️ 相談一覧を確認できません。'+e.message)}
 finally{busy=false;el('cookieLossAdminRefresh').disabled=false;
  el('cookieLossAdminList').querySelectorAll('button').forEach(b=>b.disabled=!!pending);
  save(pending);}
}
async function review(){
 if(!ready||busy||!pending)return;
 busy=true;save(pending);
 try{
  const result=await api(pending);
  if(result.result?.status!==pending.nextState)throw Error('operation not confirmed');
  save(null);note('相談状態を記録しました。ログイン・抽選・ガチャ回数は変更していません。');
 }catch(e){
  // A timeout or 409 is uncertain: retain the exact operation ID.
  if([400,401,403,405,413,415,503].includes(e.status))save(null);
  note('前回の変更結果を確認できません。必要なら同じ操作IDで照合してください。');
 }finally{busy=false;save(pending);if(!pending)void refresh()}
}
el('cookieLossAdminRefresh').addEventListener('click',()=>void refresh());
el('cookieLossAdminRetry').addEventListener('click',()=>{
 if(pending&&window.confirm('前の操作と同じIDで再確認しますか？'))void review();
});
window.addEventListener('mio:admin-connected',()=>{
 ready=true;el('cookieLossAdminRefresh').disabled=false;
 if(pending){note('前の操作が未確認です。同じ操作IDで再確認してください。');save(pending)}
 else void refresh();
});
window.setInterval(()=>{if(ready&&!busy&&!pending&&!document.hidden)void refresh()},30000);
save(pending);
})();
