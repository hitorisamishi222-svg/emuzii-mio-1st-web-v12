import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {approvedGalleryItems} from '../gallery-items.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('museum-approved-gallery.js');
const html=read('museum-approved-gallery.html');
const sha=p=>{const b=readFileSync(new URL('../'+p,import.meta.url));return createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex')};
const plainCode=code.replace(/^import \{approvedGalleryItems\} from ['"]\.\/gallery-items\.js['"];?\s*$/m,'');
function render(catalog){
 const created=[];
 function element(tag){const n={tag,children:[],textContent:'',className:'',src:'',href:'',hidden:false,
   controls:false,attrs:{},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},
   setAttribute(k,v){this.attrs[k]=v}};
   created.push(n);return n;
 }
 const root=element('section'),status=element('div');
 const document={createElement:element,getElementById(id){return id==='approvedGalleryItems'?root:id==='approvedGalleryStatus'?status:null}};
 vm.runInNewContext(plainCode,{approvedGalleryItems:catalog,document,URL});
 return{root,status,created};
}
test('approved works are byte-identical to current protected main catalog',()=>{
 assert.equal(sha('gallery-items.js'),'69896a5aa5bf1cc28a1a17feecefcc043f98c1f8');
 assert.equal(sha('mio-awakening.mp3'),'06ee46a27519d20f10e9a04a9f065922d2a39e13');
 assert.equal(sha('assets/gallery-emuzii-mio-cover.svg'),'6426cde661b8c88468cc0e6f698eba70ae8010ee');
});
test('music and video display with existing published identity, original URLs and player',()=>{
 const result=render(approvedGalleryItems);
 assert.equal(result.root.children.length,2);
 assert.match(result.status.textContent,/2件/);
 const audio=result.created.find(x=>x.tag==='audio');
 assert.equal(audio.src,'/mio-awakening.mp3');
 assert.equal(audio.controls,true);
 const link=result.created.find(x=>x.tag==='a');
 assert.equal(link.href,'https://vt.tiktok.com/ZSgFvmy7Q/');
 assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
 const titles=result.created.filter(x=>x.tag==='h2').map(x=>x.textContent);
 assert.ok(titles.includes('翠の覚醒 -MIO-'));
 assert.ok(titles.some(x=>x.includes('魔王チャレンジ応援ソング')));
});
test('hidden or unapproved content does not appear and no raw HTML is injected',()=>{
 const a=render([...approvedGalleryItems,{hidden:true,title:'非公開作品',category:'動画',url:'https://example.com'}]);
 assert.equal(a.root.children.length,2);
 assert.ok(!a.created.some(x=>x.textContent==='非公開作品'));
 assert.doesNotMatch(code,/innerHTML\s*=/);
});
test('viewer is index-blocked and does not access session, draw, gallery API or uploads',()=>{
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/src="\/museum-approved-gallery\.js"/);
 assert.match(code,/import \{approvedGalleryItems\} from '\.\/gallery-items\.js'/);
 assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage|sessionStorage|\/api\//);
 assert.doesNotMatch(code,/\.play\(\)|autoplay\s*=\s*true/);
});
test('all museum and copy-home gallery links lead to actual approved-work page',()=>{
 for(const p of ['museum.html','mio-profile.html','museum-archive.html','home-portrait-next.html','next-preview.html']){
  assert.match(read(p),/href="\/museum-approved-gallery\.html"/,p);
 }
 for(const p of ['museum.html','mio-profile.html','museum-archive.html']){
  assert.doesNotMatch(read(p),/href="\/community-demo\.html"/,p);
 }
});
test('built preview includes existing public catalog, native media, and protected route isolation',()=>{
 const build=read('build-preview.sh');
 assert.match(build,/find \. -maxdepth 1 -type f/);
 assert.match(build,/! -name 'api-\*\.js'/);
 assert.match(build,/test ! -e public\/gacha\.html/);
 assert.match(html,/大型アップデート用コピー版/);
});
