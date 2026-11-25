const $=id=>document.getElementById(id), form=$('form'),submit=$('submit'),status=$('status');
let pending=false,completed=false;
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('mio-vnext-device',1);r.onupgradeneeded=()=>r.result.createObjectStore('keys');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('DB_BLOCKED'));});}
async function deviceKey(){
 const db=await openDb();
 try{
  // Generate before starting the transaction; the read/write transaction chooses a single winner across tabs.
  const candidate=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  return await new Promise((resolve,reject)=>{const t=db.transaction('keys','readwrite'),s=t.objectStore('keys'),r=s.get('device-v1');let chosen;r.onsuccess=()=>{chosen=r.result||candidate;if(!r.result)s.put(candidate,'device-v1');};t.oncomplete=()=>resolve(chosen);t.onerror=t.onabort=()=>reject(t.error||Error('KEY_STORAGE'));});
 }finally{db.close();}
}
function base64url(a){return btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function browserHint(){const u=navigator.userAgent||'';return /Edg\//.test(u)?'Edge':/CriOS|Chrome\//.test(u)?'Chrome':/FxiOS|Firefox\//.test(u)?'Firefox':/Safari\//.test(u)?'Safari':'Other';}
function osHint(){const u=navigator.userAgent||'';return /iPhone|iPad|iPod/.test(u)?'iOS':/Android/.test(u)?'Android':/Windows/.test(u)?'Windows':/Mac OS/.test(u)?'macOS':'Other';}
async function post(data){const r=await fetch('/api/mio-level-claim',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'FAILED');return j;}
$('show').addEventListener('click',()=>{const show=$('code').type==='password';$('code').type=show?'text':'password';$('show').setAttribute('aria-pressed',String(show));$('show').textContent=show?'IDを隠す':'IDを表示';});
form.addEventListener('submit',async e=>{
 e.preventDefault();if(pending||completed)return;
 const name=$('name').value.normalize('NFKC').trim().replace(/\s+/gu,' '),code=$('code').value.trim();
 if(!name||!/^MIO-ACCESS-[a-f0-9]{40}$/.test(code)){status.textContent='名前と復旧IDを確認してください。';return;}
 pending=true;submit.disabled=true;status.textContent='登録を確認しています…';
 try{
  const keys=await deviceKey();const publicJwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
  const c=await post({action:'challenge',name,code,publicJwk});
  const signature=base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(c.message)));
  await post({action:'claim',name,code,id:c.id,signature,browser:browserHint(),os:osHint()});
  completed=true;form.reset();$('code').type='password';$('show').textContent='IDを表示';$('show').setAttribute('aria-pressed','false');for(const el of form.elements)el.disabled=true;
  status.textContent='登録が完了しました。';
 }catch(e){status.textContent=e.message==='TRY_LATER'?'時間をおいて再度お試しください。':'登録を確認できませんでした。名前・ID・通信状態を確認してください。既に登録済みの場合はみおにご相談ください。';}
 finally{pending=false;if(!completed)submit.disabled=false;}
});
