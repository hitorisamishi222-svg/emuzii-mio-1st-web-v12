const stage=document.getElementById('gachaStage');
const card=document.getElementById('drawResultCard');
const rarity=document.getElementById('drawRarity');
const ordinal=document.getElementById('drawOrdinal');
const prize=document.getElementById('drawPrizeName');
const message=document.getElementById('drawMessage');
let count=0,busy=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));

async function play(button){
  if(busy)return;
  busy=true;
  count++;
  const r=button.dataset.rarity||'N';
  const fest=button.dataset.fest==='1';
  stage.classList.toggle('is-fest',fest);
  stage.classList.add('draw-active');
  card.hidden=true;
  message.textContent=fest?'✨ ラキフェス演出テスト中…':'💎 ガチャマシン演出テスト中…';
  await wait(fest?2100:1650);
  stage.classList.remove('draw-active');
  rarity.textContent=r;
  prize.textContent=fest?'ラキフェス デモ景品':'メンシプ デモ景品';
  ordinal.textContent='演出テスト '+count;
  card.hidden=false;
  card.classList.remove('result-pop');
  void card.offsetWidth;
  card.classList.add('result-pop');
  message.textContent=r==='UR'?'🌈 UR確定演出を再生しています。':'結果演出を再生しています。';
  await wait(r==='UR'?3400:r==='SR'?1800:1200);
  message.textContent='演出確認完了。何度でも試せます。';
  busy=false;
}
document.querySelectorAll('[data-rarity]').forEach(b=>b.addEventListener('click',()=>void play(b)));