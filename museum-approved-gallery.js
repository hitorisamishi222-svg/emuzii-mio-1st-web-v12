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
let selected='all',keyword='';
function render(){
 if(!list||!status)return;
 const shown=approved.filter(item=>{
  if(selected!=='all'&&item.category!==selected)return false;
  const haystack=[item.title,item.creator,item.description].filter(Boolean).join(' ').toLocaleLowerCase('ja');
  return haystack.includes(keyword);
 });
 filterButtons.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.galleryKind===selected)));
 list.replaceChildren(...shown.map(card));
 status.textContent=shown.length?
  shown.length+'件の承認済み作品を表示しています。':
  '条件に一致する公開作品はありません。';
}
if(search)search.addEventListener('input',()=>{keyword=search.value.trim().toLocaleLowerCase('ja');render()});
filterButtons.forEach(btn=>btn.addEventListener('click',()=>{
 const next=btn.dataset.galleryKind;
 if(next!=='all'&&next!=='動画'&&next!=='音声・楽曲')return;
 selected=next;render();
}));
render();
