(()=>{'use strict';
 const el=id=>document.getElementById(id),form=el('reviewLinkForm'),notice=el('reviewLinkNotice');
 const key='mio_review_link_pending_v1';let busy=false;
 const send=async data=>{
  const r=await fetch('/api/review-link-admin',{method:'POST',headers:{'Content-Type':'application/json'},
   credentials:'same-origin',cache:'no-store',body:JSON.stringify(data)});
  const result=await r.json();if(!r.ok||result.ok!==true)throw Error(result.error||'照合できませんでした');return result;
 };
 const show=r=>notice.textContent=r.state==='complete'?'連携完了・既存情報保持':r.state==='staged'?
  '仮承認済み。元のブラウザの認証照合待ちです。':r.state==='historical-approved'?'仮承認済み・DB保存完了。端末連携は未確認です。':'承認記録はまだありません。';
 const run=async fn=>{if(busy)return;busy=true;el('reviewLinkSubmit').disabled=true;el('reviewLinkStatus').disabled=true;
  try{await fn()}catch(e){notice.textContent=e.message+'（通信不明時は同じ操作IDで再確認）'}
  finally{busy=false;el('reviewLinkSubmit').disabled=false;el('reviewLinkStatus').disabled=false;}};
 form.addEventListener('submit',e=>{e.preventDefault();void run(async()=>{
  if(!form.reportValidity())return;
  const target={webId:el('reviewLinkWeb').value.trim(),mioId:el('reviewLinkMaster').value.trim(),name:el('reviewLinkName').value};
  let prior=JSON.parse(sessionStorage.getItem(key)||'null');
  if(prior&&Object.keys(target).some(k=>target[k]!==prior[k]))throw Error('前回の操作結果確認が必要です');
  if(!window.confirm(target.name+' / '+target.mioId+' の既存申請を復旧承認しますか？'))return;
  if(!prior){prior={...target,operationId:crypto.randomUUID().replace(/-/g,'')};sessionStorage.setItem(key,JSON.stringify(prior));}
  const r=await send({action:'record',...prior,onSiteVerified:true,memberConfirmed:true});show(r);
  // Keep the operation ID until completion; avoid a second approval on retry.
  if(r.state==='complete'||r.state==='historical-approved')sessionStorage.removeItem(key);
 });});
 el('reviewLinkStatus').addEventListener('click',()=>void run(async()=>{
  const prior=JSON.parse(sessionStorage.getItem(key)||'null');
  const webId=prior?.webId||el('reviewLinkWeb').value.trim();const r=await send({action:'status',webId});show(r);
  if(r.state==='complete'||r.state==='historical-approved')sessionStorage.removeItem(key);
 }));
 const known=JSON.parse(sessionStorage.getItem(key)||'null');if(known){el('reviewLinkWeb').value=known.webId;el('reviewLinkMaster').value=known.mioId;el('reviewLinkName').value=known.name;}
})();
