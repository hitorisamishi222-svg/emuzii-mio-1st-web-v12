// NEXT home display regression tests. Run: node --test release-prep/home-display.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../home-updates.js',import.meta.url),'utf8');
const cfg=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-10T12:00:00+09:00');
const stamp=n=>new Date(now+n*60*1000).toISOString();
const relative=n=>new Date(Date.now()+n*60*1000).toISOString();
function contextWithDom(){
 const roots={};
 for(const id of ['homeNewsList','homeScheduleList','homeLiveBanner','homeNewsSummary','homeScheduleSummary','homeUpdatesStatus'])roots[id]={innerHTML:'',hidden:true,textContent:''};
 const ctx=vm.createContext({
  Date,Intl,URL,console,
  location:{origin:'https://example.vercel.app'},
  localStorage:{getItem:()=>null,setItem:()=>{}},
  document:{getElementById:id=>roots[id]||null,addEventListener:()=>{},hidden:false},
  window:{__MIO_HOME_DEMO__:{ok:true,notices:[],schedules:[]}},
  clearInterval:()=>{},setInterval:()=>42
 });
 vm.runInContext(js+'\nthis.testExports={homeVisibleNews,homeVisibleSchedules,homeScheduleState,renderHomeSummary,renderHomeNews,renderHomeSchedules};',ctx);
 return {ctx,roots,f:ctx.testExports};
}
test('news: future and expired hidden; recent items sorted descending',()=>{
 const {f}=contextWithDom();
 const rows=[{id:'old',publishedAt:stamp(-60)},{id:'future',publishedAt:stamp(10)},{id:'new',publishedAt:stamp(-2)},{id:'expired',publishedAt:stamp(-100),expiresAt:stamp(-1)}];
 assert.deepEqual(Array.from(f.homeVisibleNews(rows,now),x=>x.id),['new','old']);
});
test('programs: active first, future chronological, stale and malformed ignored',()=>{
 const {f}=contextWithDom();
 const rows=[
  {id:'future2',startAt:stamp(120)},
  {id:'stale',startAt:stamp(-130)},
  {id:'future1',startAt:stamp(30)},
  {id:'live',startAt:stamp(-20),endAt:stamp(20)},
  {id:'ended',startAt:stamp(-200),endAt:stamp(-90)},
  {id:'invalid',startAt:stamp(30),endAt:stamp(5)}
 ];
 assert.deepEqual(Array.from(f.homeVisibleSchedules(rows,now),x=>x.id),['live','future1','future2']);
 assert.equal(f.homeScheduleState(rows[1],now),'past');
 assert.equal(f.homeScheduleState(rows[3],now),'live');
 assert.equal(f.homeScheduleState(rows[5],now),'invalid');
});
test('news rendering escapes HTML and rejects javascript URL',()=>{
 const {f,roots}=contextWithDom();
 f.renderHomeNews([{title:'<script>x</script>',body:'<img onerror=1>',level:'重要',url:'javascript:alert(1)',publishedAt:relative(-1)}]);
 assert.match(roots.homeNewsList.innerHTML,/&lt;script&gt;/);
 assert.doesNotMatch(roots.homeNewsList.innerHTML,/<script|<img|javascript:/);
});
test('LIVE banner appears only for active program with an ending time',()=>{
 const {f,roots}=contextWithDom();
 f.renderHomeSummary([],[{startAt:relative(-30),title:'Old with no end'}]);
 assert.equal(roots.homeLiveBanner.hidden,true);
 f.renderHomeSummary([],[{startAt:relative(-2),endAt:relative(45),title:'Active'}]);
 assert.equal(roots.homeLiveBanner.hidden,false);
 assert.match(roots.homeLiveBanner.innerHTML,/LIVE 配信中/);
});
test('preview serves decor CSS while all production API routes remain denied',()=>{
 assert(cfg.builds.some(x=>x.src==='next-sparkle.css'&&x.use==='@vercel/static'));
 assert(cfg.routes.some(x=>x.dest==='/next-sparkle.css'));
 assert(cfg.routes.some(x=>x.src==='^/api(?:/.*)?$'&&x.status===404));
 assert(readFileSync(new URL('../next-preview.html',import.meta.url),'utf8').includes('/next-sparkle.css'));
 assert(!/fetch\s*\(/.test(js),'preview must not call production APIs');
});
