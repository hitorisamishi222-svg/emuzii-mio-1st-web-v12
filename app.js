const attendanceDay=document.getElementById('attendanceDay');
if(attendanceDay){for(let d=1;d<=31;d++){const o=document.createElement('option');o.value=String(d);o.textContent=`10/${d}`;attendanceDay.appendChild(o)}const now=new Date();attendanceDay.value=String(Math.min(31,Math.max(1,now.getMonth()===9?now.getDate():1)));}
import {updateGacha} from './gacha.js';
const $=id=>document.getElementById(id);
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error)}
async function post(path,body={}){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin',cache:'no-store'});let d;try{d=await r.json()}catch{throw Error('接続先の応答を確認できませんでした')}if(!r.ok){const e=Error(d.error||'接続できませんでした');e.status=r.status;throw e}return d}
function display(d){updateGacha(d.participantId,d.status==='承認済み');$('register').hidden=true;$('personal').hidden=false;$('status').textContent=d.status;$('greeting').textContent=d.name+' さん';$('participantId').textContent='登録ID：'+d.participantId;$('counts').hidden=!d.progress;$('gachaDetail').textContent='';if(d.progress){const p=d.progress;$('prediction').textContent=p.prediction?'提出済':'未提出';$('attendance').textContent=p.attendanceAchieved?'達成':'確認中';$('attendanceMessage').textContent=p.attendanceTodayDone?'今日は確認済みです':'';$('attendanceKeyword').disabled=!!p.attendanceAchieved;$('attendanceSubmit').disabled=!!p.attendanceAchieved;$('fa').textContent=p.fa+'作品';$('remaining').textContent=p.gacha.remaining+'回';$('gachaDetail').textContent=p.gacha.confirmed?'付与 '+p.gacha.total+'回 ／ 使用 '+p.gacha.used+'回。'+(p.gacha.remaining===0?'残り回数はありません。':p.gacha.total>=5?'通常／ラキフェスを選べます。':'総ガチャ権利5回以上でラキフェスが解放されます。'):'メンシプの購入内容を管理者が確認中です。'}message(d.status==='承認済み'?'シートの最新情報を反映しました。':'登録は保存済みです。管理者の照合・承認をお待ちください。')}
async function refresh(){message('参加状況を確認しています…');$('counts').hidden=true;$('gachaDetail').textContent='';$('refresh').disabled=true;try{display(await post('/api/status'))}catch(e){$('personal').hidden=true;if(e.status===401){$('register').hidden=false;message('初めての方は登録してください。')}else{$('register').hidden=false;message(e.status===503?'参加状況のWeb連携は準備中です。予想・FAは上のフォームから応募できます。':e.message,true)}}finally{$('refresh').disabled=false}}
$('register').addEventListener('submit',async e=>{e.preventDefault();const name=$('name').value.trim();if(!name)return;$('registerButton').disabled=true;message('登録を保存しています…');try{await post('/api/register',{name});await refresh()}catch(e){message(e.message,true)}finally{$('registerButton').disabled=false}});
$('refresh').addEventListener('click',refresh);
for(const el of document.querySelectorAll('[data-deadline]'))if(Date.now()>Date.parse(el.dataset.deadline))el.textContent='受付終了';
await refresh();

$('attendanceSubmit')?.addEventListener('click',async()=>{const b=$('attendanceSubmit'),m=$('attendanceMessage'),k=$('attendanceKeyword');if(!k.value.trim()){m.textContent='確認文字を入力してください';return}b.disabled=true;m.textContent='確認しています…';try{const d=await post('/api/checkin',{keyword:k.value.trim(),day:Number($('attendanceDay').value)});m.textContent=d.message||'確認を受け付けました';k.value='';await refresh()}catch(e){m.textContent=e.message||'確認できませんでした'}finally{b.disabled=false}});

const mioBgm=document.getElementById('mioBgm');
const musicToggle=document.getElementById('musicToggle');
const musicVolume=document.getElementById('musicVolume');
const musicStatus=document.getElementById('musicStatus');
if(mioBgm&&musicToggle){
  // iOS/SafariでWeb Audioをバックグラウンド継続させるため、
  // AudioContext作成前にAudio Sessionを明示的にplaybackへ固定する。
  // 非対応ブラウザでは無視される。
  try{
    if('audioSession' in navigator && navigator.audioSession){
      navigator.audioSession.type='playback';
    }
  }catch{}

  // 音源は1ファイルだけ。音量違いの別MP3は使わない。
  // Web Audio の GainNode でサイト内音量を調整しつつ、
  // HTMLAudioElement 自体はループ・Media Session対応のまま使う。
  const AUDIO_SRC='/mio-awakening.mp3';
  mioBgm.src=AUDIO_SRC;
  mioBgm.loop=true;
  mioBgm.preload='metadata';
  mioBgm.playsInline=true;
  mioBgm.volume=1;

  let audioContext=null;
  let sourceNode=null;
  let gainNode=null;
  let webAudioReady=false;

  const saved=Number(localStorage.getItem('mioBgmVolume'));
  const initialVolume=Number.isFinite(saved)?Math.max(0,Math.min(1,saved)):0.7;
  if(musicVolume){
    musicVolume.hidden=false;
    musicVolume.disabled=false;
    musicVolume.min='0';
    musicVolume.max='1';
    musicVolume.step='0.05';
    musicVolume.value=String(initialVolume);
  }

  function shownVolume(){
    return Math.round((Number(musicVolume?.value??initialVolume)||0)*100);
  }

  function syncMusicUi(extra=''){
    if(mioBgm.paused){
      musicToggle.textContent='▶ 再生';
      musicStatus.textContent=extra||`一時停止中・音量 ${shownVolume()}%`;
    }else{
      musicToggle.textContent='⏸ 一時停止';
      musicStatus.textContent=extra||`翠の覚醒-MIO- ループ再生中・音量 ${shownVolume()}%`;
    }
  }

  async function ensureWebAudio(){
    try{
      if('audioSession' in navigator && navigator.audioSession){
        navigator.audioSession.type='playback';
      }
    }catch{}
    if(webAudioReady){
      if(audioContext?.state==='suspended'){
        try{await audioContext.resume()}catch{}
      }
      return true;
    }
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return false;
    try{
      audioContext=new AC({latencyHint:'playback'});
      sourceNode=audioContext.createMediaElementSource(mioBgm);
      gainNode=audioContext.createGain();
      gainNode.gain.value=Number(musicVolume?.value??initialVolume);
      sourceNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      webAudioReady=true;
      if(audioContext.state==='suspended'){
        try{await audioContext.resume()}catch{}
      }
      return true;
    }catch(err){
      console.warn('Web Audio init failed',err);
      return false;
    }
  }

  async function applyVolume(){
    const v=Math.max(0,Math.min(1,Number(musicVolume?.value??initialVolume)||0));
    localStorage.setItem('mioBgmVolume',String(v));
    const ok=await ensureWebAudio();
    if(ok&&gainNode&&audioContext){
      try{gainNode.gain.setValueAtTime(v,audioContext.currentTime)}catch{gainNode.gain.value=v}
    }else{
      // Android/PC等ではこちらでも動く。iPhoneはGainNode側を優先。
      try{mioBgm.volume=v}catch{}
      mioBgm.muted=v===0;
    }
    syncMusicUi();
  }

  if('mediaSession' in navigator){
    try{
      navigator.mediaSession.metadata=new MediaMetadata({
        title:'翠の覚醒-MIO-',
        artist:'翠央 1周年企画',
        album:'翠央 1周年',
        artwork:[{src:'/mio-blue-bg.png',sizes:'512x512',type:'image/png'}]
      });
      navigator.mediaSession.setActionHandler('play',async()=>{
        try{await ensureWebAudio();await mioBgm.play()}catch{}
      });
      navigator.mediaSession.setActionHandler('pause',()=>mioBgm.pause());
    }catch{}
  }

  musicToggle.addEventListener('click',async()=>{
    try{
      await ensureWebAudio();
      await applyVolume();
      if(mioBgm.paused) await mioBgm.play();
      else mioBgm.pause();
      syncMusicUi();
    }catch{
      musicStatus.textContent='再生できませんでした。mio-awakening.mp3 を確認してください。';
    }
  });

  musicVolume?.addEventListener('input',()=>{void applyVolume()});
  musicVolume?.addEventListener('change',()=>{void applyVolume()});

  // 画面へ戻った時にWeb Audioが停止していたら復帰を試す。
  document.addEventListener('visibilitychange',()=>{
    try{
      if('audioSession' in navigator && navigator.audioSession){
        navigator.audioSession.type='playback';
      }
    }catch{}
    if(!document.hidden&&!mioBgm.paused&&audioContext?.state==='suspended'){
      void audioContext.resume().catch(()=>{});
    }
  });
  window.addEventListener('pageshow',()=>{
    if(!mioBgm.paused&&audioContext?.state==='suspended'){
      void audioContext.resume().catch(()=>{});
    }
  });

  mioBgm.addEventListener('play',()=>syncMusicUi());
  mioBgm.addEventListener('pause',()=>syncMusicUi());
  mioBgm.addEventListener('ended',()=>syncMusicUi());
  mioBgm.addEventListener('error',()=>{
    musicStatus.textContent='音源を読み込めませんでした。mio-awakening.mp3 がGitHubにあるか確認してください。';
  });

  syncMusicUi('ボタンを押すと再生します。');
}
