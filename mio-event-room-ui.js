// HTML shell holds no protected content. This client uses textContent only.
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const eventId=new URLSearchParams(location.search).get('event')||'';
const valid=/^[a-z0-9][a-z0-9_-]{2,39}$/.test(eventId);
const title=el('eventRoomTitle'),status=el('eventRoomStatus'),body=el('eventRoomBody');
el('eventRoomBack').href=valid?'/event-pass.html?event='+encodeURIComponent(eventId):
 '/event-pass.html';
if(!valid){
 title.textContent='イベント指定を確認できません';
 status.textContent='運営から案内されたイベントURLを確認してください。';
 return;
}
void (async()=>{
 try{
  const response=await fetch('/api/mio-event-room',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true){
   title.textContent='イベントへの入場確認';
   status.textContent=data.code==='EVENT_ROOM_DISABLED'?
    'イベント会場は準備中です。公開案内を確認してください。':
    data.code==='VERIFIED_EMAIL_REQUIRED'?
    'メールの6桁コードによる認証が必要です。参加証のページから確認してください。':
    data.code==='EVENT_ENTRY_DENIED'?
    'このイベントの参加証が確認できません。参加証のページに戻ってください。':
    '通信状況を確認できません。同じブラウザで再度お試しください。';
   return;
  }
  if(typeof data.title!=='string'||typeof data.bodyText!=='string')throw Error('invalid room');
  title.textContent=data.title;
  body.textContent=data.bodyText;
  body.hidden=false;
  status.textContent='参加証を確認しました。';
 }catch{
  title.textContent='イベントへの入場確認';
  status.textContent='安全な読み込みを確認できません。同じブラウザで再度お試しください。';
 }
})();
})();
