import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const config=JSON.parse(read('vercel.json'));
const build=config.buildCommand;
const buildScript=read('build-preview.sh');
test('preview build excludes production pages and GAS bridge/API scripts',()=>{
 assert.equal(build,'bash ./build-preview.sh');
 assert.match(buildScript,/find \. -maxdepth 1 -type f/);
 for(const pattern of ["! -name 'index.html'","! -name 'gacha.html'","! -name 'api-*.js'","! -name 'bridge.js'","! -name '*.test.js'","! -name '*.test.mjs'"])assert(buildScript.includes(pattern),pattern);
 assert(buildScript.includes('public/integrated-live-demo.html'));
 assert(buildScript.includes('public/integrated-functional-test.html'));
 assert(!('builds' in config)&&!('routes' in config),'preview must use the static output build, without Vercel functions or route mappings');
});
test('every production-only source remains present in checkout but excluded by build rules',()=>{
 for(const file of ['index.html','gacha.html','api-register.js','api-status.js','api-checkin.js','api-gacha.js','bridge.js'])assert(existsSync(new URL('../'+file,import.meta.url)),file+' source unexpectedly missing');
 assert(buildScript.includes("! -name 'index.html'")&&buildScript.includes("! -name 'gacha.html'"));
 assert(buildScript.includes("! -name 'api-*.js'")&&buildScript.includes("! -name 'bridge.js'"));
});
test('preview root points to preview menu and has no serverless API directory',()=>{
 assert(config.rewrites.some(x=>x.source==='/'&&x.destination==='/next-preview.html'));
 assert(!existsSync(new URL('../api',import.meta.url)),'no Vercel function directory may be deployed');
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
 assert(buildScript.includes("-name '*.css'"),'static CSS files must be copied to the preview');
 for(const page of themes){
  const html=read(page);
  assert(html.includes('href="/next-sparkle.css"'),page+' is missing its theme');
  assert(html.includes('class="next-experience')||html.includes('class="next-experience"'),page+' lacks the theme scope');
  assert(html.includes('STARRY DIAMOND EDITION'),page+' is missing the edition label');
  assert(html.includes('aria-hidden="true"'),page+' art should be decorative');
  assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/.test(html),page+' should not connect to live data');
 }
 assert(css.includes('prefers-reduced-motion:reduce'),'animations must respect reduced motion');
 assert(css.includes('max-width:540px'),'mobile adaptation required');
 assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|@import|url\s*\(/.test(css),'CSS should not introduce network dependencies');
 assert(buildScript.includes("! -name 'api-*.js'"));
 assert(buildScript.includes("! -name 'bridge.js'"));
});
