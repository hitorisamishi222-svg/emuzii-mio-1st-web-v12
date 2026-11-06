const $=id=>document.getElementById(id);
let participant='',busy=false,confirming=false,lastCatalog=null,lastResult=null,animationTimers=[],skipRequested=false,skipWaitResolve=null;
const pendingKey=()=>`mio_pending_draw_${participant||'unknown'}`;
const isPreview=location.hostname!=='emuzii-mio-1st-web-v12.vercel.app';
function parse(text){try{return text?JSON.parse(text):{}}catch{return {ok:false,error:'応答を確認できませんでした'}}}
// Retry only authenticated read requests. Never automatically retry a draw/spend.
async function post(path,body={}){
  const retryableRead=path==='/api/status'||(path==='/api/gacha'&&['catalog','history'].includes(body.action));
  for(let attempt=0;attempt<3;attempt++){
    const controller=typeof AbortController==='function'?new AbortController():null;
    // A lost reply must not hold the draw UI indefinitely. Aborting the browser
    // request does NOT cancel a possibly committed GAS draw: keep its drawId.
    const deadline=controller?setTimeout(()=>controller.abort(),retryableRead?15000:35000):null;
    try{
      const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(body),...(controller?{signal:controller.signal}:{})});
      const d=parse(await r.text());
      if(!r.ok){const e=Error(d.error||'通信に失敗しました');e.status=r.status;throw e}
      return d
    }catch(e){
      const transient=[408,429,500,502,503,504].includes(e.status)||
        (e.status===409&&/処理中|連携先に接続できません|連携処理を完了できませんでした|タイムアウト/.test(String(e.message||'')))||
        (e.status==null&&(e instanceof TypeError||e.name==='AbortError'));
      if(!retryableRead||!transient||attempt===2)throw e;
      await new Promise(resolve=>setTimeout(resolve,1800*(attempt+1)+Math.random()*2200));
    }finally{
      if(deadline!==null)clearTimeout(deadline);
    }
  }
}
function note(t){$('drawMessage').textContent=t||''}
function remember(){try{return JSON.parse(localStorage.getItem(pendingKey())||'null')}catch{return null}}
function forget(){try{localStorage.removeItem(pendingKey())}catch{}}
function safeImage(url){return typeof url==='string'&&/^https:\/\//i.test(url)?url:''}

// One pending ID is the only safe recovery token: a lost reply may have been committed.
const retryLabel='▶ もう一度ガチャを回す';
const connectionMessage='回線の状態が不安定です。抽選結果とガチャ券を確認して、もう一度ガチャを回してください。';
const returnedMessage='回線の状態が悪いため、再抽選いたします。尚、1回分のガチャ券は戻っています。下の「もう一度ガチャを回す」を押してください。';
function validPending(p){return !!p&&/^[a-f0-9]{32}$/.test(p.drawId||'')&&['通常','ラキフェス'].includes(p.mode)}
function validCount(v){return (typeof v==='number'||(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v)))&&Number.isSafeInteger(Number(v))&&Number(v)>=0}
function validHistoryWinner(x,p){return x&&x.drawId===p.drawId&&x.mode===p.mode&&typeof x.prize==='string'&&!!x.prize.trim()&&Number.isSafeInteger(Number(x.ordinal))&&Number(x.ordinal)>0}
function validDrawResponse(d,p){return !!d&&d.ok===true&&d.participantId===participant&&d.drawId===p.drawId&&d.mode===p.mode&&
 typeof d.prize==='string'&&!!d.prize.trim()&&Number.isSafeInteger(Number(d.ordinal))&&Number(d.ordinal)>0&&
 validCount(d.remaining)}
function noTicketSpent(c,p){return validPending(p)&&Number.isSafeInteger(p.beforeRemaining)&&Number.isSafeInteger(p.beforeUsed)&&
 c?.participantId===participant&&c.confirmed===true&&validCount(c.remaining)&&validCount(c.used)&&Number(c.remaining)===p.beforeRemaining&&Number(c.used)===p.beforeUsed}
function showRetry(){const retry=$('retryDraw');retry.hidden=false;retry.disabled=busy;retry.textContent=retryLabel;
 $('drawNormal').disabled=true;$('drawFest').disabled=true;$('reloadGacha').disabled=true}
