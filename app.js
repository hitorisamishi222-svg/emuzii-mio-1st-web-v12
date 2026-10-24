const $=id=>document.getElementById(id);
const attendanceDay=$('attendanceDay');
let attendanceConfirmedDays=new Set(),attendanceLockedDays=new Set(),attendanceAchieved=false;
const NAME_KEY='mioColorSingName';
const LOGIN_ID_KEY='mioLoginId';
const ATTEMPT_KEY='mioAttendanceAttemptsV1';
const REGISTRATION_RETRY_KEY='mioPendingRegistrationRetryV1';

// Keep an identical cryptographic retry key across reloads and lost HTTP responses.
// Never create a fresh MIO browser ID for an ambiguous earlier registration.
function registrationRetryKey(name,loginId){
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(REGISTRATION_RETRY_KEY)||'null')}catch{}
  if(saved){
    if(!/^[a-f0-9]{64}$/.test(saved.key||''))throw Error('登録の再送情報が壊れています。運営へお問い合わせください');
    if(saved.name!==name||saved.loginId!==loginId)
      throw Error('前回の登録結果を確認中です。最初に送信した名前とログインIDで再確認してください');
    // Keep the original key and timestamp even after expiry. The server
    // accepts expired keys only alongside an independently signed pending cookie.
    // Creating a fresh key on the client could create a duplicate registration.
    if(!Number.isSafeInteger(saved.issuedAt)||saved.issuedAt>Date.now()+60000)
      throw Error('登録の再送情報が壊れています。運営へお問い合わせください');
    return {key:saved.key,issuedAt:saved.issuedAt};
  }
  if(!globalThis.crypto?.getRandomValues)throw Error('安全な登録番号を作成できませんでした');
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const key=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const issuedAt=Date.now();
  try{
    localStorage.setItem(REGISTRATION_RETRY_KEY,JSON.stringify({name,loginId,key,issuedAt}));
    if(localStorage.getItem(REGISTRATION_RETRY_KEY)===null)throw Error();
  }catch{throw Error('登録情報を安全に保存できません。端末のブラウザ保存設定をご確認ください')}
  return {key,issuedAt};
}
function clearRegistrationRetryKey(){
  try{localStorage.removeItem(REGISTRATION_RETRY_KEY)}catch{}
}
let registered=false;

function readLocalAttempts(){try{const v=JSON.parse(localStorage.getItem(ATTEMPT_KEY)||'{}');return v&&typeof v==='object'?v:{}}catch{return {}}}
function localAttempts(day){return Number(readLocalAttempts()[String(day)]||0)}
function setLocalAttempts(day,count){try{const v=readLocalAttempts();v[String(day)]=Math.max(0,Math.min(2,Number(count)||0));localStorage.setItem(ATTEMPT_KEY,JSON.stringify(v))}catch{}}

if(attendanceDay){
  if(attendanceDay.options.length===0){for(let d=1;d<=31;d++){const o=document.createElement('option');o.value=String(d);o.textContent=`10/${d}`;attendanceDay.appendChild(o)}}
  const now=new Date();attendanceDay.value=String(Math.min(31,Math.max(1,now.getMonth()===9?now.getDate():1)));
}
function syncAttendanceLock(){
  const d=Number(attendanceDay?.value||0),done=attendanceConfirmedDays.has(d),locked=attendanceLockedDays.has(d)||localAttempts(d)>=2,k=$('attendanceKeyword'),b=$('attendanceSubmit'),m=$('attendanceMessage');
  if(locked)attendanceLockedDays.add(d);
  if(attendanceDay){for(const o of attendanceDay.options){const n=Number(o.value);o.textContent=`10/${n}${attendanceConfirmedDays.has(n)?' ✓確認済み':attendanceLockedDays.has(n)||localAttempts(n)>=2?' 🔒入力終了':''}`}}
  if(k){k.disabled=attendanceAchieved||done||locked;k.placeholder=done?'この日は確認済みです':locked?'入力回数の上限に達しました':'その日に発表された文字'}
  if(b){b.disabled=attendanceAchieved||done||locked;b.textContent=done?'確認済み':locked?'入力不可':'確認文字を送信'}
  if(done&&m)m.textContent=`10/${d} は確認済みです。再入力はできません。`;
  else if(locked&&m)m.textContent='入力不可のためライバーにご連絡ください。';
  else if(!attendanceAchieved&&m&&/(確認済み|入力不可)/.test(m.textContent||''))m.textContent='';
}
attendanceDay?.addEventListener('change',syncAttendanceLock);
try{const saved=localStorage.getItem(NAME_KEY);if(saved&&$('name'))$('name').value=saved}catch{}
try{const savedLoginId=localStorage.getItem(LOGIN_ID_KEY);if(savedLoginId&&$('loginId'))$('loginId').value=savedLoginId}catch{}

