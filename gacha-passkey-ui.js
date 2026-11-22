'use strict';
(()=>{
 const status=document.getElementById('passkeyStatus'),loginBtn=document.getElementById('passkeyLogin'),registerBtn=document.getElementById('passkeyRegister');
 if(!status||!loginBtn||!registerBtn)return;
 const say=s=>status.textContent=s;
 const registerLabel=registerBtn.textContent,loginLabel=loginBtn.textContent;
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
 let prepared=null,busy=false;
 function reset(){
  prepared=null;
  registerBtn.textContent=registerLabel;
  loginBtn.textContent=loginLabel;
 }
 function describe(e,phase){
  if(e?.name==='NotAllowedError')return phase+'：端末認証が完了しませんでした。再度準備して試してください。';
  if(e?.name==='SecurityError')return phase+'：ブラウザが認証元を許可しませんでした。';
  if(e?.name==='InvalidStateError')return phase+'：既存パスキーを確認してください。';
  return phase+'：'+(e?.message||'認証を完了できません');
 }
 async function step(kind){
  if(busy)return;
  const registering=kind==='register',btn=registering?registerBtn:loginBtn;
  const adminCode=registering?$('code').value:'';
  if(registering&&adminCode.length<20){reset();say('初回登録は管理者コードを入力してください。');return}
  busy=true;buttons(true);
  let phase='サーバー認証準備';
  try{
   const ready=prepared&&prepared.kind===kind&&prepared.code===adminCode&&Date.now()<prepared.expires;
   if(!ready){
    reset();say('サーバーで認証を準備しています…');
    const start=await post(registering?'registerOptions':'loginOptions',registering?{code:adminCode}:{});
    const options=registering?creation(start.options):authentication(start.options);
    prepared={kind,code:adminCode,options,expires:Date.now()+45000};
    btn.textContent=registering?'Face IDを登録する（確認）':'Face IDで本人確認する';
    say(registering?'準備完了。もう一度ボタンを押すと、この端末を管理者として登録します。':'準備完了。もう一度ボタンを押して端末認証してください。');
    return;
   }
   const options=prepared.options;
   reset();
   phase='端末認証';
   say('端末のFace ID・パスキー認証を待っています…');
   // The second, independent native click initiates WebAuthn directly:
   // no confirm dialog, fetch, timer, or awaited operation precedes it.
   const credential=await (registering?navigator.credentials.create({publicKey:options}):navigator.credentials.get({publicKey:options}));
   if(!credential)throw Error('認証がキャンセルされました');
   phase='サーバー認証確認';say('端末認証を受け取りました。サーバーで確認中…');
   await post(registering?'registerVerify':'loginVerify',registering?{code:adminCode,credential:regJSON(credential)}:{credential:authJSON(credential)});
   phase='管理画面の接続';await refreshGate();
  }catch(e){reset();say(describe(e,phase))}
  finally{busy=false;buttons(false)}
 }
 loginBtn.onclick=()=>step('login');
 registerBtn.onclick=()=>step('register');
 const supported=window.isSecureContext&&typeof PublicKeyCredential!=='undefined'&&!!navigator.credentials;
 if(!supported){say('この端末・ブラウザはパスキー非対応です。管理者コードでログインできます。');buttons(true);return}
 buttons(true);
 post('status').then(s=>{
  buttons(false);
  if(s.authenticated)refreshGate().catch(e=>say(describe(e,'管理画面の接続')));
  else say('初回は管理者コードを入力し「Face IDを登録」。準備後、もう一度押して端末認証します。');
 }).catch(()=>{buttons(true);say('Face IDは現在準備中です。これまでの管理者コードは使用できます。')});
})();
