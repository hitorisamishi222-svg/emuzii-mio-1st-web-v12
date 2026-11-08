'use strict';
// Museum public archive. Renders ONLY server-reviewed and published exhibits.
const kinds={all:'すべて',icons:'歴代アイコン',moments:'思い出アルバム',events:'イベントの記録'};
const emoji={icons:'👑',moments:'📸',events:'🏆'};
const root=document.getElementById('archiveEntries');
const status=document.getElementById('archiveStatus');
const filters=[...document.querySelectorAll('.archive-filter')];
let items=[],open=false;
const known=(kind)=>Object.hasOwn(kinds,kind)?kind:'all';
const initial=new URLSearchParams(window.location.search).get('kind')||'all';
let selected=known(initial);
const safeImage=value=>typeof value==='string'&&(
 /^\/assets\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)&&!value.includes('..')
 || /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^?#]+\.(?:png|jpe?g|webp|gif)(?:\?[^#]*)?$/i.test(value)
);
const safeLink=value=>{
 if(typeof value!=='string')return null;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}
 catch{return null;}
};
const label=kind=>kinds[kind]||'思い出';
// Decorative, bundled palace scenes only. No exhibit data or private images.
const palaceRooms=Object.freeze({
 all:{image:'album',name:'思い出の宮殿へ',alt:'思い出アルバムの宮殿',copy:'翠央とみんなの思い出を大切に飾る、青い宮殿のお部屋です。'},
 icons:{image:'icons',name:'歴代アイコン館',alt:'歴代アイコン館の宮殿',copy:'時とともに変わった翠央の表情をたどるお部屋。展示作品は公開確認後にご案内します。'},
 moments:{image:'album',name:'思い出アルバム',alt:'思い出アルバムの宮殿',copy:'心に残る一瞬を集めるお部屋。公開許可が確認できた思い出だけを飾ります。'},
 events:{image:'events',name:'イベントの記録',alt:'イベント記録の宮殿',copy:'一緒に過ごした企画や記念日の足あとをたどるお部屋です。'}
});
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value||'';return el;};
function card(item){
 const kind=Object.hasOwn(emoji,item.kind)?item.kind:'moments';
 const article=document.createElement('article');article.className='archive-entry';
 const image=document.createElement('div');image.className='archive-image';
 if(item.imageUrl&&safeImage(item.imageUrl)){
  const img=document.createElement('img');
  img.src=item.imageUrl;img.alt=item.title||label(kind);
  img.loading='lazy';img.decoding='async';image.append(img);
 }else{
  const placeholder=text('span',emoji[kind]);placeholder.className='archive-image-placeholder';placeholder.setAttribute('aria-hidden','true');image.append(placeholder);
 }
 const body=document.createElement('div');body.className='archive-entry-body';
 const when=typeof item.occurredOn==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item.occurredOn)?item.occurredOn.replaceAll('-','.'):'';
 const tag=text('div',label(kind)+(when?' ・ '+when:''));tag.className='archive-tag';
 const heading=text('h3',item.title);const desc=text('p',item.description);
 body.append(tag,heading);
 if(desc.textContent)body.append(desc);
 if(item.credit){const credit=text('span','展示クレジット：'+item.credit);credit.className='archive-credit';body.append(credit);}
 const href=safeLink(item.externalUrl);
 if(href){
  const link=text('a','作品・関連ページを見る');link.className='archive-link';link.href=href;link.target='_blank';link.rel='noopener noreferrer';body.append(link);
 }
 article.append(image,body);return article;
}
function render(){
 document.body.dataset.museumRoom=selected;
 const room=palaceRooms[selected];
 const picture=document.getElementById('archiveRoomSpotlightImage');
 const title=document.getElementById('archiveRoomSpotlightTitle');
 const copy=document.getElementById('archiveRoomSpotlightCopy');
 if(picture){picture.src='/assets/mio-palace-'+room.image+'.webp';picture.alt=room.alt;}
 if(title)title.textContent=room.name;
 if(copy)copy.textContent=room.copy;
 if(!root||!status)return;
 filters.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.kind===selected)));
 const shown=items.filter(x=>selected==='all'||x.kind===selected);
 root.replaceChildren();
 root.className=selected==='events'?'archive-timeline':'archive-grid';
 for(const item of shown)root.append(card(item));
 const short=selected==='all'?'公開展示':label(selected);
 if(shown.length){
  status.textContent=short+'：'+shown.length+'件を表示しています。';
 }else if(!open){
  status.textContent='新しい展示の公開準備中です。公開済みの作品は「翠央っ子ギャラリー」でご覧いただけます。';
 }else{
  status.textContent=short+'は現在準備中です。掲載する思い出が確認でき次第、ここに展示します。';
 }
}
filters.forEach(button=>button.addEventListener('click',()=>{
 selected=known(button.dataset.kind);
 const next=new URL(window.location.href);
 if(selected==='all')next.searchParams.delete('kind');
 else next.searchParams.set('kind',selected);
 window.history.pushState(null,'',next.pathname+next.search+next.hash);
 render();
}));
window.addEventListener('popstate',()=>{
 selected=known(new URLSearchParams(window.location.search).get('kind')||'all');
 render();
});
// Preview is deliberately disconnected from museum DB and management APIs.
render();