function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error)}
function parseApiResponse(text){try{return text?JSON.parse(text):{}}catch{return {ok:false,error:'接続先の応答を確認できませんでした'}}}
function xhrPost(path,body={}){return new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST',path,true);x.setRequestHeader('Content-Type','application/json');x.setRequestHeader('Accept','application/json');x.timeout=20000;x.withCredentials=true;x.onload=()=>{const d=parseApiResponse(x.responseText);if(x.status>=200&&x.status<300){resolve(d);return}const e=Error(d.error||`接続できませんでした (${x.status})`);e.status=x.status;reject(e)};x.onerror=()=>reject(Error('通信に失敗しました。もう一度お試しください'));x.ontimeout=()=>reject(Error('通信がタイムアウトしました。もう一度お試しください'));x.send(JSON.stringify(body))})}
async function post(path,body={}){try{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body),credentials:'same-origin',cache:'no-store'});const d=parseApiResponse(await r.text());if(!r.ok){const e=Error(d.error||'接続できませんでした');e.status=r.status;throw e}return d}catch(e){if(e&&typeof e.status==='number')throw e;return await xhrPost(path,body)}}
function showMeta(id,text){const el=$(id);if(el)el.textContent=text||''}
function formatServerDate(value){if(!value)return'';const s=String(value);return s.replace(/^2026\//,'').replace(/:00$/,'')}

function display(d){
  registered=true;
  $('register').hidden=false;
  $('personal').hidden=false;
  $('status').textContent=d.status||'';
  $('greeting').textContent=(d.name||'')+' さん';
  $('participantId').textContent='登録ID：'+d.participantId;
  if($('name')){$('name').value=d.name||$('name').value;$('registerButton').textContent='この名前で参加状況を更新'}
  try{if(d.name)localStorage.setItem(NAME_KEY,d.name)}catch{}
  try{if(d.loginId){localStorage.setItem(LOGIN_ID_KEY,d.loginId);if($('loginId'))$('loginId').value=d.loginId}}catch{}
  $('counts').hidden=!d.progress;
  $('gachaDetail').textContent='';
  if(d.progress){
    const p=d.progress;
    $('prediction').textContent=p.prediction?'提出済':'未提出';
    showMeta('predictionMeta',p.predictionAt?`提出：${formatServerDate(p.predictionAt)}`:'');
    $('attendance').textContent=p.attendanceAchieved?'皆勤達成':'確認中';
    showMeta('attendanceMeta',p.attendanceTodayDone?'今日の確認：済':'');
    attendanceAchieved=!!p.attendanceAchieved;
    if(Array.isArray(p.attendanceConfirmedDays))attendanceConfirmedDays=new Set(p.attendanceConfirmedDays.map(Number));
    if(Array.isArray(p.attendanceLockedDays))attendanceLockedDays=new Set(p.attendanceLockedDays.map(Number));
    syncAttendanceLock();
    $('fa').textContent=(Number(p.fa)||0)+'作品';
    const faBits=[];if(p.faLastAt)faBits.push(`最終応募：${formatServerDate(p.faLastAt)}`);if(p.faLatestStatus)faBits.push(p.faLatestStatus);showMeta('faMeta',faBits.join('／'));
    $('remaining').textContent=(Number(p.gacha?.remaining)||0)+'回';
    showMeta('remainingMeta',p.gacha?.confirmed?'利用可能':'確認待ち');
    $('gachaDetail').textContent=p.gacha?.confirmed
      ?'付与 '+p.gacha.total+'回 ／ 使用 '+p.gacha.used+'回。'+(p.gacha.remaining===0?'残り回数はありません。':p.gacha.total>=5?(p.gacha.used>=4?'5回目以降なのでラキフェスを選べます。':'ラキフェス対象です。5回目の抽選から選べます。'):'総ガチャ権利5回以上でラキフェス対象になります。')
      :'メンシプの購入内容を管理者が確認中です。';
  }
  message(d.status==='承認済み'?'最新の参加状況を表示しています。':'登録は保存済みです。管理者の照合・承認をお待ちください。');
}

async function refresh(){
  const hadValidStatus=registered;
  message('参加状況を確認しています…');
  if($('counts'))$('counts').hidden=true;
  if($('gachaDetail'))$('gachaDetail').textContent='';
  if($('refresh'))$('refresh').disabled=true;
  try{display(await post('/api/status'));return true}
  catch(e){
    // A transient status failure must not turn a known existing session back
    // into a new registration request. Only HTTP 401 confirms no session.
    registered=e.status===401?false:hadValidStatus;
    $('personal').hidden=true;$('register').hidden=false;
    if(registered)$('registerButton').textContent='参加状況を再確認';
    if(e.status===401){
      message('このブラウザの認証情報を確認できません。登録済みの方は再登録せず、運営に端末認証の復旧をご依頼ください。',true);
      if($('registerButton'))$('registerButton').textContent='認証状態を再確認';
    }
    else message(e.status===503?'参加状況のWeb連携は準備中です。予想・FAは上のフォームから応募できます。':e.message,true);
    return false;
  }finally{if($('refresh'))$('refresh').disabled=false}
}

$('register')?.addEventListener('submit',async e=>{
  e.preventDefault();const name=$('name').value.trim();if(!name)return;
  try{localStorage.setItem(NAME_KEY,name)}catch{}
  $('registerButton').disabled=true;
  if(registered){message('最新情報を読み込んでいます…');try{await refresh()}finally{$('registerButton').disabled=false};return}
  message('既存の登録情報を保護するため、この画面では再登録できません。登録済みの方は運営に端末認証の復旧をご依頼ください。新規参加の方は新規登録ページをご利用ください。',true);
  $('registerButton').disabled=false;
  return;
  const loginId=$('loginId')?$('loginId').value.trim():'';
  try{if(loginId)localStorage.setItem(LOGIN_ID_KEY,loginId)}catch{}
  try{
    const retry=registrationRetryKey(name,loginId);
    const d=await post('/api/register',{name,loginId,retryKey:retry.key,retryIssuedAt:retry.issuedAt});
    clearRegistrationRetryKey();
    if(d.loginId)try{localStorage.setItem(LOGIN_ID_KEY,d.loginId)}catch{}
    const refreshed=await refresh();
    if(!refreshed){
      // Registration succeeded even if the subsequent status request failed.
      // Keep its signed browser session and offer a read-only refresh, not a second registration.
      registered=true;
      $('registerButton').textContent='参加状況を再確認';
      message('登録の保存は完了しました。参加状況の取得に失敗したため、時間をおいて「参加状況を再確認」を押してください。');
    }
  }catch(e){
    // Only clear a retry identity when the server definitively rejected the
    // request before writing, never on ambiguous network/502 failures.
    if(e?.status===400||e?.status===503||
      /ログインIDを入力してください|ログインIDが一致しません/.test(e?.message||''))
      clearRegistrationRetryKey();
    message(e.message,true);
  }finally{$('registerButton').disabled=false}
});
$('refresh')?.addEventListener('click',refresh);
$('sessionRetry')?.addEventListener('click',async()=>{const button=$('sessionRetry');button.disabled=true;try{await refresh()}finally{button.disabled=false}});
for(const el of document.querySelectorAll('[data-deadline]'))if(Date.now()>Date.parse(el.dataset.deadline))el.textContent='受付終了';

$('attendanceSubmit')?.addEventListener('click',async()=>{
  const b=$('attendanceSubmit'),m=$('attendanceMessage'),k=$('attendanceKeyword'),day=Number($('attendanceDay').value);
  if(attendanceConfirmedDays.has(day)){m.textContent=`10/${day} は確認済みです。`;syncAttendanceLock();return}
  if(attendanceLockedDays.has(day)||localAttempts(day)>=2){attendanceLockedDays.add(day);m.textContent='入力不可のためライバーにご連絡ください。';syncAttendanceLock();return}
  if(!k.value.trim()){m.textContent='確認文字を入力してください';return}
  b.disabled=true;m.textContent='確認しています…';
  try{
    const d=await post('/api/checkin',{keyword:k.value.trim(),day});
    attendanceConfirmedDays.add(day);setLocalAttempts(day,2);m.textContent=d.message||'確認を受け付けました';k.value='';syncAttendanceLock();await refresh();
  }catch(e){
    const text=e.message||'確認できませんでした';
    if(/確認文字が違います/.test(text)){
      const n=Math.min(2,localAttempts(day)+1);setLocalAttempts(day,n);
      if(n>=2){attendanceLockedDays.add(day);m.textContent='入力不可のためライバーにご連絡ください。'}
      else m.textContent='確認文字が違います。入力できるのはあと1回です。';
    }else if(/入力不可/.test(text)){
      setLocalAttempts(day,2);attendanceLockedDays.add(day);m.textContent='入力不可のためライバーにご連絡ください。';
    }else m.textContent=text;
    syncAttendanceLock();
  }finally{if(!attendanceConfirmedDays.has(day)&&!attendanceLockedDays.has(day)&&localAttempts(day)<2&&!attendanceAchieved)b.disabled=false}
});

const mioBgm=$('mioBgm'),musicToggle=$('musicToggle'),musicVolume=$('musicVolume'),musicStatus=$('musicStatus');
if(mioBgm&&musicToggle){
  try{if('audioSession' in navigator&&navigator.audioSession)navigator.audioSession.type='playback'}catch{}
  const AUDIO_SRC='/mio-awakening.mp3';mioBgm.src=AUDIO_SRC;mioBgm.loop=true;mioBgm.preload='metadata';mioBgm.playsInline=true;mioBgm.volume=1;
  let audioContext=null,sourceNode=null,gainNode=null,webAudioReady=false;
  const saved=Number(localStorage.getItem('mioBgmVolume')),initialVolume=Number.isFinite(saved)?Math.max(0,Math.min(1,saved)):0.7;
  if(musicVolume){musicVolume.hidden=false;musicVolume.disabled=false;musicVolume.min='0';musicVolume.max='1';musicVolume.step='0.05';musicVolume.value=String(initialVolume)}
  const shownVolume=()=>Math.round((Number(musicVolume?.value??initialVolume)||0)*100);
  function syncMusicUi(extra=''){if(mioBgm.paused){musicToggle.textContent='▶ 再生';musicStatus.textContent=extra||`一時停止中・音量 ${shownVolume()}%`}else{musicToggle.textContent='⏸ 一時停止';musicStatus.textContent=extra||`翠の覚醒-MIO- ループ再生中・音量 ${shownVolume()}%`}}
  async function ensureWebAudio(){try{if('audioSession' in navigator&&navigator.audioSession)navigator.audioSession.type='playback'}catch{}if(webAudioReady){if(audioContext?.state==='suspended')try{await audioContext.resume()}catch{};return true}const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;try{audioContext=new AC({latencyHint:'playback'});sourceNode=audioContext.createMediaElementSource(mioBgm);gainNode=audioContext.createGain();gainNode.gain.value=Number(musicVolume?.value??initialVolume);sourceNode.connect(gainNode);gainNode.connect(audioContext.destination);webAudioReady=true;if(audioContext.state==='suspended')try{await audioContext.resume()}catch{};return true}catch{return false}}
  async function applyVolume(){const v=Math.max(0,Math.min(1,Number(musicVolume?.value??initialVolume)||0));localStorage.setItem('mioBgmVolume',String(v));const ok=await ensureWebAudio();if(ok&&gainNode&&audioContext){try{gainNode.gain.setValueAtTime(v,audioContext.currentTime)}catch{gainNode.gain.value=v}}else{try{mioBgm.volume=v}catch{}mioBgm.muted=v===0}syncMusicUi()}
  if('mediaSession' in navigator){try{navigator.mediaSession.metadata=new MediaMetadata({title:'翠の覚醒-MIO-',artist:'翠央 1周年企画',album:'翠央 1周年',artwork:[{src:'/mio-blue-bg.png',sizes:'512x512',type:'image/png'}]});navigator.mediaSession.setActionHandler('play',async()=>{try{await ensureWebAudio();await mioBgm.play()}catch{}});navigator.mediaSession.setActionHandler('pause',()=>mioBgm.pause())}catch{}}
  musicToggle.addEventListener('click',async()=>{try{await ensureWebAudio();await applyVolume();if(mioBgm.paused)await mioBgm.play();else mioBgm.pause();syncMusicUi()}catch{musicStatus.textContent='再生できませんでした。mio-awakening.mp3 を確認してください。'}});
  musicVolume?.addEventListener('input',()=>{void applyVolume()});musicVolume?.addEventListener('change',()=>{void applyVolume()});
  document.addEventListener('visibilitychange',()=>{try{if('audioSession' in navigator&&navigator.audioSession)navigator.audioSession.type='playback'}catch{}if(!document.hidden&&!mioBgm.paused&&audioContext?.state==='suspended')void audioContext.resume().catch(()=>{})});
  window.addEventListener('pageshow',()=>{if(!mioBgm.paused&&audioContext?.state==='suspended')void audioContext.resume().catch(()=>{})});
  mioBgm.addEventListener('play',()=>syncMusicUi());mioBgm.addEventListener('pause',()=>syncMusicUi());mioBgm.addEventListener('ended',()=>syncMusicUi());mioBgm.addEventListener('error',()=>{musicStatus.textContent='音源を読み込めませんでした。mio-awakening.mp3 がGitHubにあるか確認してください。'});syncMusicUi('ボタンを押すと再生します。');
}
async function refreshRegistrationNotice(){
  const el=$('registrationNotice');
  if(!el)return;
  try{
    const response=await fetch('/api/register',{method:'GET',cache:'no-store',credentials:'same-origin'});
    if(!response.ok)return;
    const state=await response.json();
    if(state.registrationOpen===true){
      el.textContent='新規登録の受付を再開しました。初めての方もこの特設サイトから登録できます。登録直後は「承認待ち」となり、既存参加者と同じ本人確認・利用ルールが適用されます。別端末登録は本人確認が必要です。';
    }
  }catch{/* Keep the safe paused notice when the release state cannot be verified. */}
}

void refreshRegistrationNotice();
void refresh();
