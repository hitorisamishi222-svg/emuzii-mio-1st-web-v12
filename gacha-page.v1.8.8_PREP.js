const $=id=>document.getElementById(id);
let participant='',busy=false,lastCatalog=null,lastResult=null;
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
async function loadCatalog(){if(busy)return;busy=true;try{const c=await post('/api/gacha',{action:'catalog'});lastCatalog=c;participant=c.participantId;$('drawPanel').hidden=false;$('drawRemaining').textContent=`ガチャ残り ${c.remaining}回 ／ 使用済み ${c.used}回`;renderCatalog($('normalPrizes'),c.normal);renderCatalog($('festPrizes'),c.fest);setButtons(c);const pending=remember();note(pending?'前回の抽選結果が未確認です。「前回の抽選結果を確認」を押してください。':statusText(c));const h=await post('/api/gacha',{action:'history'});$('drawHistory').replaceChildren();if(!h.history?.length){const li=document.createElement('li');li.className='muted';li.textContent='まだ当選履歴はありません。';$('drawHistory').append(li)}else for(const x of h.history){const li=document.createElement('li');li.className=`history-item ${x.mode==='ラキフェス'?'fest-history':''}`;const image=safeImage(x.image);if(image){const img=document.createElement('img');img.src=image;img.alt='';img.loading='lazy';img.addEventListener('error',()=>img.remove(),{once:true});li.append(img)}const text=document.createElement('span');const title=document.createElement('strong');title.textContent=x.prize;const sub=document.createElement('small');sub.textContent=`${x.ordinal}回目 · ${x.mode}${x.rarity?' · '+x.rarity:''}${x.date?' · '+fmtDate(x.date):''}`;text.append(title,sub);li.append(text);$('drawHistory').append(li)}}catch(e){$('drawPanel').hidden=false;$('drawNormal').disabled=true;$('drawFest').disabled=true;note(e.message)}finally{busy=false}}
async function execute(pending){
  if(busy)return;
  busy=true;$('drawNormal').disabled=true;$('drawFest').disabled=true;$('retryDraw').disabled=true;$('crystal').classList.add('spinning');
  const started=performance.now(),fest=pending.mode==='ラキフェス',minMs=fest?2800:1800;
  startEffect(pending.mode);
  note(fest?'✨ ラキフェス開演…ステージが覚醒しています！':'💎 クリスタル共鳴中…抽選しています！');
  const mid=setTimeout(()=>note(fest?'🌟 光が最高潮に…秘蔵ガチャ結果を解放！':'✨ レアリティ判定中…！'),fest?1350:900);
  try{
    const d=await post('/api/gacha',{action:'draw',...pending});
    const wait=Math.max(0,minMs-(performance.now()-started));if(wait)await sleep(wait);
    clearTimeout(mid);renderResult(d);forget();
    note(`${d.ordinal}回目の結果を保存しました。残り ${Math.max(0,Number(d.remaining??0))}回。`);
    await sleep(650);await loadCatalog()
  }catch(e){
    clearTimeout(mid);clearEffects();note(`${e.message}。「前回の抽選結果を確認」から同じ抽選を確認できます。`);$('retryDraw').hidden=false
  }finally{
    $('crystal').classList.remove('spinning');$('gachaStage').classList.remove('draw-active');busy=false;$('retryDraw').disabled=false;if(lastCatalog)setButtons(lastCatalog)
  }
}
function start(mode){if(!participant||busy||remember()||!lastCatalog)return;const ok=mode==='通常'?lastCatalog.normalOpen&&lastCatalog.normal.ready:lastCatalog.festOpen&&lastCatalog.festUnlocked&&lastCatalog.fest.ready;if(!ok)return;if(!confirm(`${mode==='通常'?'メンシプ':'ラキフェス'}ガチャを1回引きます。ガチャ権利を1回消費します。よろしいですか？`))return;const p={drawId:makeId(),mode};try{localStorage.setItem(pendingKey(),JSON.stringify(p))}catch{note('端末に抽選確認情報を保存できないため開始しません。');return}void execute(p)}
$('drawNormal').addEventListener('click',()=>start('通常'));$('drawFest').addEventListener('click',()=>start('ラキフェス'));$('retryDraw').addEventListener('click',()=>{const p=remember();if(p)void execute(p)});$('reloadGacha').addEventListener('click',()=>void loadCatalog());
async function boot(){try{const s=await post('/api/status');participant=s.participantId;$('gachaUser').hidden=false;$('gachaApproval').textContent=s.status||'';$('gachaName').textContent=(s.name||'')+' さん';$('gachaId').textContent='登録ID：'+s.participantId;if(s.status!=='承認済み'){throw Error('管理者の登録承認後にガチャを利用できます。')}$('gachaUserMessage').textContent='ガチャ情報を読み込んでいます…';await loadCatalog();$('gachaUserMessage').textContent='ガチャ情報を表示しました。'}catch(e){$('gachaUserMessage').textContent=e.status===401?'先に企画ページでColorSing名を登録してください。':e.message;$('gachaUserMessage').classList.add('error')}}
void boot();
