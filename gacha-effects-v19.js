// 翠央1周年ガチャ v1.9.1 — cinematic presentation-only enhancement.
const stage=document.getElementById('gachaStage');
const resultCard=document.getElementById('drawResultCard');
const rarityNode=document.getElementById('drawRarity');
const ordinalNode=document.getElementById('drawOrdinal');

if(stage&&resultCard&&!stage.querySelector('.v19-fx-root')){
  stage.classList.add('v191-loaded');
  const root=document.createElement('div');root.className='v19-fx-root';root.setAttribute('aria-hidden','true');
  const sparkles=document.createElement('div');sparkles.className='v19-sparkles';
  const bubbles=document.createElement('div');bubbles.className='v191-bubbles';
  for(let i=0;i<14;i++){
    const b=document.createElement('i');b.className='v191-bubble';
    b.style.setProperty('--bx',(6+(i*17)%90)+'%');b.style.setProperty('--by',(2+(i*13)%28)+'%');
    b.style.setProperty('--bs',(8+(i%5)*4)+'px');b.style.setProperty('--bd',(2.8+(i%4)*.55)+'s');b.style.setProperty('--bdelay',(-i*.31)+'s');
    bubbles.append(b);
  }
  const spout=document.createElement('div');spout.className='v191-spout';
  const aura=document.createElement('div');aura.className='v19-aura';
  const chamber=document.createElement('div');chamber.className='v191-ball-chamber';
  const gemLabels=['N','R','N','SR','N','R','N','UR','N','R','N','SR'];
  for(let i=0;i<gemLabels.length;i++){
    const gem=document.createElement('i');gem.className='v191-gem';gem.dataset.rarity=gemLabels[i];
    const label=document.createElement('span');label.className='v191-gem-label';label.textContent=gemLabels[i];gem.append(label);
    const ring=i%3;
    gem.style.setProperty('--rx',(ring===0?72:ring===1?55:38)+'px');
    gem.style.setProperty('--ry',(ring===0?58:ring===1?43:30)+'px');
    gem.style.setProperty('--dur',(2.35+ring*.32)+'s');
    gem.style.setProperty('--idleDur',(8.8+ring*1.15)+'s');
    gem.style.setProperty('--delay',(-(i/gemLabels.length)*(8.8+ring*1.15))+'s');
    chamber.append(gem);
  }
  const winnerGem=document.createElement('div');winnerGem.className='v191-winning-gem';winnerGem.dataset.rarity='N';
  const winnerLabel=document.createElement('span');winnerLabel.textContent='N';winnerGem.append(winnerLabel);
  const machine=document.createElement('img');machine.className='v19-machine-img';machine.alt='';
  const handle=document.createElement('div');handle.className='v191-handle';
  const urPremonition=document.createElement('div');urPremonition.className='v191-ur-premonition';
  const reveal=document.createElement('div');reveal.className='v19-reveal';
  const frame=document.createElement('img');frame.className='v19-reveal-frame';frame.alt='';
  const title=document.createElement('div');title.className='v19-reveal-title';
  const caption=document.createElement('div');caption.className='v19-reveal-caption';
  reveal.append(frame,title,caption);
  root.append(sparkles,bubbles,spout,aura,chamber,machine,handle,winnerGem,urPremonition,reveal);
  stage.append(root);

  for(const img of [machine,frame]) img.addEventListener('error',()=>root.classList.add('v19-assets-missing'));
  const syncMachine=()=>{machine.src=stage.classList.contains('is-fest')?'/gacha-v191-whale-gold.svg':'/gacha-v191-whale-blue.svg'};
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
  const sparkle=(base=660)=>{tone(base,.11,'sine',.022);tone(base*1.5,.09,'sine',.012,.045)};
  const sfxStart=(fest=false)=>{
    noise(.09,.016);
    tone(fest?330:294,.18,'sine',.026);
    tone(fest?415:370,.18,'triangle',.018,.07);
    sparkle(fest?554:494);
  };
  const sfxTick=()=>{
    const f=330+Math.random()*170;
    tone(f,.055,'sine',.008);
    if(Math.random()>.62)tone(f*2,.035,'triangle',.004,.025);
  };
  const sfxRarity=k=>{
    if(k==='ur'){
      [523,659,784,988,1175].forEach((f,i)=>tone(f,.34,'sine',.052,i*.095));
      [784,988,1319].forEach((f,i)=>tone(f,.2,'triangle',.018,.18+i*.08));
      noise(.16,.018);
    }else if(k==='sr'){
      [440,554,659,880].forEach((f,i)=>tone(f,.24,'sine',.034,i*.08));
    }else if(k==='r'){
      tone(523,.17,'sine',.026);tone(659,.18,'sine',.023,.085);sparkle(784);
    }else{
      tone(392,.1,'sine',.014);tone(494,.09,'sine',.011,.06);
    }
  };
  const sfxDrop=()=>{
    tone(220,.11,'sine',.018);
    noise(.055,.014);
    setTimeout(()=>sparkle(659),70);
  };
  const startBgm=fest=>{
    stopBgm();if(!audioOn)return;
    const seq=fest?[392,494,587,659,587,494,440,554]:[330,392,494,440,392,330,294,370];
    bgmStep=0;
    bgmTimer=setInterval(()=>{
      const f=seq[bgmStep++%seq.length];
      tone(f,.2,'sine',.0085);
      if(bgmStep%4===0)tone(f*2,.12,'triangle',.0035,.03);
    },250);
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
  let caution=document.getElementById('gachaRapidCaution');
  if(!caution){
    caution=document.createElement('p');caution.id='gachaRapidCaution';caution.className='v191-caution';
    caution.innerHTML='<strong>お願い：</strong>演出中はボタンを連打せず、結果が表示されるまでそのままお待ちください。<br><span>クジラ内部のN / R / SR / URダイヤの数・配置は演出用で、実際の当選確率を表すものではありません。</span>';
  }
  const balance=document.getElementById('drawRemaining');
  if(balance){balance.insertAdjacentElement('afterend',row);if(!caution.isConnected)row.insertAdjacentElement('afterend',caution)}
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
    const fest=e.detail?.mode==='ラキフェス';syncMachine();setRarityState('n');winnerGem.classList.remove('v191-winner-drop');winnerGem.style.opacity='0';winnerGem.dataset.rarity='N';winnerLabel.textContent='N';sfxStart(fest);startBgm(fest);
    let ticks=0;const t=setInterval(()=>{if(!stage.classList.contains('draw-active')||ticks++>14){clearInterval(t);return}sfxTick()},180);
  });

  window.addEventListener('mio:gacha-result-ready',e=>{
    const k=rarityKey(e.detail?.rarity);setRarityState(k);sfxRarity(k);
    const label=k.toUpperCase();winnerGem.dataset.rarity=label;winnerLabel.textContent=label;
    const dropDelay=k==='ur'?1450:k==='sr'?850:k==='r'?420:220;
    setTimeout(()=>{
      if(stage.classList.contains('draw-active')){
        winnerGem.style.opacity='';winnerGem.classList.remove('v191-winner-drop');void winnerGem.offsetWidth;winnerGem.classList.add('v191-winner-drop');sfxDrop();
      }
    },dropDelay);
    // 結果カードを見せる前に兆候を出す。URは回転中に確定演出まで見せる。
    if(k==='ur'){
      const fest=e.detail?.mode==='ラキフェス';
      frame.src='/gacha-v19-frame-ur.svg';
      reveal.className='v19-reveal show ur v191-pre-reveal';
      title.textContent='…';
      caption.textContent=(fest?'LUCKY FESTIVAL · ':'')+'虹色の反応を検知…';
      setTimeout(()=>{
        if(stage.classList.contains('draw-active')&&currentRarity==='ur'){
          title.textContent='UR';
          caption.textContent=(fest?'LUCKY FESTIVAL · ':'')+'UR確定！';
          title.style.animation='none';requestAnimationFrame(()=>{title.style.animation=''});
        }
      },650);
    }else if(k==='sr'){
      frame.src='/gacha-v19-frame-sr.svg';
      reveal.className='v19-reveal show sr v191-pre-reveal';
      title.textContent='…';caption.textContent='金色の反応…';
      setTimeout(()=>{if(stage.classList.contains('draw-active')&&currentRarity==='sr')reveal.className='v19-reveal'},720);
    }
  });

  window.addEventListener('mio:gacha-final-reveal',e=>{
    const k=rarityKey(e.detail?.rarity);
    stage.classList.add('v19-reveal-running');
    reveal.className='v19-reveal show '+(k==='ur'?'ur':k==='sr'?'sr':'');
    frame.src=k==='ur'?'/gacha-v19-frame-ur.svg':'/gacha-v19-frame-sr.svg';
    title.textContent=k.toUpperCase();
    caption.textContent=(e.detail?.mode==='ラキフェス'?'LUCKY FESTIVAL · ':'')+(k==='ur'?'景品を開封！':k==='sr'?'SUPER RARE！':k==='r'?'レア景品！':'景品を開封！');
  });

  window.addEventListener('mio:gacha-result-shown',e=>{
    const k=rarityKey(e.detail?.rarity);
    winnerGem.style.opacity='0';
    winnerGem.classList.remove('v191-winner-drop');
    reveal.className='v19-reveal';
    void showReveal(k);
  });
  window.addEventListener('mio:gacha-animation-error',()=>{stopBgm();winnerGem.style.opacity='0';winnerGem.classList.remove('v191-winner-drop');clearRarityState()});

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
