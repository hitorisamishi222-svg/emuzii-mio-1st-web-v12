// No production data connection in replica preview.
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
function homeStatusTime(v){const d=homeDate(v);return d?'最終確認 '+homeFmtTime(d):'最新情報'}
function homeIsNew(n){const d=homeDate(n.publishedAt||n.startAt);return d&&Date.now()-d.getTime()<72*60*60*1000&&Date.now()>=d.getTime()}

function renderHomeNews(items=[]){
  const root=home$('homeNewsList');if(!root)return;
  const now=Date.now();
  items=items.filter(n=>{
    const start=homeDate(n.publishedAt),end=homeDate(n.expiresAt);
    return (!start||start.getTime()<=now)&&(!end||end.getTime()>=now);
  });
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
  const now=Date.now();
  items=items.filter(s=>{const end=homeDate(s.endAt);return !end||end.getTime()>now});
  if(!items.length){root.innerHTML='<p class="home-empty">現在登録されている配信予定はありません。</p>';return}
  items=items.slice(0,5);
  const nextIndex=items.findIndex(s=>{const start=homeDate(s.startAt);return start&&start.getTime()>now});
  root.innerHTML=items.map((s,i)=>{
    const start=homeDate(s.startAt),end=homeDate(s.endAt);
    const live=start&&start.getTime()<=now&&(!end||end.getTime()>now);
    const next=!live&&i===nextIndex;
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

function renderHomeSummary(notices=[],schedules=[]){
  const now=Date.now();

  notices=notices.filter(n=>{
    const start=homeDate(n.publishedAt),end=homeDate(n.expiresAt);
    return (!start||start.getTime()<=now)&&(!end||end.getTime()>=now);
  });

  schedules=schedules.filter(s=>{
    const start=homeDate(s.startAt),end=homeDate(s.endAt);
    return start&&(!end||end.getTime()>now);
  });

  const live=schedules.find(s=>{
    const start=homeDate(s.startAt),end=homeDate(s.endAt);
    return start&&start.getTime()<=now&&(!end||end.getTime()>now);
  });

  const next=schedules.find(s=>{
    const start=homeDate(s.startAt);
    return start&&start.getTime()>now;
  });

  const liveWrap=home$('homeLiveBanner');
  if(liveWrap){
    if(!live){
      liveWrap.hidden=true;
      liveWrap.innerHTML='';
    }else{
      const link=homeSafeUrl(live.url);
      liveWrap.hidden=false;
      liveWrap.innerHTML=`<article class="home-top-live">
        <div class="home-top-live-head"><span class="home-live-pulse"></span><strong>LIVE 配信中</strong><span>${homeEsc(homeFmtTime(live.startAt))}〜</span></div>
        <h3>${homeEsc(live.title||'配信中')}</h3>
        ${live.body?`<p>${homeEsc(live.body)}</p>`:''}
        ${link?`<a class="home-top-live-button" href="${homeEsc(link)}" target="_blank" rel="noopener noreferrer">配信を見る →</a>`:''}
      </article>`;
    }
  }

  const news=home$('homeNewsSummary');
  if(news){
    const n=notices[0];
    news.innerHTML=n
      ? `<span class="home-summary-kicker">${n.level==='緊急'?'緊急':n.level==='重要'?'重要':'最新'}</span><strong>${homeEsc(n.title||'お知らせ')}</strong><small>${homeIsNew(n)?'NEW · ':''}お知らせを見る →</small>`
      : '<span class="home-summary-kicker">NEWS</span><strong>現在、新しいお知らせはありません</strong><small>お知らせ一覧を見る →</small>';
  }

  const sched=home$('homeScheduleSummary');
  if(sched){
    const s=next||live;
    const label=next?'NEXT LIVE':live?'配信中':'SCHEDULE';
    sched.innerHTML=s
      ? `<span class="home-summary-kicker">${label}</span><strong>${homeEsc(s.title||'配信予定')}</strong><small>${homeEsc(homeFmtDate(s.startAt))} ${homeEsc(homeFmtTime(s.startAt))}〜 · 予定を見る →</small>`
      : '<span class="home-summary-kicker">SCHEDULE</span><strong>現在、登録されている配信予定はありません</strong><small>配信予定を見る →</small>';
  }
}

async function loadHomeUpdates(){
  const status=home$('homeUpdatesStatus');
  try{
    // NEXT TEST ONLY: deliberately never call a live API, even if this page lacks demo seed.
    const demo=window.__MIO_HOME_DEMO__||{ok:true,serverTime:new Date().toISOString(),
      notices:[{id:'next-demo',level:'通常',title:'次期版のお知らせ（架空）',body:'これは表示テストです。実際のお知らせではありません。',publishedAt:new Date().toISOString()}],
      schedules:[]};
    const d=demo;
    const notices=Array.isArray(d.notices)?d.notices:[];
    const schedules=Array.isArray(d.schedules)?d.schedules:[];
    renderHomeNews(notices);
    renderHomeSchedules(schedules);
    renderHomeSummary(notices,schedules);
    if(!demo)homeWriteCache(d);
    if(status)status.textContent=demo?'表示デモ':homeStatusTime(d.serverTime||new Date());
  }catch{
    const cached=homeReadCache();
    if(cached){
      renderHomeNews(cached.notices||[]);renderHomeSchedules(cached.schedules||[]);renderHomeSummary(cached.notices||[],cached.schedules||[]);
      if(status)status.textContent='前回取得 '+homeFmtTime(new Date(cached.at));
    }else{
      if(home$('homeNewsList'))home$('homeNewsList').innerHTML='<p class="home-empty">お知らせを読み込めませんでした。</p>';
      if(home$('homeScheduleList'))home$('homeScheduleList').innerHTML='<p class="home-empty">配信予定を読み込めませんでした。</p>';
      renderHomeSummary([],[]);
      if(status)status.textContent='再読み込みしてください';
    }
  }
}
function scheduleHomeRefresh(){clearInterval(homeRefreshTimer);homeRefreshTimer=setInterval(()=>{if(!document.hidden)void loadHomeUpdates()},60000)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void loadHomeUpdates()});
if(window.__MIO_HOME_DEMO__)window.__MIO_HOME_DEMO_REFRESH__=()=>loadHomeUpdates();
void loadHomeUpdates();scheduleHomeRefresh();
