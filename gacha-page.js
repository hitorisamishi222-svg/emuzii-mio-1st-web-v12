const $=id=>document.getElementById(id);
let participant='',busy=false,confirming=false,lastCatalog=null,lastResult=null,animationTimers=[],skipRequested=false,skipWaitResolve=null;
const pendingKey=()=>`mio_pending_draw_${participant||'unknown'}`;
const isPreview=location.hostname!=='emuzii-mio-1st-web-v12.vercel.app';
function parse(text){try{return text?JSON.parse(text):{}}catch{return {ok:false,error:'応答を確認できませんでした'}}}
async function post(path,body={}){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)});const d=parse(await r.text());if(!r.ok){const e=Error(d.error||'通信に失敗しました');e.status=r.status;throw e}return d}
function note(t){$('drawMessage').textContent=t||''}
function remember(){try{return JSON.parse(localStorage.getItem(pendingKey())||'null')}catch{return null}}
function forget(){try{localStorage.removeItem(pendingKey())}catch{}}
function safeImage(url){return typeof url==='string'&&/^https:\/\//i.test(url)?url:''}
function rarityKey(v){const r=String(v||'').toUpperCase();return r.includes('UR')?'ur':r.includes('SR')?'sr':r==='R'||r.includes('レア')?'r':'n'}
function clearEffects(){const stage=$('gachaStage');stage?.classList.remove('draw-active','royal-charge','royal-release','royal-climax','royal-sequence-complete','reveal','rarity-n','rarity-r','rarity-sr','rarity-ur');document.querySelectorAll('.gacha-particle,.gacha-flash,.gacha-ring').forEach(x=>x.remove())}
function particles(count,kind){if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;const stage=$('gachaStage');if(!stage)return;for(let i=0;i<count;i++){const x=document.createElement('i');x.className=`gacha-particle ${kind}`;x.style.setProperty('--x',`${Math.random()*100}%`);x.style.setProperty('--dx',`${(Math.random()-.5)*260}px`);x.style.setProperty('--delay',`${Math.random()*.35}s`);x.style.setProperty('--dur',`${1.05+Math.random()*1.25}s`);x.textContent=Math.random()>.46?'✦':Math.random()>.5?'◆':'★';stage.append(x);setTimeout(()=>x.remove(),3000)}}
function revealEffect(rarity,mode){window.dispatchEvent(new CustomEvent('mio:gacha-result-ready',{detail:{rarity,mode}}));clearEffects();const stage=$('gachaStage'),key=rarityKey(rarity);stage?.classList.add(`rarity-${key}`,mode==='ラキフェス'?'is-fest':'is-normal');if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;stage?.classList.add('reveal');const flash=document.createElement('i');flash.className='gacha-flash';stage?.append(flash);const ring=document.createElement('i');ring.className='gacha-ring';stage?.append(ring);particles({n:26,r:42,sr:72,ur:110}[key]||30,key);setTimeout(()=>{flash.remove();ring.remove();stage?.classList.remove('reveal')},1900)}
function clearAnimationTimers(){animationTimers.forEach(clearTimeout);animationTimers=[]}
function startEffect(mode){
  clearEffects();clearAnimationTimers();
  window.dispatchEvent(new CustomEvent('mio:gacha-animation-start',{detail:{mode}}));
  const stage=$('gachaStage');stage?.classList.add('draw-active');stage?.classList.remove('v20-prize-visible','v191-rarity-n','v191-rarity-r','v191-rarity-sr','v191-rarity-ur');stage?.classList.toggle('is-fest',mode==='ラキフェス');
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){stage?.classList.add('royal-sequence-complete');note('演出を短縮しています。抽選結果を確認しています…');return}
  const fest=mode==='ラキフェス';
  particles(fest?70:46,fest?'sr':'n');
  animationTimers.push(setTimeout(()=>{stage?.classList.add('royal-charge');note(fest?'🌟 黄金の光が集まっていく…！':'✨ 王宮の光が集まっていく…！');particles(fest?60:34,fest?'ur':'r')},900));
  animationTimers.push(setTimeout(()=>{stage?.classList.remove('royal-charge');stage?.classList.add('royal-release');note('🎁 光とともにカプセルが出てくるよ！');particles(fest?80:42,fest?'sr':'n')},1900));
  animationTimers.push(setTimeout(()=>{stage?.classList.add('royal-climax');note(fest?'👑 ラキフェス最高潮！結果が現れる…！':'💫 光が最高潮！結果が現れる…！');particles(fest?95:65,'ur')},3650));
  animationTimers.push(setTimeout(()=>{stage?.classList.remove('royal-charge','royal-release','royal-climax','draw-active');stage?.classList.add('royal-sequence-complete');note('演出が完了しました。抽選結果の確定を待っています…')},5000));
}
function makeId(){return crypto.randomUUID?crypto.randomUUID().replaceAll('-',''):Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')}
function fmtDate(v){if(!v)return'';try{const d=new Date(v);if(!Number.isNaN(d.getTime()))return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}catch{}return String(v)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function renderCatalog(target,c){target.replaceChildren();const p=document.createElement('p');p.className='catalog-status';p.textContent=c.message;target.append(p);for(const x of c.prizes||[]){const row=document.createElement('div');row.className='prize';const image=safeImage(x.image);if(image){const img=document.createElement('img');img.src=image;img.alt=x.name||'';img.loading='lazy';img.addEventListener('error',()=>img.remove(),{once:true});row.append(img)}const meta=document.createElement('div');const n=document.createElement('strong');n.textContent=x.name;const s=document.createElement('span');s.textContent=`${x.rarity?x.rarity+' · ':''}${x.chance}%`;meta.append(n,s);row.append(meta);target.append(row)}}
function renderResult(d){lastResult=d;const stage=$('gachaStage'),card=$('drawResultCard'),img=$('drawResultImage');stage.classList.toggle('is-fest',d.mode==='ラキフェス');revealEffect(d.rarity,d.mode);card.hidden=false;card.classList.remove('result-pop');void card.offsetWidth;card.classList.add('result-pop');$('drawRarity').textContent=d.rarity||'';$('drawPrizeName').textContent=d.prize||'当選';$('drawOrdinal').textContent=`${d.ordinal}回目${d.replayed?'（確認済み結果）':''}`;const image=safeImage(d.image);if(image){img.src=image;img.alt=d.prize||'当選景品';img.hidden=false;img.onerror=()=>{img.hidden=true}}else{img.hidden=true;img.removeAttribute('src')}window.dispatchEvent(new CustomEvent('mio:gacha-result-shown',{detail:{rarity:d.rarity,mode:d.mode}}));/* The winner appears over the fixed machine; do not scroll. */}
function setButtons(c){
  if(!$('drawResultCard').hidden){$('drawNormal').disabled=true;$('drawFest').disabled=true;return;}
  if(busy){note('ガチャ情報の更新中です。少し待ってからもう一度押してください。');return;}
  if(confirming){note('抽選の確認画面で操作を完了してください。');return;}
  const pending=remember(),start=Number(c.festAvailableFrom)||5,normalOpen=c.normalOpen===true,festOpen=c.festOpen===true;
  // Always explain why a button is locked, including on iOS where disabled taps do nothing.
  const reason=!c.confirmed?'管理者の承認待ち':Number(c.remaining)<1?'残り回数がありません':pending?'前回のガチャを再開してください':!normalOpen&&!festOpen?'管理画面で受付停止中':!c.normal?.ready&&!c.fest?.ready?'景品が未設定':'';
  for(const id of ['drawNormal','drawFest']){$(id).setAttribute('aria-description',reason||'抽選できます');$(id).title=reason||'';}
  $('drawNormal').disabled=!!pending||!normalOpen||!c.confirmed||c.remaining<1||!c.normal.ready;
  $('drawFest').disabled=!!pending||!festOpen||!c.confirmed||c.remaining<1||!c.festUnlocked||!c.fest.ready;
  $('drawNormal').textContent=normalOpen?'メンシプガチャを引く':'メンシプガチャ（停止中）';
  $('drawFest').textContent=!festOpen?'ラキフェス（停止中）':c.festUnlocked?'ラキフェスを引く':`${start}回目から解放`;
  $('retryDraw').hidden=!pending;$('retryDraw').textContent='▶ 前回のガチャを再開する'
}
function statusText(c){if(c.gateConfigured===false)return '管理者のガチャ公開設定が接続されていません。運営に連絡してください。';const start=Number(c.festAvailableFrom)||5,next=Number(c.nextOrdinal)||1;if(!c.confirmed)return 'メンシプ購入の確認をお待ちください。';if(c.remaining<1)return 'ガチャ権利をすべて使用済みです。';if(!c.normalOpen&&!c.festOpen)return 'メンシプガチャ／ラキフェスは現在停止中です。';if(!c.normal.ready&&!c.fest.ready)return '景品設定中です。';if(!c.festEntitled)return c.normalOpen?`メンシプガチャを利用できます。総ガチャ権利${start}回以上でラキフェス対象になります。`:'メンシプガチャは現在停止中です。';if(!c.festUnlocked)return c.normalOpen?`ラキフェス対象です。あと${Math.max(0,start-next)}回メンシプガチャを引くと、${start}回目からラキフェスを選べます。`:'メンシプガチャは現在停止中です。';if(c.normalOpen&&c.festOpen)return `${start}回目以降です。メンシプガチャ／ラキフェスを選んで抽選できます。`;if(c.festOpen)return 'ラキフェスのみ受付中です。';return 'メンシプガチャのみ受付中です。'}
async function loadCatalog(includeHistory=true){
  if(busy)return false;
  busy=true;
  try{
    const c=await post('/api/gacha',{action:'catalog'});
    lastCatalog=c;participant=c.participantId;$('drawPanel').hidden=false;
    $('drawRemaining').textContent=`ガチャ残り ${c.remaining}回 ／ 使用済み ${c.used}回`;
    renderCatalog($('normalPrizes'),c.normal);renderCatalog($('festPrizes'),c.fest);
    setButtons(c);
    const pending=remember();
    note(pending?'前回のガチャが途中で止まっています。下の「前回のガチャを再開する」を押してね。':statusText(c));
    if(!includeHistory)return true;
    const h=await post('/api/gacha',{action:'history'});
    // A completed draw may have reached GAS even when its browser reply failed.
    // Only release the device-local pending lock after confirming the SAME
    // draw ID and mode in this authenticated user's committed history.
    if(pending&&h.participantId===participant&&Array.isArray(h.history)){
      const matching=h.history.filter(x=>x.drawId===pending.drawId&&x.mode===pending.mode&&
        typeof x.prize==='string'&&x.prize.trim()&&Number.isSafeInteger(Number(x.ordinal))&&Number(x.ordinal)>0);
      if(matching.length===1){
        forget();
        note('前回の当選結果を確認できました。当選履歴に保存済みです。通常のガチャに戻れます。');
      }
    }
    $('drawHistory').replaceChildren();
    if(!h.history?.length){
      const li=document.createElement('li');li.className='muted';li.textContent='まだ当選履歴はありません。';$('drawHistory').append(li)
    }else for(const x of h.history){
      const li=document.createElement('li');li.className=`history-item ${x.mode==='ラキフェス'?'fest-history':''}`;
      const image=safeImage(x.image);
      if(image){const img=document.createElement('img');img.src=image;img.alt='';img.loading='lazy';img.addEventListener('error',()=>img.remove(),{once:true});li.append(img)}
      const text=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('small');
      title.textContent=x.prize;sub.textContent=`${x.ordinal}回目 · ${x.mode}${x.rarity?' · '+x.rarity:''}${x.date?' · '+fmtDate(x.date):''}`;
      text.append(title,sub);li.append(text);$('drawHistory').append(li)
    }
    return true
  }catch(e){
    $('drawPanel').hidden=false;$('drawNormal').disabled=true;$('drawFest').disabled=true;note(e.message);return false
  }finally{busy=false;if(lastCatalog&&!confirming)setButtons(lastCatalog)}
}
async function execute(pending){
  if(isPreview){note('テスト版では実抽選できません。演出デモを利用してください。');return;}
  if(busy)return;
  busy=true;$('drawNormal').disabled=true;$('drawFest').disabled=true;$('retryDraw').disabled=true;$('crystal').classList.add('spinning');
  const started=performance.now(),fest=pending.mode==='ラキフェス',reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches,minMs=reduceMotion?800:5000;
  skipRequested=false;$('skipDraw').hidden=reduceMotion;$('skipDraw').disabled=reduceMotion;
  let refreshAfter=false;
  startEffect(pending.mode);
  note(reduceMotion?'演出を短縮しています。抽選結果を確認しています…':fest?'✨ ラキフェス開演…ステージが覚醒しています！':'💎 クリスタル共鳴中…抽選しています！');
  
  try{
    const d=await post('/api/gacha',{action:'draw',...pending});
    const wait=skipRequested?0:Math.max(0,minMs-(performance.now()-started));if(wait)await new Promise(resolve=>{const timer=setTimeout(()=>{skipWaitResolve=null;resolve()},wait);skipWaitResolve=()=>{clearTimeout(timer);skipWaitResolve=null;resolve()}});
    renderResult(d);forget();
    note(`${d.ordinal}回目の結果を保存しました。残り ${Math.max(0,Number(d.remaining??0))}回。`);
    refreshAfter=true
  }catch(e){
    clearEffects();window.dispatchEvent(new Event('mio:gacha-animation-error'));note(`${e.message}。管理画面の設定を再確認しています。`);$('retryDraw').hidden=false;refreshAfter=true
  }finally{
    clearAnimationTimers();$('crystal').classList.remove('spinning');$('gachaStage').classList.remove('draw-active','royal-charge','royal-release','royal-climax');busy=false;$('skipDraw').hidden=true;$('skipDraw').disabled=true;$('retryDraw').disabled=false;
    if(refreshAfter)await loadCatalog();else if(lastCatalog)setButtons(lastCatalog)
  }
}
// The old retry button re-sent action:'draw'. That can create a new draw if
// the first request never committed. Recover ONLY from existing signed history.
// A missing or old result stays pending; never spend another right implicitly.
async function recoverPrevious(p){
  if(isPreview||busy)return;
  if(!p||!/^[a-f0-9]{32}$/.test(p.drawId)||!['通常','ラキフェス'].includes(p.mode)){
    note('前回のガチャの記録を確認できませんでした。何度も押さず、運営に画面を見せてください。');
    return;
  }
  busy=true;$('drawNormal').disabled=true;$('drawFest').disabled=true;$('retryDraw').disabled=true;
  let recovered=false,resume=false;
  note('前回のガチャの結果を確認しています。');
  try{
    const history=await post('/api/gacha',{action:'history'});
    if(history.participantId!==participant||!Array.isArray(history.history))throw Error('当選履歴の本人確認に失敗しました');
    const rows=history.history.filter(x=>x.drawId===p.drawId);
    if(rows.length===0){
      // No committed result for this exact ID. Reusing this ID is idempotent on
      // the GAS backend (ScriptLock + drawId lookup before an append).
      // Require an explicit second confirmation before spending a right.
      const c=await post('/api/gacha',{action:'catalog'});
      if(c.participantId!==participant||c.confirmed!==true||
         !Number.isSafeInteger(Number(c.remaining))||Number(c.remaining)<1||
         !Number.isSafeInteger(Number(c.used))||Number(c.used)<0)
        throw Error('前回の抽選と残り回数を運営が確認中です');
      resume=window.confirm('前回のガチャの続きを再開します。\n\nすでに当選していれば、同じ結果を表示します。\nまだ当選が決まっていなければ、ガチャ券を1回使って抽選します。\n\n続けますか？');
      if(!resume)note('今回は再開せずに保留しました。続けるときは「前回のガチャを再開する」を押してね。');
    }else if(rows.length===1&&rows[0].mode===p.mode&&typeof rows[0].prize==='string'&&rows[0].prize.trim()&&
      Number.isSafeInteger(Number(rows[0].ordinal))&&Number(rows[0].ordinal)>=1){
      const x=rows[0];
      renderResult({participantId:participant,drawId:p.drawId,mode:p.mode,
        prize:x.prize,ordinal:Number(x.ordinal),rarity:String(x.rarity||''),
        image:String(x.image||''),replayed:true});
      forget();recovered=true;
      note('前回の当選結果を確認できたよ！景品を閉じると次のガチャに進めます。');
    }else{
      throw Error('前回の抽選履歴に不整合があります');
    }
  }catch(e){
    $('retryDraw').hidden=false;
    note((e?.message||'当選結果を確認できませんでした')+'。同じ抽選IDを保持しています。運営へご連絡ください。');
  }finally{
    busy=false;$('retryDraw').disabled=false;
    if(recovered)void loadCatalog();
    else if(resume)void execute(p);
    else if(lastCatalog)setButtons(lastCatalog);
  }
}
function confirmDraw(mode){
  let overlay=$('gachaConfirmOverlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='gachaConfirmOverlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.style.cssText='position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(1,8,24,.78);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)';
    const box=document.createElement('div');
    box.style.cssText='width:min(100%,390px);border-radius:24px;padding:24px 20px;background:linear-gradient(180deg,#0b2f68,#061936);border:1px solid rgba(145,212,255,.65);box-shadow:0 22px 60px rgba(0,0,0,.55);text-align:center;color:#fff';
    const title=document.createElement('h3');title.id='gachaConfirmTitle';title.style.cssText='margin:0 0 12px;font-size:23px';
    const body=document.createElement('p');body.id='gachaConfirmText';body.style.cssText='margin:0 0 20px;line-height:1.7;color:#d7ecff';
    const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:10px';
    const no=document.createElement('button');no.type='button';no.id='gachaConfirmNo';no.textContent='キャンセル';no.style.cssText='min-height:52px;border-radius:16px;border:1px solid rgba(255,255,255,.28);background:#0b244d;color:#fff;font-weight:800;font-size:16px';
    const yes=document.createElement('button');yes.type='button';yes.id='gachaConfirmYes';yes.textContent='1回引く';yes.style.cssText='min-height:52px;border-radius:16px;border:0;background:linear-gradient(135deg,#dffcff,#62d9ff);color:#06152e;font-weight:950;font-size:16px';
    row.append(no,yes);box.append(title,body,row);overlay.append(box);document.body.append(overlay);
  }
  $('gachaConfirmTitle').textContent=mode==='通常'?'💎 メンシプガチャ':'✨ ラキフェスガチャ';
  $('gachaConfirmText').textContent='ガチャ権利を1回消費して抽選します。よろしいですか？';
  const yes=$('gachaConfirmYes'),no=$('gachaConfirmNo');
  yes.style.background=mode==='ラキフェス'?'linear-gradient(135deg,#fff5bd,#e9b33b)':'linear-gradient(135deg,#dffcff,#62d9ff)';
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      overlay.style.display='none';
      document.removeEventListener('keydown',onKey);
      resolve(value);
    };
    const onKey=e=>{if(e.key==='Escape')finish(false)};
    yes.onclick=()=>finish(true);
    no.onclick=()=>finish(false);
    overlay.onclick=e=>{if(e.target===overlay)finish(false)};
    document.addEventListener('keydown',onKey);
    overlay.style.display='flex';
    setTimeout(()=>yes.focus(),0);
  });
}
async function start(mode){
  if(!$('drawResultCard').hidden){note('アイテムの「閉じる」を押してから次のガチャを引いてください。');return;}
  if(isPreview){note('テスト版では実抽選できません。演出デモを利用してください。');return;}
  if(busy){note('ガチャ情報を更新中です。完了後にもう一度押してください。');return;}
  if(confirming){note('抽選確認画面の操作を完了してください。');return;}
  if(!participant||!lastCatalog){note('参加情報を読み込み中です。再読み込みしてください。');return;}
  if(remember()){note('「前回のガチャを再開する」から続きを確認してください。');return;}
  $('drawNormal').disabled=true;$('drawFest').disabled=true;
  note('管理画面の受付と残り回数を確認しています…');
  // loadCatalog sets busy while fetching; avoid leaving buttons disabled after a failed refresh.
  if(!await loadCatalog(false)||!lastCatalog){if(lastCatalog)setButtons(lastCatalog);note('ガチャ設定を取得できませんでした。通信状態を確認して再試行してください。');return;}
  const c=lastCatalog;
  $('drawNormal').disabled=true;
  $('drawFest').disabled=true;
  const available=mode==='通常'
    ?c.normalOpen===true&&c.normal.ready&&c.confirmed&&c.remaining>0
    :c.festOpen===true&&c.festUnlocked&&c.fest.ready&&c.confirmed&&c.remaining>0;
  if(!available){note(statusText(c));setButtons(c);return}
  confirming=true;
  let approved=false;
  try{approved=await confirmDraw(mode)}finally{confirming=false}
  if(!approved){setButtons(c);note(statusText(c));return}
  const p={drawId:makeId(),mode};
  try{localStorage.setItem(pendingKey(),JSON.stringify(p))}catch{
    note('端末に抽選確認情報を保存できないため開始しません。');
    setButtons(c);
    return
  }
  void execute(p)
}

