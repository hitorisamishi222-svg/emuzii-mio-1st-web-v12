// One-time link secret never enters URL query or outgoing referrer.
const status=document.getElementById('status');
const button=document.getElementById('claim');
const match=location.hash.match(/^#key=([a-f0-9]{64})$/);
const key=match?.[1]||'';
history.replaceState(null,'',location.pathname);
if(key){status.textContent='リンクの確認ができました。接続してよければ認証ボタンを押してください。';button.disabled=false}
else status.textContent='有効なリンクがありません。元のブラウザで新しいリンクを作成してください。';
button.addEventListener('click',async()=>{
 if(!key)return;
 button.disabled=true;status.textContent='本人確認中です…';
 try{
  const res=await fetch('/api/browser-pair/claim',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
  const data=await res.json();
  if(!res.ok||data.ok!==true)throw Error(data.error||'接続できませんでした');
  status.textContent='認証成功。次回からこのブラウザでは自動ログインします。';
  location.replace('/');
 }catch(err){status.textContent=err.message||'接続に失敗しました';}
});