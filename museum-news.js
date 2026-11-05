'use strict';
// Public announcements only. Never fetches admin scope, session or private content.
(async function loadMuseumAnnouncements(){
 const root=document.getElementById('museumNews');
 if(!root)return;
 const fallback=()=>{
  root.replaceChildren();
  const card=document.createElement('article');card.className='museum-news-item';
  const heading=document.createElement('h3');heading.textContent='最新のお知らせはこちら';
  const description=document.createElement('p');
  description.textContent='記念館やイベントのご案内は、お知らせ一覧でご覧いただけます。';
  const link=document.createElement('a');link.href='/announcements.html';link.textContent='お知らせ一覧へ';
  card.append(heading,description,link);root.append(card);
 };
 try{
  const response=await fetch('/api/announcements',{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('ANNOUNCEMENTS_UNAVAILABLE');
  const payload=await response.json();
  if(payload.ok!==true||!Array.isArray(payload.items))throw new Error('ANNOUNCEMENTS_INVALID');
  const items=payload.items.filter(x=>x&&x.published===true&&typeof x.title==='string'&&typeof x.body==='string').slice(0,3);
  if(!items.length){fallback();return;}
  root.replaceChildren();
  for(const notice of items){
   const card=document.createElement('article');card.className='museum-news-item';
   const time=document.createElement('time');
   const raw=typeof notice.updatedAt==='string'?notice.updatedAt:'';
   const day=/^\d{4}-\d{2}-\d{2}/.exec(raw)?.[0];
   if(day){time.dateTime=day;time.textContent=day.replaceAll('-','.');}
   else{time.textContent='運営からのお知らせ';}
   const title=document.createElement('h3');title.textContent=notice.title.slice(0,120);
   const excerpt=document.createElement('p');
   const rawBody=notice.body.trim().replace(/\s+/g,' ');
   excerpt.textContent=rawBody.length>155?rawBody.slice(0,155)+'…':rawBody;
   const link=document.createElement('a');link.href='/announcements.html';link.textContent='お知らせ一覧で読む';
   card.append(time,title,excerpt,link);
   root.append(card);
  }
 }catch{fallback();}
 finally{root.setAttribute('aria-busy','false');}
})();
