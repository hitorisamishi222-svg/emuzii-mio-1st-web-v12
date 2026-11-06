import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const home=read('museum.html');
const css=read('museum.css');
const catalog=read('gallery-items.js');
const archive=read('museum-archive.html');
const display=read('museum-approved-gallery.html');
const video=read('museum-approved-gallery.js');
const hero=home.slice(home.indexOf('class="museum-hero"'),home.indexOf('id="exhibits"'));
const foyer=hero.slice(hero.indexOf('<nav class="museum-foyer"'),hero.indexOf('</nav>',hero.indexOf('<nav class="museum-foyer"'))+'</nav>'.length);

test('home page directs visitors to the gallery inside the first hero, ahead of other areas',()=>{
 assert.match(hero,/aria-label="ギャラリー展示室への近道"/);
 assert.ok(hero.indexOf('class="museum-foyer"')>hero.indexOf('id="museumTitle"'));
 assert.ok(hero.indexOf('class="museum-foyer"')<hero.length);
 assert.ok(home.indexOf('id="exhibits"')<home.indexOf('id="mioAwakening"'));
 assert.ok(home.indexOf('id="exhibits"')<home.indexOf('id="latest"'));
 assert.match(home,/class="museum-showcase"/);
});

test('room navigation has four touch-friendly destinations with no unreviewed gallery claims',()=>{
 const entries=[...foyer.matchAll(/<a class="museum-foyer-link(?: museum-foyer-open)?" href="([^"]+)">/g)].map(m=>m[1]);
 assert.deepEqual(entries,[
   '/museum-approved-gallery.html',
   '/museum-archive.html?kind=icons',
   '/museum-archive.html?kind=moments',
   '/museum-archive.html?kind=events'
 ]);
 assert.equal((foyer.match(/展示準備中/g)||[]).length,3);
 assert.equal((foyer.match(/公開済みの音楽・映像/g)||[]).length,1);
 for(const item of entries)assert.ok(!item.includes('/api/')&&!item.includes('/gacha'));
});

test('all entrances point to an existing static visitor page with a valid archive filter',()=>{
 for(const item of [...foyer.matchAll(/href="([^"]+)"/g)].map(m=>m[1])){
   const url=new URL(item,'https://museum.example');
   assert.ok(['/museum-approved-gallery.html','/museum-archive.html'].includes(url.pathname));
   if(url.pathname==='/museum-archive.html'){
     const kind=url.searchParams.get('kind');
     assert.ok(['icons','moments','events'].includes(kind));
     assert.match(archive,new RegExp('data-kind="'+kind+'"'));
   }else{
     assert.match(display,/id="approvedGalleryItems"/);
     assert.match(video,/approvedGalleryItems/);
   }
 }
});

test('entrance is museum-only: never invokes authentication, GAS, checkin or gacha',()=>{
 const forbidden=/(?:fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|document\.cookie|localStorage|sessionStorage|\/api\/|GAS|CHECKIN_ATTEMPTS|BRIDGE_SECRET|tokenHash|password\s*=)/i;
 assert.doesNotMatch(foyer,forbidden);
 assert.doesNotMatch(foyer,/<script|<form|<button|onclick=|onerror=|onload=/i);
 assert.doesNotMatch(css.slice(css.indexOf('/* Gallery entrance: 2026-11-06')),/url\(['"]?https?:\/\//);
 assert.match(catalog,/approvedGalleryItems/);
 assert.match(video,/approvedGalleryItems/);
});

test('gallery visuals support small Android/iPhone widths and reduced motion without an external visual service',()=>{
 assert.match(css,/\.museum-foyer-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.museum-foyer-link\{display:flex;align-items:center;gap:10px;min-height:64px/);
 assert.match(css,/@media\(max-width:630px\)/);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.museum-foyer-link\{transition:none\}\}/);
 assert.doesNotMatch(css.slice(css.indexOf('/* Gallery entrance: 2026-11-06')),/repeating-(?:linear|radial)-gradient|animation\s*:/);
 assert.match(css,/\.museum-gallery-first/);
});

test('approved audio/video remains linked to legacy media and other published works are not invented',()=>{
 assert.match(home,/src="\/mio-awakening\.mp3"/);
 assert.match(home,/href="https:\/\/vt\.tiktok\.com\/ZSgFvmy7Q\/"/);
 assert.match(home,/href="\/museum-approved-gallery\.html\?kind=music"/);
 assert.match(home,/href="\/museum-approved-gallery\.html\?kind=video"/);
 assert.equal((home.match(/class="museum-showcase-item"/g)||[]).length,2);
 assert.doesNotMatch(foyer,/登録する|予約|購入|今すぐ参加|会員限定/);
});

test('old attendance form is hidden from the new museum entry without deleting its code',()=>{
 assert.doesNotMatch(foyer,/皆勤|チェックイン|ガチャ|端末切替/);
 assert.match(home,/noindex,nofollow/);
 assert.ok(read('api-checkin.js').length>0);
 assert.ok(read('gacha-page.js').length>0);
});
