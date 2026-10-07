const $=id=>document.getElementById(id);
let participant='',busy=false,confirming=false,lastCatalog=null,lastResult=null;
const pendingKey=()=>`mio_pending_draw_${participant||'unknown'}`;
function parse(text){try{return text?JSON.parse(text):{}}catch{return {ok:false,error:'応答を確認できませんでした'}}}
async function post(path,body={}){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)});const d=parse(await r.text());if(!r.ok){const e=Error(d.error||'通信に失敗しました');e.status=r.status;throw e}return d}
function note(t){$('drawMessage').textContent=t||''}
function remember(){try{return JSON.parse(localStorage.getItem(pendingKey())||'null')}catch{return null}}
function forget(){try{localStorage.removeItem(pendingKey())}catch{}}
function safeImage(url){return typeof url==='string'&&/^https:\/\//i.test(url)?url:''}
function rarityKey(v){const r=String(v||'').toUpperCase();return r.includes('UR')?'ur':r.includes('SR')?'sr':r==='R'||r.includes('レア')?'r':'n'}
function clearEffects(){const stage=$('gachaStage');stage?.classList.remove('draw-active','reveal','rarity-n','rarity-r','rarity-sr','rarity-ur');document.querySelectorAll('.gacha-particle,.gacha-flash,.gacha-ring').forEach(x=>x.remove())}
function particles(count,kind){const stage=$('gachaStage');if(!stage)return;for(let i=0;i<count;i++){const x=document.createElement('i');x.className=`gacha-particle ${kind}`;x.style.setProperty('--x',`${Math.random()*100}%`);x.style.setProperty('--dx',`${(Math.random()-.5)*260}px`);x.style.setProperty('--delay',`${Math.random()*.35}s`);x.style.setProperty('--dur',`${1.05+Math.random()*1.25}s`);x.textContent=Math.random()>.46?'✦':Math.random()>.5?'◆':'★';stage.append(x);setTimeout(()=>x.remove(),3000)}}
function revealEffect(rarity,mode){clearEffects();const stage=$('gachaStage'),key=rarityKey(rarity);stage?.classList.add('reveal',`rarity-${key}`,mode==='ラキフェス'?'is-fest':'is-normal');const flash=document.createElement('i');flash.className='gacha-flash';stage?.append(flash);const ring=document.createElement('i');ring.className='gacha-ring';stage?.append(ring);particles({n:26,r:42,sr:72,ur:110}[key]||30,key);setTimeout(()=>{flash.remove();ring.remove();stage?.classList.remove('reveal')},1900)}
function startEffect(mode){
  clearEffects();
  const stage=$('gachaStage');stage?.classList.add('draw-active');stage?.classList.toggle('is-fest',mode==='ラキフェス');
  particles(mode==='ラキフェス'?70:46,mode==='ラキフェス'?'sr':'n');
  setTimeout(()=>particles(mode==='ラキフェス'?60:34,mode==='ラキフェス'?'ur':'r'),700);
  setTimeout(()=>particles(mode==='ラキフェス'?80:42,mode==='ラキフェス'?'sr':'n'),1350);
}
function makeId(){return crypto.randomUUID?crypto.randomUUID().replaceAll('-',''):Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')}
function fmtDate(v){if(!v)return'';try{const d=new Date(v);if(!Number.isNaN(d.getTime()))return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}catch{}return String(v)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function renderCatalog(target,c){target.replaceChildren();const p=document.createElement('p');p.className='catalog-status';p.textContent=c.message;target.append(p);for(const x of c.prizes||[]){const row=document.createElement('div');row.className='prize';const image=safeImage(x.image);if(image){const img=document.createElement('img');img.src=image;img.alt=x.name||'';img.loading='lazy';img.addEventListener('error',()=>img.remove(),{once:true});row.append(img)}const meta=document.createElement('div');const n=document.createElement('strong');n.textContent=x.name;const s=document.createElement('span');s.textContent=`${x.rarity?x.rarity+' · ':''}${x.chance}%`;meta.append(n,s);row.append(meta);target.append(row)}}
function renderResult(d){lastResult=d;const stage=$('gachaStage'),card=$('drawResultCard'),img=$('drawResultImage');stage.classList.toggle('is-fest',d.mode==='ラキフェス');revealEffect(d.rarity,d.mode);card.hidden=false;card.classList.remove('result-pop');void card.offsetWidth;card.classList.add('result-pop');$('drawRarity').textContent=d.rarity||'';$('drawPrizeName').textContent=d.prize||'当選';$('drawOrdinal').textContent=`${d.ordinal}回目${d.replayed?'（確認済み結果）':''}`;const image=safeImage(d.image);if(image){img.src=image;img.alt=d.prize||'当選景品';img.hidden=false;img.onerror=()=>{img.hidden=true}}else{img.hidden=true;img.removeAttribute('src')}card.scrollIntoView({behavior:'smooth',block:'center'})}
function setButtons(c){
  const pending=remember(),start=Number(c.festAvailableFrom)||5,normalOpen=c.normalOpen===true,festOpen=c.festOpen===true;
  $('drawNormal').disabled=!!pending||!normalOpen||!c.confirmed||c.remaining<1||!c.normal.ready;
  $('drawFest').disabled=!!pending||!festOpen||!c.confirmed||c.remaining<1||!c.festUnlocked||!c.fest.ready;
  $('drawNormal').textContent=normalOpen?'メンシプガチャを引く':'メンシプガチャ（停止中）';
  $('drawFest').textContent=!festOpen?'ラキフェス（停止中）':c.festUnlocked?'ラキフェスを引く':`${start}回目から解放`;
  $('retryDraw').hidden=!pending
}
function statusText(c){const start=Number(c.festAvailableFrom)||5,next=Number(c.nextOrdinal)||1;if(!c.confirmed)return 'メンシプ購入の確認をお待ちください。';if(c.remaining<1)return 'ガチャ権利をすべて使用済みです。';if(!c.normalOpen&&!c.festOpen)return 'メンシプガチャ／ラキフェスは現在停止中です。';if(!c.normal.ready&&!c.fest.ready)return '景品設定中です。';if(!c.festEntitled)return c.normalOpen?`メンシプガチャを利用できます。総ガチャ権利${start}回以上でラキフェス対象になります。`:'メンシプガチャは現在停止中です。';if(!c.festUnlocked)return c.normalOpen?`ラキフェス対象です。あと${Math.max(0,start-next)}回メンシプガチャを引くと、${start}回目からラキフェスを選べます。`:'メンシプガチャは現在停止中です。';if(c.normalOpen&&c.festOpen)return `${start}回目以降です。メンシプガチャ／ラキフェスを選んで抽選できます。`;if(c.festOpen)return 'ラキフェスのみ受付中です。';return 'メンシプガチャのみ受付中です。'}
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
    note(pending?'前回の抽選結果が未確認です。「前回の抽選結果を確認」を押してください。':statusText(c));
    if(!includeHistory)return true;
    const h=await post('/api/gacha',{action:'history'});
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
  }finally{busy=false}
}
async function execute(pending){
  if(busy)return;
  busy=true;$('drawNormal').disabled=true;$('drawFest').disabled=true;$('retryDraw').disabled=true;$('crystal').classList.add('spinning');
  const started=performance.now(),fest=pending.mode==='ラキフェス',baseMinMs=fest?2800:1800;
  let refreshAfter=false;
  startEffect(pending.mode);
  window.dispatchEvent(new CustomEvent('mio:gacha-animation-start',{detail:{mode:pending.mode}}));
  note(fest?'✨ ラキフェス開演…ステージが覚醒しています！':'💎 クリスタル共鳴中…抽選しています！');
  const mid=setTimeout(()=>note(fest?'🌟 光が最高潮に…秘蔵ガチャ結果を解放！':'✨ レアリティ判定中…！'),fest?1350:900);
  try{
    const d=await post('/api/gacha',{action:'draw',...pending});
    const key=rarityKey(d.rarity),readyAt=performance.now();
    const minMs=key==='ur'?(fest?5200:4400):key==='sr'?(fest?3800:3000):key==='r'?(fest?3200:2350):baseMinMs;
    const postReadyMs=key==='ur'?3050:key==='sr'?2300:key==='r'?1850:1650;
    window.dispatchEvent(new CustomEvent('mio:gacha-result-ready',{detail:{mode:d.mode||pending.mode,rarity:d.rarity||'',ordinal:d.ordinal||0,remaining:d.remaining}}));
    const totalWait=Math.max(0,minMs-(performance.now()-started));
    const afterReadyWait=Math.max(0,postReadyMs-(performance.now()-readyAt));
    const wait=Math.max(totalWait,afterReadyWait);if(wait)await sleep(wait);
    clearTimeout(mid);renderResult(d);forget();
    window.dispatchEvent(new CustomEvent('mio:gacha-result-shown',{detail:{mode:d.mode||pending.mode,rarity:d.rarity||'',ordinal:d.ordinal||0}}));
    note(`${d.ordinal}回目の結果を保存しました。残り ${Math.max(0,Number(d.remaining??0))}回。`);
    refreshAfter=true
  }catch(e){
    window.dispatchEvent(new CustomEvent('mio:gacha-animation-error'));
    clearTimeout(mid);clearEffects();note(`${e.message}。管理画面の設定を再確認しています。`);$('retryDraw').hidden=false;refreshAfter=true
  }finally{
    $('crystal').classList.remove('spinning');$('gachaStage').classList.remove('draw-active');busy=false;$('retryDraw').disabled=false;
    if(refreshAfter)await loadCatalog();else if(lastCatalog)setButtons(lastCatalog)
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
  if(!participant||busy||confirming||remember()||!lastCatalog)return;
  $('drawNormal').disabled=true;$('drawFest').disabled=true;
  note('管理画面の受付と残り回数を確認しています…');
  if(!await loadCatalog(false)||!lastCatalog)return;
  const c=lastCatalog;
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
$('drawNormal').addEventListener('click',()=>void start('通常'));$('drawFest').addEventListener('click',()=>void start('ラキフェス'));$('retryDraw').addEventListener('click',()=>{const p=remember();if(p)void execute(p)});$('reloadGacha').addEventListener('click',()=>void loadCatalog());
function refreshOpenState(){if(!document.hidden&&!busy&&!confirming)void loadCatalog()}
window.setInterval(refreshOpenState,30000);
window.addEventListener('focus',refreshOpenState);
document.addEventListener('visibilitychange',refreshOpenState);
window.addEventListener('pageshow',refreshOpenState);
async function boot(){try{const s=await post('/api/status');participant=s.participantId;$('gachaUser').hidden=false;$('gachaApproval').textContent=s.status||'';$('gachaName').textContent=(s.name||'')+' さん';$('gachaId').textContent='登録ID：'+s.participantId;if(s.status!=='承認済み'){throw Error('管理者の登録承認後にガチャを利用できます。')}$('gachaUserMessage').textContent='ガチャ情報を読み込んでいます…';await loadCatalog();$('gachaUserMessage').textContent='ガチャ情報を表示しました。'}catch(e){$('gachaUserMessage').textContent=e.status===401?'先に企画ページでColorSing名を登録してください。':e.message;$('gachaUserMessage').classList.add('error')}}
void boot();
