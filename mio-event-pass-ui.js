// Mobile-first, no email stored in localStorage. Never assumes a pass grants gacha rights.
(()=>{
'use strict';
const el=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const eventId=params.get('event')||'';
const valid=/^[a-z0-9][a-z0-9_-]{2,39}$/.test(eventId);
let busy=false,verified=false;
function msg(s){el('eventPassMessage').textContent=s}
function setBusy(value){
 busy=value;
 el('eventPassSendCode').disabled=value||!valid;
 el('eventPassVerify').disabled=value||!valid;
 el('eventPassIssue').disabled=value||!valid;
}
async function post(endpoint,body){
 const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok||d.ok!==true){
  const e=Error(d.code||'REQUEST_FAILED');e.status=r.status;throw e;
 }
 return d;
}
function explain(e){
 const code=String(e.message||'');
 if(code==='EMAIL_VERIFICATION_DISABLED'||code==='EVENT_PASSES_DISABLED')
  return '現在、メール認証とイベント参加証は準備中です。公開案内を確認してください。';
 if(code==='EMAIL_SENDER_NOT_CONNECTED')return 'メール送信の準備が完了していません。管理者へご連絡ください。';
 if(code==='EMAIL_RATE_LIMIT')return '連続して確認コードを送信できません。時間を置いてご利用ください。';
 if(code==='INCORRECT_CODE'||code==='VERIFICATION_NOT_CONFIRMED')
  return '確認コードを確認できません。届いた6桁をもう一度確認してください。';
 if(code==='VERIFIED_EMAIL_SESSION_REQUIRED')return '先にメールの6桁コードで本人のメールアドレスを確認してください。';
 if(code==='EVENT_NOT_ELIGIBLE_OR_UNAVAILABLE')
  return 'このイベントの参加条件を確認できません。招待制・限定イベントの場合は運営の案内を確認してください。';
 return '手続きを確認できません。同じブラウザのまま再確認してください。';
}
async function issue(){
 if(busy||!valid)return;
 setBusy(true);
 try{
  const inviteCode=el('eventPassInvite').value.trim();
  const body={action:'issue',eventId};
  if(inviteCode)body.inviteCode=inviteCode;
  const d=await post('/api/mio-event-pass',body);
  verified=true;el('eventPassTicket').hidden=false;
  el('eventPassTicket').textContent='✅ 参加証を確認しました（'+d.passId.slice(0,8)+'…）';
  msg(d.status==='already_issued'?
   'すでに参加証が発行されています。同じ会員のため重複発行していません。':
   '参加証を発行しました！このイベントに参加できます。');
 }catch(e){msg(explain(e))}
 finally{setBusy(false)}
}
el('eventPassEventLabel').textContent=valid?'イベントID：'+eventId:
 'イベントの指定がありません。主催者が案内した専用URLから開いてください。';
setBusy(false);
el('eventPassSendCode').addEventListener('click',async()=>{
 if(busy||!valid)return;
 const email=el('eventPassEmail').value.trim();
 if(!email){msg('メールアドレスを入力してください。');return}
 setBusy(true);
 try{
  const d=await post('/api/mio-event-email',{action:'start',email});
  if(d.status==='code_sent')msg('確認コードを送信しました。届いた6桁を入力してください。');
 }catch(e){msg(explain(e))}
 finally{setBusy(false)}
});
el('eventPassVerify').addEventListener('click',async()=>{
 if(busy||!valid)return;
 const code=el('eventPassCode').value.trim();
 if(!/^[0-9]{6}$/.test(code)){msg('6桁の数字を入力してください。');return}
 setBusy(true);
 try{
  const r=await post('/api/mio-event-email',{action:'verify',code});
  if(r.status!=='email_verified')throw Error('VERIFICATION_NOT_CONFIRMED');
  verified=true;el('eventPassCode').value='';
  msg('メール確認が完了しました。イベント参加証を発行します。');
 }catch(e){msg(explain(e));return}
 finally{setBusy(false)}
 await issue();
});
el('eventPassIssue').addEventListener('click',()=>void issue());
// A signed email session from a prior visit may already exist. Read-only check.
if(valid)void (async()=>{
 try{
  const d=await post('/api/mio-event-pass',{action:'check',eventId});
  if(d.allowed){
   verified=true;el('eventPassTicket').hidden=false;
   el('eventPassTicket').textContent='✅ このイベントの参加資格があります';
   msg('すでに参加証があります。');
  }
 }catch{}
})();
})();
