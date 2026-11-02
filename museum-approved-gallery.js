'use strict';
// Approved legacy works only. This file NEVER fetches live galleries, APIs,
// cookies, membership, device IDs or gacha state.
import {approvedGalleryItems} from './gallery-items.js';

const list=document.getElementById('approvedGalleryItems');
const status=document.getElementById('approvedGalleryStatus');
const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=String(value||'');return node;};
const localMedia=(value)=>typeof value==='string'&&/^\/(?:assets\/[A-Za-z0-9_-]+\.(?:svg|webp|jpe?g|png)|mio-awakening\.mp3)$/.test(value);
const external=(value)=>{
 if(typeof value!=='string')return null;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}
 catch{return null;}
};
const approved=approvedGalleryItems.filter(x=>x&&x.hidden===false&&
 typeof x.title==='string'&&typeof x.category==='string');

function card(item){
 const article=document.createElement('article');article.className='museum-approved-card';
 const picture=localMedia(item.thumbnail)?item.thumbnail:'/assets/gallery-emuzii-mio-cover.svg';
 const img=document.createElement('img');img.src=picture;img.alt='';img.loading='lazy';img.decoding='async';
 article.append(img);
 const category=text('span',item.category);category.className='museum-approved-label';article.append(category);
 article.append(text('h2',item.title));
 if(item.creator)article.append(text('p','制作・掲載：'+item.creator));
 if(item.description)article.append(text('p',item.description));
 if(item.category==='音声・楽曲'&&localMedia(item.audio)&&item.audio.endsWith('.mp3')){
  const audio=document.createElement('audio');audio.controls=true;audio.preload='none';
  audio.setAttribute('aria-label',item.title+'の音楽を再生');audio.src=item.audio;article.append(audio);
 }else{
  const url=external(item.url);
  if(url){
   const link=text('a',item.category==='動画'?'▶ 動画を見る（外部サイト）':'公開作品を見る');
   link.href=url;link.target='_blank';link.rel='noopener noreferrer';article.append(link);
  }
 }
 return article;
}
const search=document.getElementById('approvedGallerySearch');
const filterButtons=typeof document.querySelectorAll==='function'?
 [...document.querySelectorAll('[data-gallery-kind]')]:[];
// Build ONLY published cards once. Replacing active <audio> nodes during a search
// interrupts listening in Safari; filtering must preserve the existing DOM/media state.
const cards=list&&status?approved.map(item=>({item,element:card(item)})):[];
if(list&&status)list.replaceChildren(...cards.map(entry=>entry.element));
// Keep public category links shareable while never placing typed search terms in URLs.
const kindFromUrl=()=>{
 if(typeof window==='undefined')return 'all';
 const kind=new URLSearchParams(window.location.search).get('kind');
 return kind==='video'?'動画':kind==='music'?'音声・楽曲':'all';
};
let selected=kindFromUrl(),keyword='';
function render(){
 if(!list||!status)return;
 let visibleCount=0;
 for(const entry of cards){
  const item=entry.item,el=entry.element;
  const haystack=[item.title,item.creator,item.description].filter(Boolean).join(' ').toLocaleLowerCase('ja');
  const visible=(selected==='all'||item.category===selected)&&haystack.includes(keyword);
  if(!visible&&!el.hidden){
   // Stop playback only when its own card is filtered OUT, never when it stays visible.
   const audio=typeof el.querySelector==='function'?el.querySelector('audio'):null;
   if(audio&&typeof audio.pause==='function')audio.pause();
  }
  el.hidden=!visible;
  if(visible)visibleCount++;
 }
 filterButtons.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.galleryKind===selected)));
 status.textContent=visibleCount?
  visibleCount+'件の承認済み作品を表示しています。':
  '条件に一致する公開作品はありません。';
}
if(search)search.addEventListener('input',()=>{keyword=search.value.trim().toLocaleLowerCase('ja');render()});
filterButtons.forEach(btn=>btn.addEventListener('click',()=>{
 const next=btn.dataset.galleryKind;
 if(next!=='all'&&next!=='動画'&&next!=='音声・楽曲')return;
 if(next===selected)return;
 selected=next;
 if(typeof window!=='undefined'){
  const url=new URL(window.location.href),kind=next==='動画'?'video':next==='音声・楽曲'?'music':null;
  if(kind)url.searchParams.set('kind',kind);
  else url.searchParams.delete('kind');
  window.history.pushState(null,'',url.pathname+url.search+url.hash);
 }
 render();
}));
if(typeof window!=='undefined')window.addEventListener('popstate',()=>{
 selected=kindFromUrl();render();
});
render();
