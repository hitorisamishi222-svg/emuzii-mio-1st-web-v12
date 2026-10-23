// Royal Whale v2.1: UI-only enhancement. No draw, status, inventory, or admin API calls.
(function(){
  'use strict';
  const stage=document.getElementById('gachaStage');
  const panel=document.getElementById('drawPanel');
  if(!stage||!panel||panel.dataset.mioDeluxeReady==='1')return;
  panel.dataset.mioDeluxeReady='1';
  const remaining=document.getElementById('drawRemaining');
  const controls=panel.querySelector('.royal-gacha-controls');
  const mast=document.createElement('div');
  mast.className='mio-deluxe-masthead';
  mast.setAttribute('aria-label','王宮クジラガチャ・豪華演出');
  const crest=document.createElement('span');crest.className='mio-deluxe-crest';crest.textContent='♛';
  const eyebrow=document.createElement('span');eyebrow.className='royal-eyebrow';eyebrow.textContent='MIO 1ST ANNIVERSARY';
  const title=document.createElement('strong');title.className='royal-title';title.textContent='王宮クジラの宝物ガチャ';
  const sub=document.createElement('span');sub.className='royal-sub';sub.textContent='青い輝きと黄金の祝福をあなたに';
  mast.append(crest,eyebrow,title,sub);
  if(remaining)panel.insertBefore(mast,remaining);else panel.prepend(mast);
  const steps=document.createElement('ol');steps.className='mio-deluxe-steps';steps.setAttribute('aria-label','演出の進行');steps.dataset.running='false';
  [['💎','魔法を込める'],['🐳','クジラが輝く'],['👑','宝物と出会う']].forEach(([emoji,label])=>{
    const item=document.createElement('li');item.dataset.state='idle';
    const glyph=document.createElement('span');glyph.className='step-icon';glyph.setAttribute('aria-hidden','true');glyph.textContent=emoji;
    const text=document.createElement('span');text.textContent=label;item.append(glyph,text);steps.append(item);
  });
  if(controls)controls.insertAdjacentElement('afterend',steps);else stage.insertAdjacentElement('beforebegin',steps);
  const foot=document.createElement('p');foot.className='mio-deluxe-footnote';foot.textContent='光・宝石の表現は演出です。当選内容と残り回数はシステムの確定結果を表示します。';
  stage.insertAdjacentElement('afterend',foot);
  function phase(n,active){
    steps.dataset.running=active?'true':'false';
    [...steps.children].forEach((li,i)=>{li.dataset.state=i<n-1?'done':i===n-1?'active':'idle'});
    if(!active&&n===3)steps.lastElementChild.dataset.state='done';
  }
  function clearStage(){stage.classList.remove('mio-deluxe-running');}
  const observer=new MutationObserver(()=>{
    if(!stage.classList.contains('draw-active'))return;
    if(stage.classList.contains('royal-climax'))phase(3,true);
    else if(stage.classList.contains('royal-release'))phase(2,true);
    else if(stage.classList.contains('royal-charge'))phase(1,true);
  });
  observer.observe(stage,{attributes:true,attributeFilter:['class']});
  window.addEventListener('mio:gacha-animation-start',()=>{stage.classList.add('mio-deluxe-running');phase(1,true)});
  window.addEventListener('mio:gacha-result-ready',()=>{clearStage();phase(3,true)});
  window.addEventListener('mio:gacha-result-shown',()=>{clearStage();phase(3,false)});
  window.addEventListener('mio:gacha-animation-error',()=>{clearStage();phase(0,false)});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});

  // Preview-only interaction. Hard block on the real public hostname.
  // The visual rehearsal must be explicitly requested. Never display it in the normal gacha flow.
  const previewHost=/^emuzii-mio-1st-web-v12-[a-z0-9-]+\.vercel\.app$/i.test(location.hostname)||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  if(!previewHost||new URLSearchParams(location.search).get('deluxeDemo')!=='1')return;
  // Block real draw controls during the rehearsal to prevent accidental paid/limited draws.
  if(controls){controls.querySelectorAll('button').forEach(button=>{button.disabled=true;button.setAttribute('aria-disabled','true');button.title='演出デモ中は実抽選を利用できません'})}
  const demo=document.createElement('section');demo.className='mio-deluxe-demo';demo.setAttribute('aria-label','演出専用体験デモ');
  const heading=document.createElement('h3');heading.textContent='✨ 豪華演出を体験（プレビュー限定）';
  const description=document.createElement('p');description.textContent='これは映像だけのダミー体験です。抽選APIには接続せず、残回数・当選記録・本番データを変更しません。';
  const label=document.createElement('label');label.textContent='演出するレア度';
  const select=document.createElement('select');select.id='mio-deluxe-demo-rarity';label.htmlFor=select.id;select.setAttribute('aria-label','演出するレア度');
  for(const rarity of ['N','R','SR','UR']){const option=document.createElement('option');option.value=rarity;option.textContent=rarity;select.append(option)}
  const actionRow=document.createElement('div');actionRow.className='mio-deluxe-demo-actions';
  const normal=document.createElement('button');normal.type='button';normal.textContent='💎 通常を体験';
  const fest=document.createElement('button');fest.type='button';fest.textContent='👑 ラキフェス体験';
  const skipDemo=document.createElement('button');skipDemo.type='button';skipDemo.className='mio-deluxe-demo-skip';skipDemo.textContent='演出をスキップ';skipDemo.hidden=true;skipDemo.disabled=true;
  const status=document.createElement('p');status.className='mio-deluxe-demo-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='どちらも実抽選しません。';
  actionRow.append(normal,fest);demo.append(heading,description,label,select,actionRow,skipDemo,status);
  foot.insertAdjacentElement('afterend',demo);
  let active=false;const timers=[];
  const queue=(fn,ms)=>timers.push(setTimeout(fn,ms));
  const reset=()=>{
    while(timers.length)clearTimeout(timers.pop());
    stage.classList.remove('draw-active','royal-charge','royal-release','royal-climax','royal-sequence-complete','reveal','rarity-n','rarity-r','rarity-sr','rarity-ur','is-fest','is-normal','v20-prize-visible','v19-reveal-running','v19-reveal-finished','v191-rarity-n','v191-rarity-r','v191-rarity-sr','v191-rarity-ur');
    const result=document.getElementById('drawResultCard');if(result)result.hidden=true;
    clearStage();phase(0,false);
  };
  function finishDemo(rarity){
    while(timers.length)clearTimeout(timers.pop());
    stage.classList.remove('draw-active','royal-charge','royal-release','royal-climax');stage.classList.add('royal-sequence-complete','rarity-'+rarity.toLowerCase());
    clearStage();phase(3,false);
    const card=document.getElementById('drawResultCard');
    if(card){card.hidden=false;card.classList.remove('result-pop');void card.offsetWidth;card.classList.add('result-pop');
      const image=document.getElementById('drawResultImage');if(image){image.hidden=true;image.removeAttribute('src')}
      const r=document.getElementById('drawRarity'),name=document.getElementById('drawPrizeName'),ordinal=document.getElementById('drawOrdinal');
      if(r)r.textContent=rarity+' · DEMO';if(name)name.textContent='豪華演出の見本';if(ordinal)ordinal.textContent='ダミー表示 — 抽選・当選はしていません';
    }
    status.textContent='デモ完了。抽選回数・履歴は変わっていません。';
    active=false;normal.disabled=false;fest.disabled=false;skipDemo.hidden=true;skipDemo.disabled=true;
  }
  function run(mode){
    if(active)return;
    active=true;normal.disabled=true;fest.disabled=true;skipDemo.hidden=false;skipDemo.disabled=false;
    reset();const rarity=select.value;
    stage.classList.toggle('is-fest',mode==='ラキフェス');
    stage.classList.add('draw-active');
    // Keep preview animation self-contained: the existing live FX listeners
    // also react to mio:gacha-* and would spawn unrelated timers/sounds.
    stage.classList.add('mio-deluxe-running');phase(1,true);
    status.textContent='王宮の光が集まっています…（演出デモ）';
    const fast=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
    const k=fast ? 0.14 : 1;
    queue(()=>{stage.classList.add('royal-charge');status.textContent='魔法が集まっています…（演出デモ）'},900*k);
    queue(()=>{stage.classList.remove('royal-charge');stage.classList.add('royal-release');status.textContent='クジラが宝物を運んでいます…（演出デモ）'},1900*k);
    queue(()=>{stage.classList.add('royal-climax');status.textContent='結果の演出が現れます…（演出デモ）'},3650*k);
    queue(()=>finishDemo(rarity),5000*k);
  }
  skipDemo.addEventListener('click',()=>{if(active)finishDemo(select.value)});
  normal.addEventListener('click',()=>run('通常'));
  fest.addEventListener('click',()=>run('ラキフェス'));
  window.addEventListener('pagehide',()=>{while(timers.length)clearTimeout(timers.pop())},{once:true});
})();
