import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {approvedGalleryItems} from '../gallery-items.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exists=p=>existsSync(new URL('../'+p,import.meta.url));
const config=JSON.parse(read('vercel.json'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const baseConfig=()=>JSON.parse(git('show','origin/main:vercel.json'));
const media={
 song:'/mio-awakening.mp3',
 video:'https://vt.tiktok.com/ZSgFvmy7Q/',
 cover:'/assets/gallery-emuzii-mio-cover.svg'
};
const museumPages=['museum.html','mio-profile.html','museum-archive.html','museum-approved-gallery.html'];
const museumFiles=[...museumPages,'museum.css','museum-archive.css','museum-archive.js','museum-news.js','museum-approved-gallery.js','museum-media-fallback.js'];
const unchanged=[
 'index.html','app.js','style.css','bridge.js',
 'api-register.js','api-status.js','api-checkin.js',
 'api-gacha.js','gacha-page.js','gacha.html',
 'api-gacha-admin-ops.js','gacha-web-gate.html',
 'api-gallery-items.js','api-gallery-manage.js','api-gallery-moderate.js',
 'gallery.html','gallery-items.js','mio-awakening.mp3',
 'assets/gallery-emuzii-mio-cover.svg'
];

test('all old production authentication, draw, attendance and approved media blobs are byte-identical to origin/main',()=>{
 // This is a structural check of the protected source, not live GAS/DB validation.
 git('rev-parse','--verify','origin/main');
 for(const path of unchanged){
  assert.equal(git('rev-parse','HEAD:'+path),git('rev-parse','origin/main:'+path),
   'PROTECTED MAIN FILE CHANGED: '+path);
 }
});
test('all prior Vercel builds and routes are retained EXACTLY, in the same order',()=>{
 const origin=baseConfig();
 const filteredBuilds=config.builds.filter(x=>origin.builds.some(y=>y.src===x.src));
 const filteredRoutes=config.routes.filter(x=>origin.routes.some(y=>y.src===x.src));
 assert.deepEqual(filteredBuilds,origin.builds,'A production build was removed/modified/reordered');
 assert.deepEqual(filteredRoutes,origin.routes,'A production route was removed/modified/reordered');
 assert.equal(config.builds.length,origin.builds.length+museumFiles.length);
 assert.equal(config.routes.length,origin.routes.length+museumFiles.length);
});
test('museum routes are exact static files only; no production auth or database endpoints are added',()=>{
 for(const path of museumFiles){
  assert.ok(exists(path),'Missing '+path);
  assert.deepEqual(config.builds.filter(x=>x.src===path),[{src:path,use:'@vercel/static'}]);
  const route=config.routes.filter(x=>x.src==='/'+path);
  assert.equal(route.length,1,path);
  assert.equal(route[0].dest,'/'+path);
  if(path.endsWith('.html'))assert.equal(route[0].headers['X-Robots-Tag'],'noindex, nofollow');
 }
 assert.equal(config.routes.filter(x=>x.src.startsWith('/api/museum')).length,0);
 for(const path of ['api-museum-exhibits.js','api-museum-image.js','api-museum-preflight.js'])
  assert.equal(exists(path),false,'Never stage unverified database writes: '+path);
});
test('original approved video and audio remain visible in the static catalog with no session rights changed',()=>{
 const video=approvedGalleryItems.find(x=>x.id==='mio-awakening-video');
 const song=approvedGalleryItems.find(x=>x.id==='mio-awakening-song');
 assert.equal(song?.hidden,false);
 assert.equal(video?.hidden,false);
 assert.equal(song.audio,media.song);
 assert.equal(video.url,media.video);
 assert.equal(video.thumbnail,media.cover);
 const museum=read('museum.html');
 assert.match(museum,/<audio[^>]*controls[^>]*src="\/mio-awakening\.mp3"/);
 assert.ok(museum.includes('href="'+media.video+'"'));
 assert.ok(museum.includes('src="'+media.cover+'"'));
});
test('staging museum is non-indexed and not falsely described as production',()=>{
 for(const path of museumPages){
  const html=read(path);
  assert.match(html,/<meta name="robots" content="noindex,nofollow">/,path);
  assert.match(html,/大型アップデート用/,path);
  assert.doesNotMatch(html,/href="\/home-portrait-next\.html"|href="\/community-demo\.html"|href="\/home-updates-demo\.html"/,path);
 }
});
test('museum display JavaScript cannot read participants or submit writes',()=>{
 for(const path of ['museum-archive.js','museum-news.js','museum-approved-gallery.js','museum-media-fallback.js']){
  const script=read(path);
  assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage|sessionStorage|\bindexedDB\b/,path);
  assert.doesNotMatch(script,/\/api\/(?:register|gacha|status|checkin|gallery)/,path);
  assert.doesNotMatch(script,/innerHTML\s*=/,path);
 }
});
test('static approved-work view rejects hidden works and renders existing track/link without unsafe HTML',()=>{
 const original=read('museum-approved-gallery.js');
 const code=original.replace(/^import \{approvedGalleryItems\} from ['"]\.\/gallery-items\.js['"];?\s*$/m,'');
 assert.notEqual(code,original);
 const nodes=[];
 const node=tag=>{const a={tag,children:[],textContent:'',src:'',href:'',attrs:{},
  append(...x){this.children.push(...x)},replaceChildren(...x){this.children=x},
  setAttribute(k,v){this.attrs[k]=v}};nodes.push(a);return a;};
 const list=node('section'),status=node('div');
 const document={createElement:node,getElementById(id){return id==='approvedGalleryItems'?list:id==='approvedGalleryStatus'?status:null}};
 const hidden={id:'x',title:'未公開作品',hidden:true,category:'動画',url:'https://example.com'};
 vm.runInNewContext(code,{document,URL,approvedGalleryItems:[...approvedGalleryItems,hidden]});
 assert.equal(list.children.length,2);
 assert.equal(nodes.filter(x=>x.tag==='audio')[0].src,media.song);
 assert.equal(nodes.filter(x=>x.tag==='a')[0].href,media.video);
 assert.equal(nodes.filter(x=>x.textContent==='未公開作品').length,0);
});
test('all local museum navigation targets and static media assets exist in the main-based copy',()=>{
 for(const path of museumPages){
  const html=read(path);
  for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const value=m[1];
   if(!(value.startsWith('/')||value.startsWith('#')))continue;
   const url=new URL(value,'https://staging.invalid/'+path);
   const target=decodeURIComponent(url.pathname.slice(1))||'index.html';
   assert.ok(exists(target),path+' links to missing '+value);
   if(url.hash){
    const id=decodeURIComponent(url.hash.slice(1));
    if(target!=='index.html')assert.ok(read(target).includes('id="'+id+'"'),path+' missing anchor '+value);
   }
  }
 }
});
