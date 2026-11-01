import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=p=>new URL('../'+p,import.meta.url);
const read=p=>readFileSync(root(p));
const str=p=>read(p).toString('utf8');
const blob=p=>{
 const b=read(p);
 return createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex');
};
const museum=str('museum.html');
const css=str('museum.css');
test('existing released song and its cover are preserved byte-for-byte',()=>{
 assert.ok(statSync(root('mio-awakening.mp3')).size>10_000);
 assert.equal(blob('mio-awakening.mp3'),'06ee46a27519d20f10e9a04a9f065922d2a39e13');
 assert.equal(blob('assets/gallery-emuzii-mio-cover.svg'),'6426cde661b8c88468cc0e6f698eba70ae8010ee');
});
test('museum exhibits original track with a visible native audio player',()=>{
 assert.match(museum,/id="mioAwakening"/);
 assert.match(museum,/<audio[^>]*controls[^>]*src="\/mio-awakening\.mp3"/);
 assert.match(museum,/<h3>翠の覚醒 -MIO-<\/h3>/);
 assert.match(museum,/src="\/assets\/gallery-emuzii-mio-cover\.svg"/);
 assert.match(css,/\.museum-awakening-grid/);
 assert.match(css,/@media\(max-width:390px\)/);
});
test('museum links to the very same TikTok video from the previous published gallery',()=>{
 assert.match(museum,/翠の覚醒 -MIO- 魔王チャレンジ応援ソング/);
 assert.match(museum,/href="https:\/\/vt\.tiktok\.com\/ZSgFvmy7Q\//);
 assert.match(museum,/rel="noopener noreferrer"/);
 const approved=str('gallery-items.js');
 assert.match(approved,/id: 'mio-awakening-video'/);
 assert.match(approved,/url: 'https:\/\/vt\.tiktok\.com\/ZSgFvmy7Q\//);
 assert.match(approved,/audio: '\/mio-awakening\.mp3'/);
});
test('original media is served by the correct static build and cannot invoke a draw',()=>{
 const config=JSON.parse(str('vercel.json'));
 for(const src of ['mio-awakening.mp3','assets/gallery-emuzii-mio-cover.svg']){
  assert.ok(config.builds.some(x=>x.src===src&&x.use==='@vercel/static'));
  assert.ok(config.routes.some(x=>x.src==='/'+src&&x.dest==='/'+src));
 }
 assert.doesNotMatch(museum,/\/api\/gacha|\/api\/checkin|\/api\/register/);
});
