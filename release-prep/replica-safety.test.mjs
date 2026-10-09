import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const config=JSON.parse(read('vercel.json'));
const src=config.builds.map(x=>x.src);
test('preview only deploys allowlisted static files, never registration or gacha endpoints',()=>{
 assert(src.length>12);
 assert(src.every(x=>x&&!x.startsWith('api')&&x!=='bridge.js'&&x!=='index.html'&&x!=='gacha.html'&&!/\.gs$/i.test(x)));
 assert(config.builds.every(x=>x.use==='@vercel/static'));
 assert(config.routes.some(x=>x.src==='^/api(?:/.*)?$'&&x.status===404));
 assert(config.routes.some(x=>x.src==='^/$'&&x.dest==='/next-preview.html'));
});
test('all included static sources are present in replica',()=>{
 for(const file of src)assert(existsSync(new URL('../'+file,import.meta.url)),file);
});
test('public navigation cannot expose unregistered files or production APIs',()=>{
 const routes=config.routes;
 const destination=url=>routes.find(x=>new RegExp(x.src).test(url));
 for(const path of ['/api/register','/api/checkin','/api/gacha','/api/status','/api/home-info','/bridge.js','/index.html','/gacha.html','/APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs']){
  const found=destination(path);
  assert(found&&found.status===404,path+' unexpectedly reachable');
 }
 assert.equal(destination('/').dest,'/next-preview.html');
});
test('home page JS cannot call production API and info pages are seeded with fake data',()=>{
 const js=read('home-updates.js');
 assert(!js.includes("fetch(HOME_API"));
 assert(!js.includes("const HOME_API='/api/home-info'"));
 for(const path of ['news.html','schedule.html','home-top-demo.html','home-updates-demo.html'])assert(read(path).includes('__MIO_HOME_DEMO__'),path);
});
test('community and whale demos have no write endpoint calls',()=>{
 assert(!/fetch\s*\(/.test(read('community-demo.html')));
 assert(!/fetch\s*\(/.test(read('gacha-cinematic-demo.html')));
});
test('luxury preview pages have working local-only UI, not live APIs',()=>{
 for(const path of ['attendance-deluxe-demo.html','mypage-deluxe-demo.html','admin-center-demo.html']){
  const html=read(path);
  assert(html.includes('NEXT TEST ONLY'));assert(html.includes('next-pages.js'));
  assert(!/fetch\s*\(/.test(html));
 }
 const js=read('next-pages.js');
 assert(!/fetch\s*\(/.test(js));
 assert(!/XMLHttpRequest|WebSocket|localStorage|sessionStorage/.test(js));
 assert(read('next-preview.html').includes('/attendance-deluxe-demo.html'));
 assert(read('next-preview.html').includes('/admin-center-demo.html'));
});
test('replica includes source login ID recovery and moderation building blocks',()=>{
 const js=read('app.js');const api=read('api-register.js');
 assert(js.includes('mioLoginId'));assert(api.includes('loginId'));
 for(const file of ['security/guard.js','security/authorization.js','community-policy.js'])assert(existsSync(new URL('../'+file,import.meta.url)));
});

test('Starry Diamond skin loads exclusively in isolated previews and keeps safe mobile defaults',()=>{
 const css=read('next-sparkle.css');
 const themes=['next-preview.html','attendance-deluxe-demo.html','mypage-deluxe-demo.html','admin-center-demo.html'];
 assert(src.includes('next-sparkle.css'),'static CSS must be in build allowlist');
 assert(config.routes.some(x=>x.src==='^/next-sparkle\\.css$'&&x.dest==='/next-sparkle.css'));
 for(const page of themes){
  const html=read(page);
  assert(html.includes('href="/next-sparkle.css"'),page+' is missing its theme');
  assert(html.includes('class="next-experience')||html.includes('class="next-experience"'),page+' lacks the theme scope');
  assert(html.includes('STARRY DIAMOND EDITION'),page+' is missing the edition label');
  assert(html.includes('aria-hidden="true"'),page+' art should be decorative');
  assert(!/fetch\\s*\\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/.test(html),page+' should not connect to live data');
 }
 assert(css.includes('prefers-reduced-motion:reduce'),'animations must respect reduced motion');
 assert(css.includes('max-width:540px'),'mobile adaptation required');
 assert(!/fetch\\s*\\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|@import|url\\s*\\(/.test(css),'CSS should not introduce network dependencies');
 const registered=config.routes.find(x=>x.src==='^/next-sparkle\\.css$');
 const denyApi=config.routes.findIndex(x=>x.src==='^/api(?:/.*)?$'&&x.status===404);
 assert(registered&&denyApi>0&&config.routes.indexOf(registered)<denyApi,'CSS route must not expose APIs');
});
