// v1.9.4: only an approved browser may create a one-use transfer link.
const button=document.querySelector('#pairCreate');
const out=document.querySelector('#pairOut');
const field=document.querySelector('#pairLink');
const text=document.querySelector('#pairStatus');
button?.addEventListener('click',async()=>{
 button.disabled=true;text.textContent='ログイン情報を確認しています…';
 try{
  const response=await fetch('/api/browser-pair/create',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
  const data=await response.json();
  if(!response.ok||data.ok!==true)throw Error(data.error||'リンクを作成できませんでした');
  field.value=data.url;out.hidden=false;
  text.textContent='3分間だけ有効なリンクです。新しいブラウザで開いてください。';
 }catch(e){text.textContent=e.message||'承認済みのブラウザでやり直してください'}
 finally{button.disabled=false}
});
document.querySelector('#pairCopy')?.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(field.value);text.textContent='コピーしました。別ブラウザでリンクを貼り付けてください。'}
 catch{field.focus();field.select();text.textContent='リンクを長押ししてコピーしてください。'}
});
document.querySelector('#pairShare')?.addEventListener('click',async()=>{
 if(!navigator.share){text.textContent='リンクをコピーして別ブラウザで開いてください。';return}
 try{await navigator.share({title:'翠央1周年 ブラウザ接続',url:field.value})}
 catch(e){if(e.name!=='AbortError')text.textContent='共有できませんでした。コピーを利用してください。'}
});