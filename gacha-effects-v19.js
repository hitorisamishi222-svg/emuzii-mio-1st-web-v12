// 翠央1周年ガチャ v1.9.1 — cinematic presentation-only enhancement.
const stage=document.getElementById('gachaStage');
const resultCard=document.getElementById('drawResultCard');
const rarityNode=document.getElementById('drawRarity');
const ordinalNode=document.getElementById('drawOrdinal');

if(stage&&resultCard&&!stage.querySelector('.v19-fx-root')){
  const root=document.createElement('div');root.className='v19-fx-root';root.setAttribute('aria-hidden','true');
  const sparkles=document.createElement('div');sparkles.className='v19-sparkles';
  const aura=document.createElement('div');aura.className='v19-aura';
  const chamber=document.createElement('div');chamber.className='v191-ball-chamber';
  const colors=[['#5feaff','#1674f2','#69efff'],['#ffd968','#d88712','#ffe46a'],['#ff78ca','#a744d6','#ff8adb'],['#a8ffea','#22a985','#9affdf']];
  for(let i=0;i<12;i++){
    const b=document.createElement('i');b.className='v191-ball';
    const c=colors[i%colors.length];
    b.style.setProperty('--c1',c[0]);b.style.setProperty('--c2',c[1]);b.style.setProperty('--glow',c[2]);
    b.style.setProperty('--x',(18+(i*23)%68)+'%');b.style.setProperty('--y',(18+(i*31)%66)+'%');
    b.style.setProperty('--dur',(0.34+(i%5)*0.06)+'s');b.style.setProperty('--delay',(-i*0.055)+'s');
    chamber.append(b);
  }
  const machine=document.createElement('img');machine.className='v19-machine-img';machine.alt='';
  const capsule=document.createElement('img');capsule.className='v19-capsule-img';capsule.alt='';capsule.src='/gacha-v19-capsule.svg';
  const urPremonition=document.createElement('div');urPremonition.className='v191-ur-premonition';
  const reveal=document.createElement('div');reveal.className='v19-reveal';
  const frame=document.createElement('img');frame.className='v19-reveal-frame';frame.alt='';
  const title=document.createElement('div');title.className='v19-reveal-title';
  const caption=document.createElement('div');caption.className='v19-reveal-caption';
  reveal.append(frame,title,caption);
  root.append(sparkles,aura,chamber,machine,capsule,urPremonition,reveal);
  stage.append(root);

  for(const img of [machine,capsule,frame]) img.addEventListener('error',()=>root.classList.add('v19-assets-missing'));
  const syncMachine=()=>{machine.src=stage.classList.contains('is-fest')?'/gacha-v19-machine-gold.svg':'/gacha-v19-machine-blue.svg'};
  syncMachine();

  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let token=0,lastSignature='',watchdog=0,currentRarity='n';

  // ----- audio: original procedural sounds, no external media required -----
  let audioCtx=null,bgmTimer=0,bgmStep=0;
  const audioKey='mio_gacha_audio_v191';
  let audioOn=true;
  try{audioOn=localStorage.getItem(audioKey)!=='off'}catch{}
  const ensureAudio=()=>{
    if(!audioOn)return null;
    try{
      if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended')audioCtx.resume();
      return audioCtx;
    }catch{return null}
  };
  const tone=(freq=440,dur=.12,type='sine',gain=.045,when=0)=>{
    const ctx=ensureAudio();if(!ctx)return;
    const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=freq;
    const t=ctx.currentTime+when;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+dur+.03);
  };
  const noise=(dur=.08,gain=.02)=>{
    const ctx=ensureAudio();if(!ctx)return;
    const len=Math.max(1,Math.floor(ctx.sampleRate*dur)),buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);
    for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);
    const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buf;g.gain.value=gain;src.connect(g).connect(ctx.destination);src.start();
  };
  const sfxStart=(fest=false)=>{noise(.12,.026);tone(fest?180:150,.16,'square',.028);tone(fest?260:220,.18,'triangle',.022,.08)};
  const sfxTick=()=>{noise(.035,.012);tone(180+Math.random()*90,.045,'triangle',.012)};
  const sfxRarity=k=>{
    if(k==='ur'){[523,659,784,1047].forEach((f,i)=>tone(f,.34,'sine',.055,i*.1));noise(.22,.03)}
    else if(k==='sr'){[440,554,659].forEach((f,i)=>tone(f,.25,'triangle',.04,i*.085))}
    else if(k==='r'){tone(523,.18,'triangle',.032);tone(659,.2,'triangle',.028,.1)}
    else tone(392,.11,'sine',.02);
  };
  const sfxDrop=()=>{noise(.1,.035);tone(130,.18,'sine',.028)};
  const startBgm=fest=>{
    stopBgm();if(!audioOn)return;
    const seq=fest?[220,277,330,415,330,277]:[196,247,294,330,294,247];
    bgmStep=0;bgmTimer=setInterval(()=>{tone(seq[bgmStep++%seq.length],.19,'triangle',.011)},230);
  };
  const stopBgm=()=>{if(bgmTimer){clearInterval(bgmTimer);bgmTimer=0}};

  // audio control + caution
  const panel=document.getElementById('drawPanel');
  const row=document.createElement('div');row.className='v191-audio-row';
  const audioBtn=document.createElement('button');audioBtn.type='button';audioBtn.className='v191-audio-toggle';
  const updateAudioLabel=()=>audioBtn.textContent=audioOn?'🔊 音あり':'🔇 音なし';
  updateAudioLabel();
  audioBtn.addEventListener('click',()=>{
    audioOn=!audioOn;try{localStorage.setItem(audioKey,audioOn?'on':'off')}catch{}
    if(!audioOn){stopBgm();if(audioCtx?.state==='running')audioCtx.suspend()}else ensureAudio();
    updateAudioLabel();
  });
  row.append(audioBtn);
  const caution=document.createElement('p');caution.className='v191-caution';
  caution.innerHTML='<strong>お願い：</strong>演出中はボタンを連打せず、結果が表示されるまでそのままお待ちください。';
  const balance=document.getElementById('drawRemaining');
  if(balance){balance.insertAdjacentElement('afterend',row);row.insertAdjacentElement('afterend',caution)}
  else if(panel){panel.prepend(caution,row)}

  const rarityKey=v=>{
    const raw=String(v||'').trim().toUpperCase();
    if(raw.includes('UR'))return'ur';if(raw.includes('SR'))return'sr';if(raw==='R'||raw.includes('レア'))return'r';return'n';
  };
  const clearRarityState=()=>stage.classList.remove('v191-rarity-n','v191-rarity-r','v191-rarity-sr','v191-rarity-ur');
  const setRarityState=k=>{clearRarityState();stage.classList.add('v191-rarity-'+k);currentRarity=k};

  const cleanup=()=>{
    clearTimeout(watchdog);stopBgm();
    reveal.className='v19-reveal';stage.classList.remove('v19-reveal-running');stage.classList.add('v19-reveal-finished');
    clearRarityState();setTimeout(()=>stage.classList.remove('v19-reveal-finished'),1000);
  };

  async function showReveal(key=currentRarity){
    if(reduced?.matches){cleanup();return}
    const my=++token,fest=stage.classList.contains('is-fest');
    stage.classList.add('v19-reveal-running');stage.classList.remove('v19-reveal-finished');
    reveal.className='v19-reveal show '+(key==='ur'?'ur':key==='sr'?'sr':'');
    frame.src=key==='ur'?'/gacha-v19-frame-ur.svg':'/gacha-v19-frame-sr.svg';
    const seq={
      n:[['N','結果を開封します',420]],
      r:[['R','レア！',650]],
      sr:[['SR','金色の光が集まる…',950],['SR','SUPER RARE！',650]],
      ur:[['…','虹色の光が収束する…',520],['UR','UR確定！',900],['UR','特別な景品が登場！',720]]
    }[key];
    watchdog=setTimeout(()=>{if(my===token)cleanup()},5200);
    try{
      for(const [main,sub,ms] of seq){
        if(my!==token)return;title.textContent=main;caption.textContent=(fest?'LUCKY FESTIVAL · ':'')+sub;
        title.style.animation='none';requestAnimationFrame(()=>title.style.animation='');await wait(ms);
      }
    }finally{if(my===token)cleanup()}
  }

  window.addEventListener('mio:gacha-animation-start',e=>{
    const fest=e.detail?.mode==='ラキフェス';syncMachine();setRarityState('n');sfxStart(fest);startBgm(fest);
    let ticks=0;const t=setInterval(()=>{if(!stage.classList.contains('draw-active')||ticks++>14){clearInterval(t);return}sfxTick()},180);
    setTimeout(()=>sfxDrop(),1250);
  });

  window.addEventListener('mio:gacha-result-ready',e=>{
    const k=rarityKey(e.detail?.rarity);setRarityState(k);sfxRarity(k);
    // UR/SR兆候は結果カードを見せる前から開始
    if(k==='ur'){
      caption.textContent='虹色の反応を検知…';
      setTimeout(()=>{if(stage.classList.contains('draw-active')){title.textContent='UR';caption.textContent='UR確定！'}},650);
    }
  });

  window.addEventListener('mio:gacha-result-shown',e=>{
    const k=rarityKey(e.detail?.rarity);void showReveal(k);
  });
  window.addEventListener('mio:gacha-animation-error',()=>{stopBgm();clearRarityState()});

  const stageObserver=new MutationObserver(()=>syncMachine());
  stageObserver.observe(stage,{attributes:true,attributeFilter:['class']});

  const maybeReveal=()=>{
    if(resultCard.hidden)return;
    const sig=[rarityNode?.textContent||'',ordinalNode?.textContent||'',resultCard.className].join('|');
    if(!sig.trim()||sig===lastSignature||!resultCard.classList.contains('result-pop'))return;
    lastSignature=sig;
    // fallback when event hook is unavailable
    if(!stage.classList.contains('v19-reveal-running'))void showReveal(rarityKey(rarityNode?.textContent));
  };
  const resultObserver=new MutationObserver(maybeReveal);
  resultObserver.observe(resultCard,{attributes:true,attributeFilter:['class','hidden'],childList:true,subtree:true});
  if(ordinalNode)resultObserver.observe(ordinalNode,{childList:true,subtree:true,characterData:true});

  window.addEventListener('pagehide',()=>{token++;clearTimeout(watchdog);stopBgm();stageObserver.disconnect();resultObserver.disconnect()},{once:true});
}
