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

$('attendanceSubmit')?.addEventListener('click',async()=>{const b=$('attendanceSubmit'),m=$('attendanceMessage'),k=$('attendanceKeyword');if(!k.value.trim()){m.textContent='今日の確認文字を入力してください';return}b.disabled=true;m.textContent='確認しています…';try{const r=await fetch('/api/checkin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:k.value,day:Number($('attendanceDay').value)})});const d=await r.json();if(!r.ok)throw Error(d.error||'確認できませんでした');m.textContent=d.message||'今日の確認を受け付けました';k.value='';k.disabled=true;b.disabled=true;await refresh()}catch(e){m.textContent=e.message;b.disabled=false}});

const mioBgm=document.getElementById('mioBgm');
const musicToggle=document.getElementById('musicToggle');
const musicVolume=document.getElementById('musicVolume');
const musicStatus=document.getElementById('musicStatus');
if(mioBgm&&musicToggle){
  // iPhoneでもWeb上で音量を変えつつ、バックグラウンド再生を優先する方式。
  // iOSはHTMLMediaElement.volumeの細かな変更が効かないため、
  // 音量違いのMP3へ切り替える。Web Audio APIは使わない。
  mioBgm.loop=true;
  mioBgm.preload='metadata';

  const volumeFiles={
    25:'/mio-awakening-v25.mp3',
    50:'/mio-awakening-v50.mp3',
    75:'/mio-awakening-v75.mp3',
    100:'/mio-awakening.mp3'
  };
  let currentLevel=75;
  let switching=false;

  if(musicVolume){
    musicVolume.hidden=false;
    musicVolume.disabled=false;
    musicVolume.min='0';
    musicVolume.max='1';
    musicVolume.step='0.25';
    musicVolume.value='0.75';
  }

  function levelFromSlider(v){
    const n=Math.max(0,Math.min(1,Number(v)||0));
    if(n<=0)return 0;
    if(n<=0.375)return 25;
    if(n<=0.625)return 50;
    if(n<=0.875)return 75;
    return 100;
  }

  function syncMusicUi(extra=''){
    const vol=levelFromSlider(musicVolume?.value??0.75);
    if(mioBgm.paused){
      musicToggle.textContent='▶ 再生';
      musicStatus.textContent=extra||`一時停止中・音量 ${vol}%`;
    }else{
      musicToggle.textContent='⏸ 一時停止';
      musicStatus.textContent=extra||`翠の覚醒-MIO- ループ再生中・音量 ${vol}%`;
    }
  }

  async function switchVolume(level){
    if(switching)return;
    if(level===0){
      mioBgm.muted=true;
      syncMusicUi('ミュート中・ループ設定は維持されています');
      return;
    }
    mioBgm.muted=false;
    if(level===currentLevel){
      syncMusicUi();
      return;
    }
    const nextSrc=volumeFiles[level];
    if(!nextSrc)return;

    switching=true;
    const wasPlaying=!mioBgm.paused;
    const pos=Number.isFinite(mioBgm.currentTime)?mioBgm.currentTime:0;
    currentLevel=level;
    musicStatus.textContent=`音量 ${level}% に切り替えています…`;

    const restore=async()=>{
      try{
        if(Number.isFinite(mioBgm.duration)&&mioBgm.duration>0){
          mioBgm.currentTime=Math.min(pos,Math.max(0,mioBgm.duration-0.2));
        }
      }catch{}
      if(wasPlaying){
        try{await mioBgm.play()}catch{}
      }
      switching=false;
      syncMusicUi();
    };

    mioBgm.addEventListener('loadedmetadata',restore,{once:true});
    mioBgm.src=nextSrc;
    mioBgm.load();
  }

  if('mediaSession' in navigator){
    try{
      navigator.mediaSession.metadata=new MediaMetadata({
        title:'翠の覚醒-MIO-',
        artist:'翠央 1周年企画',
        album:'翠央 1周年',
        artwork:[{src:'/mio-blue-bg.png',sizes:'512x512',type:'image/png'}]
      });
      navigator.mediaSession.setActionHandler('play',async()=>{try{await mioBgm.play()}catch{}});
      navigator.mediaSession.setActionHandler('pause',()=>mioBgm.pause());
    }catch{}
  }

  musicToggle.addEventListener('click',async()=>{
    try{
      if(mioBgm.paused)await mioBgm.play();
      else mioBgm.pause();
      syncMusicUi();
    }catch{
      musicStatus.textContent='再生できませんでした。音源ファイルを確認してください。';
    }
  });

  musicVolume?.addEventListener('input',()=>{
    const level=levelFromSlider(musicVolume.value);
    void switchVolume(level);
  });

  mioBgm.addEventListener('play',()=>syncMusicUi());
  mioBgm.addEventListener('pause',()=>syncMusicUi());
  mioBgm.addEventListener('ended',()=>syncMusicUi());
  mioBgm.addEventListener('error',()=>{
    switching=false;
    musicStatus.textContent='音源を読み込めませんでした。4つのMP3がアップロードされているか確認してください。';
  });

  // 初期音量75%版から開始。
  mioBgm.src=volumeFiles[75];
}
