import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const cfg=JSON.parse(read('vercel.json'));
const home=read('next-integrated.html');
const script=read('next-integrated.js');
const css=read('next-integrated.css');
const routed=path=>cfg.routes.find(r=>new RegExp(r.src).test(path));
const pages=[
 '/attendance-deluxe-demo.html','/mypage-deluxe-demo.html','/admin-center-demo.html',
 '/gacha-cinematic-demo.html','/community-demo.html','/home-top-demo.html',
 '/home-updates-demo.html','/news.html','/schedule.html'
];
test('new integrated page has all core routes and a visible safety notice',()=>{
 assert(home.includes('NEXT · TEST ONLY'));
 assert(home.includes('本番の登録・皆勤・ガチャ回数'));
 for(const link of pages.filter(x=>!['/home-top-demo.html','/home-updates-demo.html'].includes(x)))
  assert(home.includes('href="'+link+'"'),link);
 assert(home.includes('href="/assets/bg-top-mobile.webp"')||home.includes('srcset="/assets/bg-top-mobile.webp"'));
 assert(home.includes('src="/assets/bg-top-desktop.webp"'));
 assert(home.includes('href="/next-integrated.css"'));
 assert(home.includes('src="/next-integrated.js"'));
 assert(home.includes('src="/home-updates.js"'));
 assert(home.includes('id="homeLiveBanner"'));
 assert(home.includes('id="homeNewsSummary"'));
 assert(home.includes('id="homeScheduleSummary"'));
});
test('nine feature previews include a return to the integrated home without changing their APIs',()=>{
 for(const page of pages){
  const source=read(page.slice(1));
  assert(source.includes('href="/next-integrated.html"'),page);
  assert(source.includes('href="/next-return.css"'),page);
 }
});
test('all integrated asset routes are explicitly allowlisted static resources',()=>{
 for(const path of ['/next-integrated.html','/next-integrated.css','/next-integrated.js','/next-return.css']){
  assert(existsSync(new URL(path.slice(1),root)),path);
  assert(cfg.builds.some(b=>b.src===path.slice(1)&&b.use==='@vercel/static'),path);
  assert.equal(routed(path)?.dest,path);
 }
 for(const path of ['/api/register','/api/checkin','/api/gacha','/api/community/messages','/bridge.js','/index.html']){
  assert.equal(routed(path)?.status,404,path);
 }
 assert.equal(routed('/')?.dest,'/next-preview.html');
 assert(read('next-preview.html').includes('href="/next-integrated.html"'));
});
test('the integrated demo has no network or persistent user activity',()=>{
 for(const value of [home,css,script]){
  assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.cookie/.test(value));
 }
 assert(!/https?:\/\/(?:[^"'\s]+)\/api\//.test(home));
 assert(css.includes('max-width:700px'),'mobile layout not found');
 assert(css.includes('prefers-reduced-motion:reduce'),'reduced motion not handled');
});
test('scenario switcher creates local data and never calls a backend',()=>{
 const buttons=['live','next','empty'].map(key=>({
  dataset:{scenario:key},attrs:{},classes:[],
  addEventListener(name,cb){this.handler=cb},
  setAttribute(k,v){this.attrs[k]=v},
  classList:{toggle(){}}
 }));
 let refresh=0;
 const window={__MIO_HOME_DEMO_REFRESH__:()=>refresh++};
 const document={querySelectorAll:()=>buttons};
 vm.runInNewContext(script,{window,document,Date},{timeout:1000});
 assert.equal(window.__MIO_HOME_DEMO__.schedules.length,2);
 buttons[1].handler();
 assert.equal(window.__MIO_HOME_DEMO__.schedules.length,1);
 buttons[2].handler();
 assert.equal(window.__MIO_HOME_DEMO__.schedules.length,0);
 assert.equal(refresh,2);
});
