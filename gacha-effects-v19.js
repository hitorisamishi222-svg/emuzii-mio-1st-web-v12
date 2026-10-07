// v1.9 preview — presentation-only gacha effects.
// This module observes existing UI state. It never calls draw APIs,
// never changes entitlement/remaining/history values, and never consumes a draw.
const stage=document.getElementById('gachaStage');
const resultCard=document.getElementById('drawResultCard');
const rarityNode=document.getElementById('drawRarity');

if(stage&&resultCard){
  const root=document.createElement('div');
  root.className='v19-fx-root';
  root.setAttribute('aria-hidden','true');

  const sparkles=document.createElement('div');
  sparkles.className='v19-fx-sparkles';

  const machine=document.createElement('div');
  machine.className='v19-machine';
  const core=document.createElement('div');
  core.className='v19-machine-core';
  const handle=document.createElement('div');
  handle.className='v19-machine-handle';
  const capsule=document.createElement('div');
  capsule.className='v19-capsule';
  machine.append(core,handle,capsule);

  const reveal=document.createElement('div');
  reveal.className='v19-reveal';
  const burst=document.createElement('div');
  burst.className='v19-reveal-burst';
  const title=document.createElement('div');
  title.className='v19-reveal-title';
  const sub=document.createElement('div');
  sub.className='v19-reveal-sub';
  reveal.append(burst,title,sub);

  root.append(sparkles,machine,reveal);
  stage.append(root);

  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let revealToken=0;

  function rarityKey(){
    const raw=String(rarityNode?.textContent||'').toUpperCase();
    if(raw.includes('UR'))return'ur';
    if(raw.includes('SR'))return'sr';
    if(raw==='R'||raw.includes('レア'))return'r';
    return'n';
  }

  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  async function showReveal(){
    const token=++revealToken;
    const key=rarityKey();
    reveal.className='v19-reveal is-showing rarity-'+key;
    stage.classList.add('v19-reveal-running');
    stage.classList.remove('v19-reveal-finished');

    if(reduced?.matches){
      reveal.classList.remove('is-showing');
      stage.classList.remove('v19-reveal-running');
      stage.classList.add('v19-reveal-finished');
      return;
    }

    const fest=stage.classList.contains('is-fest');
    const sequences={
      n:[['N','結果を確認しています…',520]],
      r:[['R','レア演出！',720]],
      sr:[['SR','金色の光が集まる…',980]],
      ur:[
        ['…','虹色の光が広がる…',700],
        ['UR','UR確定！',1100],
        ['UR','特別な景品が登場！',1050]
      ]
    };
    const seq=sequences[key]||sequences.n;

    for(const [main,caption,duration] of seq){
      if(token!==revealToken)return;
      title.textContent=main;
      sub.textContent=(fest?'LUCKY FESTIVAL · ':'')+caption;
      // Restart title animation between UR phases without reading layout-sensitive state.
      title.style.animation='none';
      requestAnimationFrame(()=>{title.style.animation=''});
      await wait(duration);
    }

    if(token!==revealToken)return;
    reveal.classList.remove('is-showing');
    stage.classList.remove('v19-reveal-running');
    stage.classList.add('v19-reveal-finished');
    setTimeout(()=>stage.classList.remove('v19-reveal-finished'),1100);
  }

  // Existing draw code adds draw-active while the server draw is running and
  // reveals drawResultCard only after the server result has been received.
  // We only react to that confirmed result.
  let lastPop=resultCard.classList.contains('result-pop');
  let lastOrdinal='';
  const ordinalNode=document.getElementById('drawOrdinal');
  const triggerConfirmedReveal=()=>{
    const pop=resultCard.classList.contains('result-pop');
    const ordinal=String(ordinalNode?.textContent||'');
    if(pop&&(!lastPop||ordinal!==lastOrdinal)){
      lastOrdinal=ordinal;
      void showReveal();
    }
    lastPop=pop;
  };
  const observer=new MutationObserver(triggerConfirmedReveal);
  observer.observe(resultCard,{attributes:true,attributeFilter:['class','hidden'],childList:true,subtree:true});
  if(ordinalNode)observer.observe(ordinalNode,{childList:true,subtree:true,characterData:true});

  window.addEventListener('pagehide',()=>{
    revealToken++;
    observer.disconnect();
  },{once:true});
}