'use strict';
(()=>{
 const status=document.getElementById('passkeyStatus'),loginBtn=document.getElementById('passkeyLogin'),registerBtn=document.getElementById('passkeyRegister');
 if(!status||!loginBtn||!registerBtn)return;
 const say=(s)=>status.textContent=s;
 const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
 const encode=v=>btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const creation=o=>typeof PublicKeyCredential.parseCreationOptionsFromJSON==='function'?PublicKeyCredential.parseCreationOptionsFromJSON(o):{
  ...o,challenge:decode(o.challenge),user:{...o.user,id:decode(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(c=>({...c,id:decode(c.id)}))};
 const authentication=o=>typeof PublicKeyCredential.parseRequestOptionsFromJSON==='function'?PublicKeyCredential.parseRequestOptionsFromJSON(o):{
  ...o,challenge:decode(o.challenge),allowCredentials:(o.allowCredentials||[]).map(c=>({...c,id:decode(c.id)}))};
 const regJSON=c=>typeof c.toJSON==='function'?c.toJSON():{
  id:c.id,rawId:encode(c.rawId),type:c.type,response:{
   attestationObject:encode(c.response.attestationObject),clientDataJSON:encode(c.response.clientDataJSON),
   transports:c.response.getTransports?.()||[]},clientExtensionResults:c.getClientExtensionResults()};
 const authJSON=c=>typeof c.toJSON==='function'?c.toJSON():{
  id:c.id,rawId:encode(c.rawId),type:c.type,response:{
   authenticatorData:encode(c.response.authenticatorData),clientDataJSON:encode(c.response.clientDataJSON),
   signature:encode(c.response.signature),userHandle:c.response.userHandle?encode(c.response.userHandle):null},
  clientExtensionResults:c.getClientExtensionResults()};
 async function post(action,values={}){
  const r=await fetch('/api/gacha-passkey',{method:'POST',headers:{'Content-Type':'application/json'},
   credentials:'same-origin',cache:'no-store',body:JSON.stringify({action,...values})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.ok!==true)throw Error(data.error||'パスキーに接続できません');
  return data;
 }
 async function refreshGate(){
  code='';
  snapshot=await request({action:'read'});
  $('code').value='';redraw();
  say('✅ Face IDで管理者としてログインしました。');
 }
 function buttons(disabled){loginBtn.disabled=disabled;registerBtn.disabled=disabled}
 loginBtn.onclick=async()=>{
  buttons(true);say('Face IDで本人確認しています…');
  try{
   const start=await post('loginOptions');
   const credential=await navigator.credentials.get({publicKey:authentication(start.options)});
   if(!credential)throw Error('認証がキャンセルされました');
   await post('loginVerify',{credential:authJSON(credential)});
   await refreshGate();
  }catch(e){say('Face IDログイン：'+e.message);buttons(false)}
  finally{buttons(false)}
 };
 registerBtn.onclick=async()=>{
  const adminCode=$('code').value;
  if(adminCode.length<20){say('初回登録は管理者コードを入力してください。');return}
  if(!confirm('この端末のFace ID・パスキーをガチャ管理者として登録しますか？'))return;
  buttons(true);say('パスキーを登録しています…');
  try{
   const start=await post('registerOptions',{code:adminCode});
   const credential=await navigator.credentials.create({publicKey:creation(start.options)});
   if(!credential)throw Error('登録がキャンセルされました');
   await post('registerVerify',{code:adminCode,credential:regJSON(credential)});
   await refreshGate();
  }catch(e){say('Face ID登録：'+e.message)}
  finally{buttons(false)}
 };
 const supported=window.isSecureContext&&typeof PublicKeyCredential!=='undefined'&&!!navigator.credentials;
 if(!supported){say('この端末・ブラウザはパスキー非対応です。管理者コードでログインできます。');buttons(true);return}
 buttons(true);
 post('status').then(s=>{
  buttons(false);
  if(s.authenticated)refreshGate();
  else say('初回は管理者コードを入力し「Face IDを登録」。次回からFace IDでログインできます。');
 }).catch(()=>{buttons(true);say('Face IDは現在準備中です。これまでの管理者コードは使用できます。')});
})();
