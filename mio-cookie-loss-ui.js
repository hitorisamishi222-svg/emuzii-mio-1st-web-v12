// Lost cookie browser support case (not a login or a new registration).
(()=>{
'use strict';
const panel=document.getElementById('cookieLossPanel');if(!panel)return;
const el=id=>document.getElementById(id);
let busy=false;
function message(s){el('cookieLossStatus').textContent=s}
async function send(d){
 const response=await fetch('/api/mio-cookie-loss-client',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(d)
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.ok!==true){const e=Error(data.code||'REQUEST_NOT_CONFIRMED');e.status=response.status;throw e}
 return data;
}
function describe(s){
 if(s==='submitted')return '復旧相談を受け付けました。管理者が既存登録を確認します。まだログインはできません。';
 if(s==='reviewing')return '管理者が確認中です。ログインはまだ解放されていません。';
 if(s==='manual_verification_required')return '本人確認が必要です。以前の登録情報について運営に直接ご相談ください。';
 if(s==='closed')return '今回の相談は終了しています。ログイン復旧の完了を意味するものではありません。';
 return '相談の受付履歴が見つかりません。';
}
function explain(e){
 if(e.message==='MANUAL_INTAKE_DISABLED')return '新端末の復旧相談は準備中です。運営へ直接ご連絡ください。';
 if(e.status===400)return '入力した名前・MIO-ID・ブラウザの種類を確認してください。';
 return '受付状態を確認できません。同じ画面から再確認してください。新規登録はしないでください。';
}
async function status(){
 if(busy)return;
 busy=true;el('cookieLossCheck').disabled=true;
 try{const result=await send({action:'status'});message(describe(result.status))}
 catch(e){message(explain(e))}
 finally{busy=false;el('cookieLossCheck').disabled=false}
}
el('cookieLossSubmit').addEventListener('click',async()=>{
 if(busy)return;
 const name=el('cookieLossName').value.trim();
 const mioId=el('cookieLossMioId').value.trim();
 const previousBrowser=el('cookieLossBrowser').value;
 if(!name){message('以前の登録名を入力してください。');return}
 if(!window.confirm('これは運営への本人確認相談で、ログインの即時解放ではありません。送信しますか？'))return;
 busy=true;el('cookieLossSubmit').disabled=true;
 try{
  const result=await send({action:'submit',name,mioId,previousBrowser});
  message(describe(result.status));
 }catch(e){message(explain(e))}
 finally{busy=false;el('cookieLossSubmit').disabled=false}
});
el('cookieLossCheck').addEventListener('click',()=>void status());
window.addEventListener('mio:legacy-session-missing',()=>{panel.hidden=false;void status()});
})();
