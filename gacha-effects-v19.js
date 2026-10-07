// 翠央1周年ガチャ v1.9 — presentation-only enhancement.
// Observes the existing v1.8.8 UI. It never calls /api/gacha and never consumes a draw.
const stage=document.getElementById('gachaStage');
const resultCard=document.getElementById('drawResultCard');
const rarityNode=document.getElementById('drawRarity');
const ordinalNode=document.getElementById('drawOrdinal');

if(stage&&resultCard&&!stage.querySelector('.v19-fx-root')){
  const root=document.createElement('div');
  root.className='v19-fx-root';
  root.setAttribute('aria-hidden','true');

  const sparkles=document.createElement('div'); sparkles.className='v19-sparkles';
  const aura=document.createElement('div'); aura.className='v19-aura';
  const machine=document.createElement('img'); machine.className='v19-machine-img'; machine.alt='';
  const capsule=document.createElement('img'); capsule.className='v19-capsule-img'; capsule.alt=''; capsule.src='/gacha-v19-capsule.svg';

  const reveal=document.createElement('div'); reveal.className='v19-reveal';
  const frame=document.createElement('img'); frame.className='v19-reveal-frame'; frame.alt='';
  const title=document.createElement('div'); title.className='v19-reveal-title';
  const caption=document.createElement('div'); caption.className='v19-reveal-caption';
  reveal.append(frame,title,caption);
  root.append(sparkles,aura,machine,capsule,reveal);
  stage.append(root);

  let missing=false;
  for(const img of [machine,capsule,frame]){
    img.addEventListener('error',()=>{missing=true;root.classList.add('v19-assets-missing')});
  }

  const syncMachine=()=>{machine.src=stage.classList.contains('is-fest')?'/gacha-v19-machine-gold.svg':'/gacha-v19-machine-blue.svg'};
  syncMachine();

  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let token=0,lastSignature='',watchdog=0;

  const rarityKey=()=>{
    const raw=String(rarityNode?.textContent||'').trim().toUpperCase();
    if(raw.includes('UR'))return'ur';
    if(raw.includes('SR'))return'sr';
    if(raw==='R'||raw.includes('レア'))return'r';
    return'n';
  };

  const cleanup=()=>{
    clearTimeout(watchdog);
    reveal.className='v19-reveal';
    stage.classList.remove('v19-reveal-running');
    stage.classList.add('v19-reveal-finished');
    setTimeout(()=>stage.classList.remove('v19-reveal-finished'),1000);
  };

  async function showReveal(){
    if(reduced?.matches){cleanup();return}
    const my=++token,key=rarityKey(),fest=stage.classList.contains('is-fest');
    stage.classList.add('v19-reveal-running');
    stage.classList.remove('v19-reveal-finished');
    reveal.className='v19-reveal show '+(key==='ur'?'ur':key==='sr'?'sr':'');
    frame.src=key==='ur'?'/gacha-v19-frame-ur.svg':'/gacha-v19-frame-sr.svg';

    const seq={
      n:[['N','結果を確認しています…',520]],
      r:[['R','レア演出！',760]],
      sr:[['SR','金色の光が集まる…',1150]],
      ur:[['…','虹色の光が広がる…',700],['UR','UR確定！',1050],['UR','特別な景品が登場！',950]]
    }[key]||[['N','結果を確認しています…',520]];

    watchdog=setTimeout(()=>{if(my===token)cleanup()},5200);
    try{
      for(const [main,sub,ms] of seq){
        if(my!==token)return;
        title.textContent=main;
        caption.textContent=(fest?'LUCKY FESTIVAL · ':'')+sub;
        title.style.animation='none';
        requestAnimationFrame(()=>{title.style.animation=''});
        await wait(ms);
      }
    } finally {
      if(my===token)cleanup();
    }
  }

  const stageObserver=new MutationObserver(()=>syncMachine());
  stageObserver.observe(stage,{attributes:true,attributeFilter:['class']});

  const maybeReveal=()=>{
    if(resultCard.hidden)return;
    const sig=[rarityNode?.textContent||'',ordinalNode?.textContent||'',resultCard.className].join('|');
    if(!sig.trim()||sig===lastSignature)return;
    if(!resultCard.classList.contains('result-pop'))return;
    lastSignature=sig;
    void showReveal();
  };
  const resultObserver=new MutationObserver(maybeReveal);
  resultObserver.observe(resultCard,{attributes:true,attributeFilter:['class','hidden'],childList:true,subtree:true});
  if(ordinalNode)resultObserver.observe(ordinalNode,{childList:true,subtree:true,characterData:true});

  window.addEventListener('pagehide',()=>{token++;clearTimeout(watchdog);stageObserver.disconnect();resultObserver.disconnect()},{once:true});
}
