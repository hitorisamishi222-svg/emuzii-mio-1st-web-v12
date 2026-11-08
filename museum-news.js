'use strict';
// Standalone large-update replica: public announcements API is deliberately offline.
(()=>{
 const root=document.getElementById('museumNews');
 if(!root)return;
 root.replaceChildren();
 const entry=document.createElement('article');entry.className='museum-news-item';
 const title=document.createElement('h3');title.textContent='お知らせは公開準備中です';
 const detail=document.createElement('p');
 detail.textContent='このコピー版には本番の記事・会員情報を読み込みません。表示デザインのみ確認できます。';
 entry.append(title,detail);
 root.append(entry);
 root.setAttribute('aria-busy','false');
})();