function showRecoveredWinner(x,p){renderResult({participantId:participant,drawId:p.drawId,mode:p.mode,
 prize:x.prize,ordinal:Number(x.ordinal),rarity:String(x.rarity||''),image:String(x.image||''),replayed:true});
 forget();$('retryDraw').hidden=true;$('reloadGacha').disabled=false;note('前回の当選結果を表示しています。ガチャ券の二重消費はありません。')}

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
  const pending=remember(),resultVisible=!$('drawResultCard').hidden;
  if(resultVisible){
    $('drawNormal').disabled=true;$('drawFest').disabled=true;$('retryDraw').hidden=true;return;
  }
  if(pending){
    showRetry();
    if(!validPending(pending)){
      $('retryDraw').disabled=true;
      note('前回の抽選記録を確認しています。券を追加消費せず、安全に確認するためお待ちください。');
    }
    return
  }
  $('retryDraw').hidden=true;
  $('reloadGacha').disabled=false;
  if(busy||confirming){$('drawNormal').disabled=true;$('drawFest').disabled=true;return}
  const start=Number(c.festAvailableFrom)||5,normalOpen=c.normalOpen===true,festOpen=c.festOpen===true;
  const reason=!c.confirmed?'管理者の承認待ち':Number(c.remaining)<1?'残り回数がありません':!normalOpen&&!festOpen?'管理画面で受付停止中':!c.normal?.ready&&!c.fest?.ready?'景品が未設定':'';
  for(const id of ['drawNormal','drawFest']){$(id).setAttribute('aria-description',reason||'抽選できます');$(id).title=reason||'';}
  $('drawNormal').disabled=!normalOpen||!c.confirmed||c.remaining<1||!c.normal.ready;
  $('drawFest').disabled=!festOpen||!c.confirmed||c.remaining<1||!c.festUnlocked||!c.fest.ready;
  $('drawNormal').textContent=normalOpen?'メンシプガチャを引く':'メンシプガチャ（停止中）';
  $('drawFest').textContent=!festOpen?'ラキフェス（停止中）':c.festUnlocked?'ラキフェスを引く':`${start}回目から解放`;
}
function statusText(c){if(c.gateConfigured===false)return '管理者のガチャ公開設定が接続されていません。運営に連絡してください。';const start=Number(c.festAvailableFrom)||5,next=Number(c.nextOrdinal)||1;if(!c.confirmed)return 'メンシプ購入の確認をお待ちください。';if(c.remaining<1)return 'ガチャ権利をすべて使用済みです。';if(!c.normalOpen&&!c.festOpen)return 'メンシプガチャ／ラキフェスは現在停止中です。';if(!c.normal.ready&&!c.fest.ready)return '景品設定中です。';if(!c.festEntitled)return c.normalOpen?`メンシプガチャを利用できます。総ガチャ権利${start}回以上でラキフェス対象になります。`:'メンシプガチャは現在停止中です。';if(!c.festUnlocked)return c.normalOpen?`ラキフェス対象です。あと${Math.max(0,start-next)}回メンシプガチャを引くと、${start}回目からラキフェスを選べます。`:'メンシプガチャは現在停止中です。';if(c.normalOpen&&c.festOpen)return `${start}回目以降です。メンシプガチャ／ラキフェスを選んで抽選できます。`;if(c.festOpen)return 'ラキフェスのみ受付中です。';return 'メンシプガチャのみ受付中です。'}
async function loadCatalog(includeHistory=true){
  if(busy)return false;
  busy=true;
  let healthy=false;
  try{
    const c=await post('/api/gacha',{action:'catalog'});
    if(c.ok!==true||!c.participantId||!validCount(c.remaining)||!validCount(c.used)||
       (participant&&c.participantId!==participant)||typeof c.normal!=='object'||!c.normal||
       typeof c.fest!=='object'||!c.fest||!Array.isArray(c.normal.prizes)||!Array.isArray(c.fest.prizes))
      throw Error('catalog unavailable');
    lastCatalog=c;participant=c.participantId;$('drawPanel').hidden=false;
    $('drawRemaining').textContent=`ガチャ残り ${c.remaining}回 ／ 使用済み ${c.used}回`;
    renderCatalog($('normalPrizes'),c.normal);
    renderCatalog($('festPrizes'),c.fest);
    const pending=remember();
    if(!includeHistory){
      note(pending?connectionMessage:statusText(c));
      healthy=true;
      return true
    }
    const h=await post('/api/gacha',{action:'history'});
    if(h.ok!==true||h.participantId!==participant||!Array.isArray(h.history))throw Error('history unavailable');
    if(pending){
      if(!validPending(pending)){
        note('前回の抽選記録を確認しています。ガチャ券は勝手に消費しません。');
        showRetry();$('retryDraw').disabled=true;
      }else{
        const rows=h.history.filter(x=>x.drawId===pending.drawId);
        if(rows.length===1&&validHistoryWinner(rows[0],pending)){
          // Even when the response to draw was lost, the confirmed winner is visible.
          showRecoveredWinner(rows[0],pending);
        }else{
          showRetry();
          // "Returned" is shown only after BOTH authenticated history and
          // entitlement counters show that the previous draw has not spent a right.
          note(rows.length===0&&noTicketSpent(c,pending)?returnedMessage:connectionMessage);
        }
      }
    }else if($('drawResultCard').hidden){
      note(statusText(c));
    }
    $('drawHistory').replaceChildren();
    if(!h.history.length){
      const li=document.createElement('li');li.className='muted';
      li.textContent='まだ当選履歴はありません。';$('drawHistory').append(li);
    }else for(const x of h.history){
      const li=document.createElement('li');li.className=`history-item ${x.mode==='ラキフェス'?'fest-history':''}`;
      const image=safeImage(x.image);
      if(image){const img=document.createElement('img');img.src=image;img.alt='';img.loading='lazy';img.addEventListener('error',()=>img.remove(),{once:true});li.append(img)}
      const text=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('small');
      title.textContent=x.prize;sub.textContent=`${x.ordinal}回目 · ${x.mode}${x.rarity?' · '+x.rarity:''}${x.date?' · '+fmtDate(x.date):''}`;
      text.append(title,sub);li.append(text);$('drawHistory').append(li);
    }
    healthy=true;
    return true
  }catch(e){
    $('drawPanel').hidden=false;
    $('drawNormal').disabled=true;$('drawFest').disabled=true;
    if(remember()){
      showRetry();
      if(!validPending(remember()))$('retryDraw').disabled=true;
      note(connectionMessage);
    }else if(!$('drawResultCard').hidden){
      note('当選結果は表示済みです。景品を閉じた後に残回数を更新してください。');
    }else note('通信が不安定です。回線がつながったら「設定・当選履歴を更新」を押してください。');
    return false
  }finally{
    busy=false;
    if(healthy&&lastCatalog&&!confirming)setButtons(lastCatalog);
    else{
      $('drawNormal').disabled=true;$('drawFest').disabled=true;
      if(remember()){
        $('retryDraw').hidden=false;
        $('retryDraw').disabled=!validPending(remember());
        $('retryDraw').textContent=retryLabel;
      }
    }
  }
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
    const d=await post('/api/gacha',{action:'draw',drawId:pending.drawId,mode:pending.mode});
    if(!validDrawResponse(d,pending))throw Error('draw receipt incomplete');
    const wait=skipRequested?0:Math.max(0,minMs-(performance.now()-started));if(wait)await new Promise(resolve=>{const timer=setTimeout(()=>{skipWaitResolve=null;resolve()},wait);skipWaitResolve=()=>{clearTimeout(timer);skipWaitResolve=null;resolve()}});
    renderResult(d);forget();$('retryDraw').hidden=true;$('reloadGacha').disabled=false;
    $('drawRemaining').textContent=`ガチャ残り ${d.remaining}回（確定）`;
    note(`${d.ordinal}回目の当選結果を表示しています。残り ${d.remaining}回。`);
    refreshAfter=false
  }catch(e){
    clearEffects();window.dispatchEvent(new Event('mio:gacha-animation-error'));note(connectionMessage);showRetry();refreshAfter=true
  }finally{
    clearAnimationTimers();$('crystal').classList.remove('spinning');$('gachaStage').classList.remove('draw-active','royal-charge','royal-release','royal-climax');busy=false;$('skipDraw').hidden=true;$('skipDraw').disabled=true;$('retryDraw').disabled=false;
    if(refreshAfter)await loadCatalog();else if(lastCatalog)setButtons(lastCatalog)
  }
}
// The previous response may be lost after GAS committed a prize. First check
// authenticated history; only on an EXPLICIT retry tap may we resend the SAME
// drawId. GAS ScriptLock and drawId lookup prevent a second committed draw.
async function recoverPrevious(p){
  if(isPreview||busy)return;
  if(!validPending(p)){
    $('drawNormal').disabled=true;$('drawFest').disabled=true;
    $('retryDraw').hidden=false;$('retryDraw').disabled=true;
    note('前回の抽選記録を確認できません。ガチャ券は減らさず、記録の確認が必要です。');
    return;
  }
  busy=true;$('drawNormal').disabled=true;$('drawFest').disabled=true;$('retryDraw').disabled=true;
  let found=false,retrySameId=false;
  note('前回の当選結果とガチャ券を確認しています…');
  try{
    const h=await post('/api/gacha',{action:'history'});
    if(h.ok!==true||h.participantId!==participant||!Array.isArray(h.history))throw Error('history unavailable');
    const rows=h.history.filter(x=>x.drawId===p.drawId);
    if(rows.length===1&&validHistoryWinner(rows[0],p)){
      showRecoveredWinner(rows[0],p);found=true;
    }else if(rows.length===0){
      const c=await post('/api/gacha',{action:'catalog'});
      if(c.ok!==true||c.participantId!==participant||c.confirmed!==true||
         !validCount(c.remaining)||Number(c.remaining)<1||
         !validCount(c.used))
        throw Error('entitlement not confirmed');
      // The same drawId is replayed only on this explicit user tap. If the
      // earlier response was lost after commit, GAS returns its original winner.
      retrySameId=true;
    }else{
      note('前回の当選履歴を確認中です。ガチャ券を二重に使わず、もう一度確認できます。');
      showRetry();
    }
  }catch(e){
    note(connectionMessage);
    showRetry();
  }finally{
    busy=false;
    if(found){$('retryDraw').hidden=true;$('reloadGacha').disabled=false;
      $('drawRemaining').textContent='前回の当選結果を確認しました。景品を閉じると残回数を更新します。';}
    else if(retrySameId){void execute(p);}
    else{if(lastCatalog)setButtons(lastCatalog);if(validPending(remember()))$('retryDraw').disabled=false;}
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
  const p={drawId:makeId(),mode,beforeRemaining:Number(c.remaining),beforeUsed:Number(c.used)};
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
window.addEventListener('mio:gacha-prize-closed',()=>{if(!busy){$('drawNormal').disabled=true;$('drawFest').disabled=true;void loadCatalog()}});
window.addEventListener('focus',refreshOpenState);
document.addEventListener('visibilitychange',refreshOpenState);
window.addEventListener('pageshow',refreshOpenState);
async function boot(){if(isPreview){$('previewNotice').hidden=false;$('gachaUserMessage').textContent='プレビューでは実抽選・参加者情報・景品情報を読み込みません。';$('drawPanel').hidden=false;$('drawRemaining').textContent='プレビュー表示（抽選停止中）';$('drawNormal').disabled=true;$('drawFest').disabled=true;$('drawNormal').textContent='メンシプガチャ（プレビュー）';$('drawFest').textContent='ラキフェス（プレビュー）';$('drawMessage').textContent='筐体と画面レイアウトの確認用です。抽選はできません。';$('gachaCatalogModes').hidden=true;$('retryDraw').hidden=true;$('reloadGacha').hidden=true;$('gachaHistoryTitle').hidden=true;$('drawHistory').hidden=true;$('gachaHistoryNote').hidden=true;return;}try{const s=await post('/api/status');participant=s.participantId;$('gachaUser').hidden=false;$('gachaApproval').textContent=s.status||'';$('gachaName').textContent=(s.name||'')+' さん';$('gachaId').textContent='登録ID：'+s.participantId;if(s.status!=='承認済み'){throw Error('管理者の登録承認後にガチャを利用できます。')}$('gachaUserMessage').textContent='ガチャ情報を読み込んでいます…';const loaded=await loadCatalog();$('gachaUserMessage').textContent=loaded?'ガチャ情報を表示しました。':validPending(remember())?'回線が不安定です。前回の抽選IDは保護しています。下の「もう一度ガチャを回す」で再開できます。':remember()?'前回の抽選記録を安全に確認しています。新しいガチャ券は消費しません。':'回線が不安定です。下の「設定・当選履歴を更新」から再試行してください。'}catch(e){$('gachaUserMessage').textContent=e.status===401?'このブラウザには登録時の認証情報がありません。LINE・Xから開いている場合は、メニューの「ブラウザで開く」から登録時のSafari・Chromeなどで開き直してください。再登録は不要です。':e.message;$('gachaUserMessage').classList.add('error')}}
void boot();