// Place recovery action directly below its explanation, above the long catalog.
const recoveryButton=$('retryDraw');
$('drawMessage').after(recoveryButton);
recoveryButton.style.width='100%';
recoveryButton.style.minHeight='58px';
recoveryButton.style.margin='12px 0 18px';
recoveryButton.style.padding='14px 12px';
recoveryButton.style.borderRadius='15px';
recoveryButton.style.fontSize='17px';
recoveryButton.style.fontWeight='800';
recoveryButton.style.background='#d5f2ff';
recoveryButton.style.color='#092044';

$('skipDraw').addEventListener('click',()=>{if(!busy)return;skipRequested=true;$('skipDraw').disabled=true;$('skipDraw').hidden=true;if(skipWaitResolve)skipWaitResolve();note('演出をスキップしました。確定した抽選結果を確認しています…')});
$('drawNormal').addEventListener('click',()=>void start('通常'));$('drawFest').addEventListener('click',()=>void start('ラキフェス'));$('retryDraw').addEventListener('click',()=>{const p=remember();if(p)void recoverPrevious(p)});$('reloadGacha').addEventListener('click',()=>void loadCatalog());
let lastBackgroundRefresh=0;
function refreshOpenState(){
  if(document.hidden||busy||confirming||!participant||!lastCatalog||remember())return;
  if(Date.now()-lastBackgroundRefresh<30000)return;
  lastBackgroundRefresh=Date.now();
  void loadCatalog(false);
}
window.setInterval(refreshOpenState,30000);
window.addEventListener('mio:gacha-prize-closed',()=>{if(lastCatalog&&!busy)setButtons(lastCatalog)});
window.addEventListener('focus',refreshOpenState);
document.addEventListener('visibilitychange',refreshOpenState);
window.addEventListener('pageshow',refreshOpenState);
async function boot(){if(isPreview){$('previewNotice').hidden=false;$('gachaUserMessage').textContent='プレビューでは実抽選・参加者情報・景品情報を読み込みません。';$('drawPanel').hidden=false;$('drawRemaining').textContent='プレビュー表示（抽選停止中）';$('drawNormal').disabled=true;$('drawFest').disabled=true;$('drawNormal').textContent='メンシプガチャ（プレビュー）';$('drawFest').textContent='ラキフェス（プレビュー）';$('drawMessage').textContent='筐体と画面レイアウトの確認用です。抽選はできません。';$('gachaCatalogModes').hidden=true;$('retryDraw').hidden=true;$('reloadGacha').hidden=true;$('gachaHistoryTitle').hidden=true;$('drawHistory').hidden=true;$('gachaHistoryNote').hidden=true;return;}try{const s=await post('/api/status');participant=s.participantId;$('gachaUser').hidden=false;$('gachaApproval').textContent=s.status||'';$('gachaName').textContent=(s.name||'')+' さん';$('gachaId').textContent='登録ID：'+s.participantId;if(s.status!=='承認済み'){throw Error('管理者の登録承認後にガチャを利用できます。')}$('gachaUserMessage').textContent='ガチャ情報を読み込んでいます…';const loaded=await loadCatalog();$('gachaUserMessage').textContent=loaded?'ガチャ情報を表示しました。':'ガチャ設定を取得できませんでした。下の「設定・当選履歴を更新」から再試行してください。'}catch(e){$('gachaUserMessage').textContent=e.status===401?'先に企画ページでColorSing名を登録してください。':e.message;$('gachaUserMessage').classList.add('error')}}
void boot();

