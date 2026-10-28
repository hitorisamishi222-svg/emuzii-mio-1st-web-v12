// Royal Whale v2.1: UI-only enhancement. No draw, status, inventory, or admin API calls.
(function(){
  'use strict';
  const stage=document.getElementById('gachaStage');
  const panel=document.getElementById('drawPanel');
  if(!stage||!panel||panel.dataset.mioDeluxeReady==='1')return;
  panel.dataset.mioDeluxeReady='1';
  // Presentation-only: keep the original whale artwork sharp in the middle,
  // soften the photograph's outer edge into an independent palace ambience.
  // This never touches draw identifiers, inventory, identity or draw requests.
  const scenery=document.createElement('div');
  scenery.className='mio-stage-scenery';
  scenery.setAttribute('aria-hidden','true');
  const art=document.createElement('div');
  art.className='mio-stage-art';
  scenery.append(art);
  stage.prepend(scenery);
  stage.classList.add('mio-scene-blended');
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
  if(controls){
    // Instructions/progression first, then buttons immediately adjacent to
    // the machine. This keeps the whole effect in the tap's current viewport.
    controls.insertAdjacentElement('beforebegin',steps);
    stage.insertAdjacentElement('beforebegin',controls);
  }else stage.insertAdjacentElement('beforebegin',steps);
  const foot=document.createElement('p');foot.className='mio-deluxe-footnote';foot.textContent='光・宝石の表現は演出です。当選内容と残り回数はシステムの確定結果を表示します。';
  stage.insertAdjacentElement('afterend',foot);
  // Reserve a permanent space for the skip control BELOW the machine.
  // Otherwise hiding/showing it changes the document height and moves the
  // stage if the browser is close to its maximum scroll position.
  const skipSlot=document.createElement('div');
  skipSlot.className='mio-gacha-skip-slot';
  stage.insertAdjacentElement('afterend',skipSlot);
  const liveSkip=document.getElementById('skipDraw');
  if(liveSkip)skipSlot.append(liveSkip);
  // The winner emerges directly in FRONT of the whale machine without
  // extending the page. Close the prize to return to the identical viewport.
  const resultDock=document.getElementById('drawResultCard');
  let pendingRevealTimer=null,demoClosed=null;
  if(resultDock){
    stage.append(resultDock);
    resultDock.classList.remove('mio-result-dock');
    resultDock.classList.add('mio-prize-overlay');
    resultDock.setAttribute('role','dialog');
    resultDock.setAttribute('aria-label','当選アイテム');
    const close=document.createElement('button');
    close.type='button';
    close.id='mioPrizeClose';
    close.className='mio-prize-close';
    close.textContent='閉じる · 次のガチャへ';
    close.setAttribute('aria-label','アイテムを閉じてガチャに戻る');
    resultDock.append(close);
    close.addEventListener('click',()=>{
      if(pendingRevealTimer!==null){clearTimeout(pendingRevealTimer);pendingRevealTimer=null;}
      resultDock.hidden=true;
      resultDock.classList.remove('result-pop','mio-deluxe-demo-result');
      stage.classList.remove('mio-prize-open','v20-prize-visible','royal-sequence-complete');
      window.dispatchEvent(new Event('mio:gacha-prize-closed'));
      if(typeof demoClosed==='function')demoClosed();
    });
  }
  function showPrizeOnMachine(rarity,fromDemo=false){
    if(!resultDock||resultDock.hidden)return;
    if(pendingRevealTimer!==null)clearTimeout(pendingRevealTimer);
    // The existing FX drops the rare capsule first (UR takes longest).
    // Open the actual prize after the capsule's ejection, on the SAME stage.
    const key=String(rarity||'').toUpperCase();
    const delay=fromDemo?220:key==='UR'?1550:key==='SR'?950:key==='R'?520:320;
    pendingRevealTimer=setTimeout(()=>{
      pendingRevealTimer=null;
      if(resultDock.hidden)return;
      stage.classList.add('mio-prize-open');
      resultDock.querySelector('#mioPrizeClose')?.focus({preventScroll:true});
    },delay);
  }
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
  window.addEventListener('mio:gacha-result-shown',e=>{
    clearStage();phase(3,false);showPrizeOnMachine(e.detail?.rarity);
  });
  window.addEventListener('mio:gacha-animation-error',()=>{
    if(pendingRevealTimer!==null){clearTimeout(pendingRevealTimer);pendingRevealTimer=null;}
    stage.classList.remove('mio-prize-open');clearStage();phase(0,false);
  });
  window.addEventListener('pagehide',()=>{
    observer.disconnect();
    if(pendingRevealTimer!==null)clearTimeout(pendingRevealTimer);
  },{once:true});

  // Preview-only interaction. Hard block on the real public hostname.
  // The visual rehearsal must be explicitly requested. Never display it in the normal gacha flow.
  const previewHost=/^emuzii-mio-1st-web-v12-[a-z0-9-]+\.vercel\.app$/i.test(location.hostname)||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  if(!previewHost||new URLSearchParams(location.search).get('deluxeDemo')!=='1')return;
  panel.classList.add('mio-deluxe-demo-mode');
  // Block real draw controls during the rehearsal to prevent accidental paid/limited draws.
  if(controls){controls.querySelectorAll('button').forEach(button=>{button.disabled=true;button.setAttribute('aria-disabled','true');button.title='演出デモ中は実抽選を利用できません'})}
  const demo=document.createElement('section');demo.className='mio-deluxe-demo';demo.setAttribute('aria-label','演出専用体験デモ');
  const heading=document.createElement('h3');heading.textContent='✨ 豪華演出を体験（プレビュー限定）';
  const description=document.createElement('p');description.textContent='登録済み景品の名前・画像・レア度を使う表示見本です（2026/10/28設定の控え）。抽選APIに接続せず、ガチャ回数・当選履歴・本番データを変更しません。';
  const label=document.createElement('label');label.textContent='演出で表示する景品';
  const select=document.createElement('select');select.id='mio-deluxe-demo-rarity';label.htmlFor=select.id;select.setAttribute('aria-label','プレビューする景品を選択');select.disabled=true;
  const waiting=document.createElement('option');waiting.value='';waiting.textContent='景品情報を読み込み中…';select.append(waiting);
  const actionRow=document.createElement('div');actionRow.className='mio-deluxe-demo-actions';
  const normal=document.createElement('button');normal.type='button';normal.textContent='💎 通常を体験';normal.disabled=true;
  const fest=document.createElement('button');fest.type='button';fest.textContent='👑 ラキフェス体験';fest.disabled=true;
  const skipDemo=document.createElement('button');skipDemo.type='button';skipDemo.className='mio-deluxe-demo-skip';skipDemo.textContent='演出をスキップ';skipDemo.hidden=true;skipDemo.disabled=true;
  const status=document.createElement('p');status.className='mio-deluxe-demo-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='どちらも実抽選しません。';
  actionRow.append(normal,fest);demo.append(heading,description,label,select,actionRow,skipDemo,status);
  // Put the actual demo controls immediately ABOVE the machine, not below
  // the entire machine, prize-result dock and explanatory footnote.
  stage.insertAdjacentElement('beforebegin',demo);
  // These controls have changing text/visibility during animations. If they
  // remain ABOVE the stage, Safari/Chrome adjusts the whale's screen position.
  // Put them BELOW the fixed machine, keeping its top edge stable forever.
  skipSlot.append(skipDemo);
  skipSlot.insertAdjacentElement('afterend',status);
  let active=false,activePrize=null,selectedMode='通常',previewPrizes=[];
  demoClosed=()=>{
    reset();
    activePrize=null;
    normal.disabled=!previewPrizes.length;
    fest.disabled=!previewPrizes.length;
    select.disabled=!previewPrizes.length;
    status.textContent='ガチャBOXに戻りました。続けて景品の演出を確認できます（実抽選なし）。';
  };
  const timers=[];
  function showPreviewPrizes(mode){
    const existing=mode===selectedMode?select.value:'';
    selectedMode=mode;
    const subset=previewPrizes.filter(p=>p.mode===mode);
    select.replaceChildren();
    for(const p of subset){
      const option=document.createElement('option');
      option.value=p.id;
      option.textContent=p.id+' · '+p.name+' ['+p.rarity+']';
      select.append(option);
    }
    if(existing&&subset.some(p=>p.id===existing))select.value=existing;
  }
  // Offline-ready preview snapshot. These 27 PUBLIC catalog rows (no user IDs,
  // login, rights, or winner history) are embedded in the already-loaded JS.
  // Safari no longer needs a second JSON request before enabling demo buttons.
  const PREVIEW_SNAPSHOT = [{"id":"MEM-01","mode":"通常","name":"お試し配信アイコン","rarity":"N","odds":7.5,"image":"/gacha-mem-01.jpg"},{"id":"MEM-02","mode":"通常","name":"2次審査中アイコン","rarity":"N","odds":7.5,"image":"/gacha-mem-02.jpg"},{"id":"MEM-03","mode":"通常","name":"ギフリア① ごきげんおてねこ","rarity":"N","odds":7.5,"image":"/gacha-mem-03.jpg"},{"id":"MEM-04","mode":"通常","name":"ギフリア② グルグルグルグル","rarity":"N","odds":7.5,"image":"/gacha-mem-04.jpg"},{"id":"MEM-05","mode":"通常","name":"ギフリア③ 誰よりも楽しむユニコーン","rarity":"N","odds":7.5,"image":"/gacha-mem-05.jpg"},{"id":"MEM-06","mode":"通常","name":"ギフリア④ 崇めよ","rarity":"N","odds":7.5,"image":"/gacha-mem-06.jpg"},{"id":"MEM-07","mode":"通常","name":"衣装コレクション 5月ノーマルver.","rarity":"N","odds":7.5,"image":"/gacha-mem-07.jpg"},{"id":"MEM-08","mode":"通常","name":"衣装コレクション 6月ノーマルver.","rarity":"N","odds":7.5,"image":"/gacha-mem-08.jpg"},{"id":"MEM-09","mode":"通常","name":"初配信アイコン","rarity":"R","odds":6,"image":"/gacha-mem-09.jpg"},{"id":"MEM-10","mode":"通常","name":"衣装コレクション 6月記念日ver.","rarity":"R","odds":6,"image":"/gacha-mem-10.jpg"},{"id":"MEM-11","mode":"通常","name":"待ち受け ラキフェスver.","rarity":"R","odds":6,"image":"/gacha-mem-11.jpg"},{"id":"MEM-12","mode":"通常","name":"待ち受け リアライver.","rarity":"R","odds":6,"image":"/gacha-mem-12.jpg"},{"id":"MEM-13","mode":"通常","name":"スーパーいいね 35回ボイス","rarity":"R","odds":6,"image":"/gacha-mem-13.jpg"},{"id":"MEM-14","mode":"通常","name":"Rから1つ＋Nから2つ選べる","rarity":"SR","odds":7,"image":"/gacha-mem-14.jpg"},{"id":"MEM-15","mode":"通常","name":"初配信の画像","rarity":"UR","odds":1.5,"image":"/gacha-mem-15.jpg"},{"id":"MEM-16","mode":"通常","name":"ドラムしてる翠央","rarity":"UR","odds":1.5,"image":"/gacha-mem-16.jpg"},{"id":"LF-09","mode":"ラキフェス","name":"初配信アイコン","rarity":"N","odds":8,"image":"/gacha-lf-09.jpg"},{"id":"LF-10","mode":"ラキフェス","name":"衣装コレクション 6月記念日ver.","rarity":"N","odds":8,"image":"/gacha-lf-10.jpg"},{"id":"LF-11","mode":"ラキフェス","name":"待ち受け ラキフェスver.","rarity":"N","odds":8,"image":"/gacha-lf-11.jpg"},{"id":"LF-12","mode":"ラキフェス","name":"待ち受け リアライver.","rarity":"N","odds":8,"image":"/gacha-lf-12.jpg"},{"id":"LF-13","mode":"ラキフェス","name":"スーパーいいね 35回ボイス","rarity":"N","odds":8,"image":"/gacha-lf-13.jpg"},{"id":"LF-14","mode":"ラキフェス","name":"通常ガチャNから1つ＋Nから2つ選べる","rarity":"R","odds":20,"image":"/gacha-lf-14.jpg"},{"id":"LF-15","mode":"ラキフェス","name":"スーパーいいね 40回ボイス","rarity":"SR","odds":10,"image":"/gacha-lf-15.jpg"},{"id":"LF-16","mode":"ラキフェス","name":"初配信の画像","rarity":"SR","odds":10,"image":"/gacha-lf-16.jpg"},{"id":"LF-17","mode":"ラキフェス","name":"ドラムしてる翠央","rarity":"SR","odds":10,"image":"/gacha-lf-17.jpg"},{"id":"LF-18","mode":"ラキフェス","name":"「ヒカリへ」審査提出動画","rarity":"UR","odds":5,"image":"/gacha-lf-18.jpg"},{"id":"LF-19","mode":"ラキフェス","name":"「Rising Hope」審査提出動画","rarity":"UR","odds":5,"image":"/gacha-lf-19.jpg"}];
  try{
    const p=PREVIEW_SNAPSHOT;
    if(!Array.isArray(p)||p.length!==27||
       p.filter(x=>x.mode==='通常').length!==16||
       p.filter(x=>x.mode==='ラキフェス').length!==11||
       p.some(x=>!x.id||!x.name||!['N','R','SR','UR'].includes(x.rarity)||
         !/^\/gacha-(?:mem|lf)-\d{2}\.jpg$/.test(x.image)))throw Error('景品データの内容を確認できません');
    previewPrizes=p;
    showPreviewPrizes('通常');
    normal.disabled=false;fest.disabled=false;select.disabled=false;
    status.textContent='登録済み景品27種類を表示できます。景品を選んで演出を確認してください（実抽選なし）。';
  }catch(error){
    status.textContent=error.message+'。実抽選は行いません。';
  }
  const queue=(fn,ms)=>timers.push(setTimeout(fn,ms));
  const reset=()=>{
    while(timers.length)clearTimeout(timers.pop());
    stage.classList.remove('draw-active','royal-charge','royal-release','royal-climax','royal-sequence-complete','reveal','rarity-n','rarity-r','rarity-sr','rarity-ur','is-fest','is-normal','v20-prize-visible','v19-reveal-running','v19-reveal-finished','v191-rarity-n','v191-rarity-r','v191-rarity-sr','v191-rarity-ur');
    const result=document.getElementById('drawResultCard');if(result){result.hidden=true;result.classList.remove('mio-deluxe-demo-result','result-pop')}const oldImage=document.getElementById('drawResultImage');if(oldImage){oldImage.hidden=true;oldImage.removeAttribute('src')}
    clearStage();phase(0,false);
  };
  function finishDemo(prize){
    if(!prize)return;
    const rarity=prize.rarity;
    while(timers.length)clearTimeout(timers.pop());
    stage.classList.remove('draw-active','royal-charge','royal-release','royal-climax');stage.classList.add('royal-sequence-complete','rarity-'+rarity.toLowerCase());
    clearStage();phase(3,false);
    const card=document.getElementById('drawResultCard');
    if(card){card.hidden=false;card.classList.remove('result-pop');card.classList.add('mio-deluxe-demo-result');
      const image=document.getElementById('drawResultImage');
      if(image){
        image.hidden=true;image.removeAttribute('src');
        image.alt=prize.name+'（実景品の表示見本）';
        image.onerror=()=>{image.hidden=true;status.textContent='景品の画像表示に失敗しました。ファイルの配信を確認してください（当選はしていません）。'};
        image.onload=()=>{image.hidden=false};
        image.src=prize.image;
      }
      const r=document.getElementById('drawRarity'),name=document.getElementById('drawPrizeName'),ordinal=document.getElementById('drawOrdinal');
      if(r)r.textContent=rarity+' · DEMO';if(name)name.textContent=prize.name;if(ordinal)ordinal.textContent=prize.id+' · 設定確率 '+prize.odds+'% · 表示見本（当選ではありません）';
    }
    // A 220ms capsule-pop delay reveals this prize over the whale machine.
    showPrizeOnMachine(rarity,true);
    status.textContent='表示確認：'+prize.id+' '+prize.name+'。当選処理・残回数・履歴は変わっていません。';
    // Keep next-spin controls locked until the participant closes the prize.
    active=false;normal.disabled=true;fest.disabled=true;select.disabled=true;skipDemo.hidden=true;skipDemo.disabled=true;
  }
  function run(mode){
    if(active||stage.classList.contains('mio-prize-open')||resultDock&&!resultDock.hidden||!previewPrizes.length)return;
    if(selectedMode!==mode)showPreviewPrizes(mode);
    const prize=previewPrizes.find(p=>p.mode===mode&&p.id===select.value);
    if(!prize)return;
    activePrize=prize;
    active=true;normal.disabled=true;fest.disabled=true;select.disabled=true;skipDemo.hidden=false;skipDemo.disabled=false;
    reset();const rarity=prize.rarity;
    stage.classList.toggle('is-fest',mode==='ラキフェス');
    // The control and machine share the same view. Animation starts
    // immediately at the button tap, never after a screen-slide.
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
    queue(()=>finishDemo(prize),5000*k);
  }
  skipDemo.addEventListener('click',()=>{if(active)finishDemo(activePrize)});
  normal.addEventListener('click',()=>run('通常'));
  fest.addEventListener('click',()=>run('ラキフェス'));
  window.addEventListener('pagehide',()=>{while(timers.length)clearTimeout(timers.pop())},{once:true});
})();
