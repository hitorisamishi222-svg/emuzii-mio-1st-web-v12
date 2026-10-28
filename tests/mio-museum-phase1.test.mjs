import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Script} from 'node:vm';

const root=(filename)=>readFileSync(new URL('../'+filename,import.meta.url),'utf8');
const muse=root('museum.html');
const profile=root('mio-profile.html');
const index=root('index.html');
const news=root('museum-news.js');
const css=root('museum.css');
const robots=root('robots.txt');
const sitemap=root('sitemap.xml');
const config=JSON.parse(root('vercel.json'));
const origin='https://emuzii-mio-1st-web-v12.vercel.app';

test('public museum and profile have titles, canonical URLs and Japanese content',()=>{
 for(const [file,html,url] of [['museum.html',muse,'/museum.html'],['mio-profile.html',profile,'/mio-profile.html']]){
  assert.match(html,/<html lang="ja">/);
  assert.match(html,/<meta name="description" content="[^"]+"/);
  assert.match(html,new RegExp('<link rel="canonical" href="'+origin+url.replace('.','\\.')+'">'));
  assert.match(html,/<meta name="robots" content="index,follow/);
  assert.match(html,/<main id="/);
  assert.match(html,/<h1[^>]*>/);
 }
});
test('navigation is public and has no broken local exhibit links',()=>{
 const pathRegexp=/<a\b[^>]*\bhref="(\/[^"#?]*)(?:[?#][^"]*)?"/g;
 const publicRoutes=new Set(['/','/museum.html','/mio-profile.html','/gallery.html','/announcements.html']);
 for(const page of [muse,profile]){
  for(const match of page.matchAll(pathRegexp)){
   assert.ok(publicRoutes.has(match[1]),'unexpected or private link '+match[1]);
  }
  assert.doesNotMatch(page,/href="\/admin-hub.html"|href="\/gallery-manage.html"/);
 }
 assert.match(muse,/歴代アイコン館/);
 assert.match(muse,/展示準備中/);
 assert.match(muse,/登録せず/);
});
test('existing homepage has a museum entry without losing attendance or gacha links',()=>{
 assert.match(index,/href="\/museum.html"/);
 assert.match(index,/id="attendanceSubmit"/);
 assert.match(index,/id="personal"/);
 assert.match(index,/href="\/gacha.html"/);
 assert.match(index,/src="\/app.js"/);
});
test('published news is displayed with safe text APIs and a fallback',()=>{
 assert.match(news,/\/api\/announcements/);
 assert.match(news,/credentials:'omit'/);
 assert.match(news,/x\.published===true/);
 assert.match(news,/\.slice\(0,3\)/);
 assert.match(news,/textContent=/);
 assert.doesNotMatch(news,/innerHTML\s*=/);
 assert.doesNotMatch(news,/scope=admin|gallery\/moderate|api\/status|api\/checkin/);
 assert.doesNotThrow(()=>new Script(news));
});
test('seo sitemap indexes only intended public routes and excludes private areas',()=>{
 assert.match(robots,/Sitemap:\s*https:\/\/emuzii-mio-1st-web-v12\.vercel\.app\/sitemap\.xml/);
 assert.match(robots,/Disallow: \/api\//);
 assert.match(robots,/Disallow: \/admin-hub.html/);
 assert.match(sitemap,/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
 for(const page of ['/','/museum.html','/mio-profile.html','/gallery.html','/announcements.html'])
  assert.ok(sitemap.includes('<loc>'+origin+page+'</loc>'),'missing public URL '+page);
 assert.doesNotMatch(sitemap,/\/api\/|admin-hub|attendance-admin|gallery-manage|media-manage|gacha\.html/);
});
test('all first-stage files are included in Vercel builds and exact routes',()=>{
 for(const filename of ['museum.html','mio-profile.html','museum.css','museum-news.js','robots.txt','sitemap.xml']){
  assert.ok(config.builds.some(x=>x.src===filename&&x.use==='@vercel/static'),'missing build '+filename);
  assert.ok(config.routes.some(x=>x.src==='/'+filename&&x.dest==='/'+filename),'missing route '+filename);
 }
 assert.ok(config.routes.some(x=>x.src==='/'&&x.dest==='/index.html'),'existing home route changed');
 assert.ok(config.routes.some(x=>x.src==='/api/gacha'&&x.dest==='/api-gacha.js'),'gacha route missing');
});
test('visuals use approved existing sources and support smaller screens',()=>{
 assert.match(css,/@media\(max-width:630px\)/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/focus-visible/);
 assert.ok(existsSync(new URL('../assets/mio-bg-princess.jpg',import.meta.url)));
 assert.ok(existsSync(new URL('../gacha-v191-whale-blue.svg',import.meta.url)));
 assert.match(muse,/alt="" decoding="async"/);
});
