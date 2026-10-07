const HOME_API='/api/home-info';
const HOME_CACHE_KEY='mioHomeUpdatesV1';
const home$=id=>document.getElementById(id);
let homeRefreshTimer=0;
function homeReadCache(){try{const d=JSON.parse(localStorage.getItem(HOME_CACHE_KEY)||'null');return d&&Date.now()-Number(d.at||0)<86400000?d:null}catch{return null}}
function homeWriteCache(d){try{localStorage.setItem(HOME_CACHE_KEY,JSON.stringify({at:Date.now(),notices:d.notices||[],schedules:d.schedules||[]}))}catch{}}

function homeEsc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function homeSafeUrl(v=''){try{const u=new URL(String(v),location.origin);return u.protocol==='https:'?u.href:''}catch{return''}}
function homeDate(v){if(!v)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d:null}
function homeFmtDate(v){const d=homeDate(v);if(!d)return'';return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(d)}
function homeFmtTime(v){const d=homeDate(v);if(!d)return'';return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}
function homeIsNew(n){const d=homeDate(n.publishedAt||n.startAt);return d&&Date.now()-d.getTime()<72*60*60*1000&&Date.now()>=d.getTime()}

function renderHomeNews(items=[]){
  const root=home$('homeNewsList');if(!root)return;
  if(!items.length){root.innerHTML='<p class="home-empty">現在のお知らせはありません。</p>';return}
  root.innerHTML=items.slice(0,5).map(n=>{
    const kind=n.level==='緊急'?'emergency':n.level==='重要'?'important':'normal';
    const link=homeSafeUrl(n.url);
    return `<article class="home-news-item ${kind}">
      <div class="home-news-top"><span class="home-badge ${kind}">${kind==='emergency'?'緊急':kind==='important'?'重要':'NEWS'}</span>${homeIsNew(n)?'<span class="home-badge new">NEW</span>':''}</div>
      <h4>${homeEsc(n.title||'お知らせ')}</h4><p>${homeEsc(n.body||'')}</p>
      ${link?`<a class="home-news-link" href="${homeEsc(link)}" target="_blank" rel="noopener noreferrer">詳細を見る ↗</a>`:''}
    </article>`
  }).join('');
}

function renderHomeSchedules(items=[]){
  const root=home$('homeScheduleList');if(!root)return;
  if(!items.length){root.innerHTML='<p class="home-empty">現在登録されている配信予定はありません。</p>';return}
  const now=Date.now();
  root.innerHTML=items.slice(0,5).map((s,i)=>{
    const start=homeDate(s.startAt),end=homeDate(s.endAt);
    const live=start&&start.getTime()<=now&&(!end||end.getTime()>now);
    const next=!live&&i===0;
    const cls=live?'is-live':next?'is-next':'';
    const state=live?'<span class="home-live-pulse"></span>LIVE':next?'NEXT LIVE':'SCHEDULE';
    const link=homeSafeUrl(s.url);
    const time=[homeFmtTime(s.startAt),homeFmtTime(s.endAt)].filter(Boolean).join(' — ');
    return `<article class="home-live-card ${cls}">
      <div class="home-live-row"><span class="home-live-state">${state}</span><span class="home-live-date">${homeEsc(homeFmtDate(s.startAt))}</span></div>
      <h4>${homeEsc(s.title||'配信予定')}</h4><p>${homeEsc(s.body||'')}</p>
      ${time?`<span class="home-live-time">${homeEsc(time)}</span>`:''}
      ${link?`<a class="home-live-link" href="${homeEsc(link)}" target="_blank" rel="noopener noreferrer">${live?'配信を見に行く':'配信ページへ'} ↗</a>`:''}
    </article>`
  }).join('');
}

async function loadHomeUpdates(){
  const status=home$('homeUpdatesStatus');
  try{
    const demo=window.__MIO_HOME_DEMO__;
    let d=demo;
    if(!d){
      const r=await fetch(HOME_API,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:'{}',credentials:'same-origin',cache:'no-store'});
      d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'取得できませんでした');
    }
    renderHomeNews(Array.isArray(d.notices)?d.notices:[]);
    renderHomeSchedules(Array.isArray(d.schedules)?d.schedules:[]);
    if(!demo)homeWriteCache(d);
    if(status)status.textContent=demo?'表示デモ':'最新情報';
  }catch{
    const cached=homeReadCache();
    if(cached){
      renderHomeNews(cached.notices||[]);renderHomeSchedules(cached.schedules||[]);
      if(status)status.textContent='前回取得した情報';
    }else{
      if(home$('homeNewsList'))home$('homeNewsList').innerHTML='<p class="home-empty">お知らせを読み込めませんでした。</p>';
      if(home$('homeScheduleList'))home$('homeScheduleList').innerHTML='<p class="home-empty">配信予定を読み込めませんでした。</p>';
      if(status)status.textContent='再読み込みしてください';
    }
  }
}
function scheduleHomeRefresh(){clearInterval(homeRefreshTimer);homeRefreshTimer=setInterval(()=>{if(!document.hidden)void loadHomeUpdates()},60000)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void loadHomeUpdates()});
void loadHomeUpdates();scheduleHomeRefresh();
