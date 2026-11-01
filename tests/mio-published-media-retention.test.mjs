import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {approvedGalleryItems} from '../gallery-items.js';
// Regression guard: previously approved MIO music/video must survive a complete
// version update. This is read-only and NEVER invokes production media/API.
const bytes=p=>readFileSync(new URL('../'+p,import.meta.url));
const text=p=>bytes(p).toString('utf8');
const blob=p=>{const b=bytes(p);return createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex');};
test('the original published MIO Awakening media bytes and approved catalog remain unchanged',()=>{
 assert.equal(blob('mio-awakening.mp3'),'06ee46a27519d20f10e9a04a9f065922d2a39e13');
 assert.equal(blob('assets/gallery-emuzii-mio-cover.svg'),'6426cde661b8c88468cc0e6f698eba70ae8010ee');
 assert.equal(blob('gallery-items.js'),'69896a5aa5bf1cc28a1a17feecefcc043f98c1f8');
});
test('approved old song and TikTok video remain published in the gallery catalog',()=>{
 const video=approvedGalleryItems.find(x=>x.id==='mio-awakening-video');
 const song=approvedGalleryItems.find(x=>x.id==='mio-awakening-song');
 assert.equal(video?.hidden,false);assert.equal(song?.hidden,false);
 assert.equal(video?.url,'https://vt.tiktok.com/ZSgFvmy7Q/');
 assert.equal(song?.audio,'/mio-awakening.mp3');
 assert.equal(video?.thumbnail,'/assets/gallery-emuzii-mio-cover.svg');
});
test('already used home music player and gallery audio playback remain intact',()=>{
 const home=text('index.html'),gallery=text('gallery.html');
 assert.match(home,/id="mioBgm"[^>]*src="\/mio-awakening\.mp3"/);
 assert.match(home,/id="musicToggle"/);assert.match(home,/id="musicVolume"/);
 assert.match(gallery,/if\(item\.audio==='\/mio-awakening\.mp3'\)/);
 assert.match(gallery,/player\.controls=true/);
});
test('Vercel production source still maps approved music, cover and gallery to static builds',()=>{
 const config=JSON.parse(text('vercel.json'));
 for(const path of ['mio-awakening.mp3','assets/gallery-emuzii-mio-cover.svg','gallery-items.js','gallery.html']){
  assert.ok(config.builds.some(x=>x.src===path&&x.use==='@vercel/static'),path);
 }
 assert.ok(config.routes.some(x=>x.src==='/gallery.html'&&x.dest==='/gallery.html'));
});
