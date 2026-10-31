// A signed light cookie from the SAME original browser is required. No new registrations.
(()=>{
'use strict';
const panel=document.getElementById('deviceRecoveryPanel');
if(!panel||location.hostname!=='emuzii-mio-1st-web-v12.vercel.app')return;
const start=document.getElementById('deviceRecoveryRequest');
const check=document.getElementById('deviceRecoveryCheck');
const claim=document.getElementById('deviceRecoveryClaim');
const msg=document.getElementById('deviceRecoveryMessage');
let active=false,busy=false,connected=false;
async function call(action){
 const r=await fetch('/api/mio-device-recovery-client',{
  method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
  cache:'no-store',body:JSON.stringify({action})
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok||d.ok!==true){
  const e=Error(d.code||'RECOVERY_NOT_AVAILABLE');e.status=r.status;throw e;
 }
 return d;
}
function note(text){msg.textContent=text}
function buttons(v){busy=v;start.disabled=v;check.disabled=v;claim.disabled=v||!connected}
function explain(e){
 if(e.status===401)return '以前登録したSafari・Chromeで開いてください。認証情報が残っていない場合は、運営に本人確認を依頼してください。新規登録は不要です。';
 if(e.message==='DEVICE_RECOVERY_DISABLED')return 'この復旧機能は確認作業中です。管理者へ連絡してください。';
 if(e.message==='REGISTRATION_NOT_VERIFIED'||e.message==='GAS_GACHA_PROOF_MISSING'||e.message==='GAS_IDENTITY_MISMATCH')
  return '登録台帳との本人確認が完了していません。自動復旧せず管理者に確認してください。';
 return '接続状態を確認できません。同じブラウザのまま再確認してください。';
}
async function refresh(){
 if(!active||busy||document.hidden)return;
 buttons(true);
 try{
  const d=await call('status');
  connected=d.status==='approved';
  if(d.status==='already_connected'){note('ログイン情報が復旧しています。画面を再読み込みしてください。');connected=false;}
  else if(d.status==='approved')note('管理者の承認が完了しました。「ログインを復旧」を押してください。');
  else if(d.status==='pending')note('管理者の本人確認待ちです。この画面を閉じずにお待ちください。');
  else if(d.status==='consumed')note('復旧処理が記録されています。もう一度ログイン復旧をお試しください。');
  else note('復旧申請は未受付です。元のブラウザから申請してください。');
 }catch(e){note(explain(e));connected=false}
 finally{buttons(false)}
}
start.addEventListener('click',async()=>{
 if(busy)return;
 buttons(true);
 try{
  const d=await call('request');
  note(d.status==='approved'?'承認済みです。復旧を進めてください。':
   '復旧申請を受け付けました。管理者の確認後にこの画面から再開できます。');
  connected=d.status==='approved';
 }catch(e){note(explain(e));connected=false}
 finally{buttons(false)}
});
check.addEventListener('click',()=>void refresh());
claim.addEventListener('click',async()=>{
 if(busy||!connected)return;
 buttons(true);
 try{
  const d=await call('claim');
  if(d.status!=='recovered'&&d.status!=='already_connected')throw Error('NOT_RECOVERED');
  note('既存の登録情報でログインを復旧しました。ページを再読み込みします。');
  location.reload();
 }catch(e){note(explain(e));connected=false;buttons(false)}
});
window.addEventListener('mio:legacy-session-missing',()=>{
 active=true;panel.hidden=false;void refresh();
});
window.setInterval(()=>{if(active&&!busy&&!document.hidden)void refresh()},12000);
})();
