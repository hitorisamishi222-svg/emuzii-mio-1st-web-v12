// Owner review: exact signed-browser request. One click authorizes only that browser for 15 min.
(()=>{
'use strict';
const el=id=>document.getElementById(id);
if(!el('deviceRecoveryAdminPanel'))return;
const KEY='mio_device_recovery_admin_op_v1';
let connected=false,loading=false,pending=null;
try{
 const p=JSON.parse(sessionStorage.getItem(KEY)||'null');
 if(p&&p.action==='approve'&&/^[a-f0-9]{32}$/.test(p.operationId||''))pending=p;
}catch{}
function save(p){
 pending=p;
 try{if(p)sessionStorage.setItem(KEY,JSON.stringify(p));else sessionStorage.removeItem(KEY)}catch{}
 el('deviceRecoveryAdminRetry').hidden=!p;
 el('deviceRecoveryAdminRetry').disabled=!p||loading||!connected;
}
function note(t){el('deviceRecoveryAdminMessage').textContent=t}
function node(tag,t){const x=document.createElement(tag);x.textContent=t;return x}
function opId(){return [...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function request(data){
 if(!connected||!snapshot)throw Error('管理者の認証が必要です');
 const r=await fetch('/api/mio-device-recovery-admin',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({code,...data})
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok||d.ok!==true){const e=Error(d.code||'RECOVERY_READ_UNAVAILABLE');e.status=r.status;throw e}
 return d;
}
async function refresh(){
 if(!connected||loading||pending||document.hidden)return;
 loading=true;el('deviceRecoveryAdminReload').disabled=true;
 try{
  const d=await request({action:'read'});
  const box=el('deviceRecoveryAdminList');box.replaceChildren();
  const rows=Array.isArray(d.items)?d.items:[];
  const waits=rows.filter(x=>x.state==='pending');
  el('deviceRecoveryAdminCount').textContent='復旧承認待ち '+waits.length+' 件';
  if(!rows.length)box.append(node('p','現在の復旧申請はありません。'));
  for(const item of rows){
   const card=node('article','');card.className='ops-item';
   card.append(node('strong',item.name+' / '+item.mioId));
   card.append(node('p','Web登録ID: '+item.webId));
   card.append(node('p',item.state==='approved'?'承認済み（申請した端末で復旧待ち）':'本人照合済み・管理者承認待ち'));
   card.append(node('small','期限: '+new Date(item.expiresAt).toLocaleString('ja-JP')));
   if(item.state==='pending'){
    const btn=node('button','この本人の登録済みブラウザを復旧許可');
    btn.type='button';btn.className='ops-action';
    btn.disabled=!!pending||loading;
    btn.addEventListener('click',()=>{
     if(pending||!window.confirm(
      item.name+' / '+item.mioId+'\nWeb登録ID: '+item.webId+
      '\n元の署名付きブラウザに限り、15分以内のログイン復旧を承認しますか？'+
      '\n新規登録・当選履歴・ガチャ回数は変更しません。'))return;
     save({action:'approve',requestId:item.requestId,webId:item.webId,mioId:item.mioId,operationId:opId()});
     void approve();
    });
    card.append(btn);
   }
   box.append(card);
  }
  note('既存登録・GASの二重本人確認済みの申請だけを表示しています。');
 }catch(e){
  note(e.message==='DEVICE_RECOVERY_NOT_READY'?'端末復旧の管理操作は本番接続確認まで停止中です。':
    '復旧申請の一覧を確認できません。'+e.message);
 }finally{loading=false;el('deviceRecoveryAdminReload').disabled=false;
  el('deviceRecoveryAdminList').querySelectorAll('button').forEach(b=>{b.disabled=!!pending});
  save(pending)}
}
async function approve(){
 if(!connected||!pending||loading)return;
 loading=true;save(pending);
 try{
  const data=await request(pending);
  if(data.result?.status!=='approved')throw Error('approval not confirmed');
  save(null);
  note(data.result.replayed?
   '前回の承認を確認しました。重複承認はありません。':
   '本人確認済みブラウザへの復旧を許可しました。参加者は元のブラウザで再開できます。');
 }catch(e){
  if([400,401,403,405,413,415,503].includes(e.status))save(null);
  note('復旧許可の結果は未確認です。必要なら同じ操作IDで再確認してください。'+e.message);
 }finally{
  loading=false;save(pending);
  if(!pending)void refresh();
 }
}
el('deviceRecoveryAdminReload').addEventListener('click',()=>void refresh());
el('deviceRecoveryAdminRetry').addEventListener('click',()=>{
 if(pending&&window.confirm('前回の承認操作を同じ操作IDで再確認しますか？'))void approve();
});
window.addEventListener('mio:admin-connected',()=>{
 connected=true;el('deviceRecoveryAdminReload').disabled=false;
 if(pending){note('前回の承認結果が未確認です。同じIDで再確認してください。');save(pending)}
 else void refresh();
});
window.setInterval(()=>{if(connected&&!loading&&!pending)void refresh()},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&connected&&!loading&&!pending)void refresh()});
save(pending);
})();
