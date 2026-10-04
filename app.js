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
  // iPhone SafariではHTMLMediaElement.volumeが効かないことがあるため、
  // Web Audio APIのGainNodeでサイト内音量を調整する。
  mioBgm.loop=true;
  let audioCtx=null,sourceNode=null,gainNode=null;
  async function ensureAudioGraph(){
    if(!audioCtx){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(AC){
        audioCtx=new AC();
        sourceNode=audioCtx.createMediaElementSource(mioBgm);
        gainNode=audioCtx.createGain();
        gainNode.gain.value=Number(musicVolume?.value||0.7);
        sourceNode.connect(gainNode).connect(audioCtx.destination);
      }
    }
    if(audioCtx?.state==='suspended')await audioCtx.resume();
  }
  musicToggle.addEventListener('click',async()=>{
    try{
      await ensureAudioGraph();
      if(mioBgm.paused){
        await mioBgm.play();
        musicToggle.textContent='⏸ 一時停止';
        musicStatus.textContent='翠の覚醒-MIO- ループ再生中';
      }else{
        mioBgm.pause();
        musicToggle.textContent='▶ 再生';
        musicStatus.textContent='一時停止中';
      }
    }catch{
      musicStatus.textContent='再生できませんでした。もう一度再生ボタンを押してください。';
    }
  });
  musicVolume?.addEventListener('input',()=>{
    const v=Number(musicVolume.value);
    if(gainNode)gainNode.gain.value=v;
    else{try{mioBgm.volume=v}catch{}}
  });
  mioBgm.addEventListener('play',()=>{musicStatus.textContent='翠の覚醒-MIO- ループ再生中';});
}
