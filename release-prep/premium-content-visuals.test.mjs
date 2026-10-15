import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('next-premium-v2.css');
const cfg=JSON.parse(read('vercel.json'));
const pages=[
 'next-preview.html','attendance-deluxe-demo.html','mypage-deluxe-demo.html',
 'admin-center-demo.html','community-demo.html','gacha-cinematic-demo.html',
 'home-top-demo.html','home-updates-demo.html','news.html','schedule.html'
];
test('premium design stylesheet is static, allowlisted, and accessible only within isolated preview',()=>{
 assert(cfg.buildCommand.includes("-name '*.css'"));
 assert(cfg.buildCommand.includes('cp -t public/'));
 assert(cfg.buildCommand.includes("! -name 'api-*.js'"));
 assert(cfg.buildCommand.includes("! -name 'bridge.js'"));
 assert(!('builds' in cfg)&&!('routes' in cfg));
 for(const path of pages)assert(read(path).includes('href="/next-premium-v2.css"'),path);
});

test('premium theme is 100 percent presentation: no scripts, external imports, images or network calls',()=>{
 assert(css.length<25000,'CSS size budget');
 assert(!/@import|url\s*\(|https?:\/\/|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/i.test(css));
 assert(css.includes('prefers-reduced-motion:reduce'));
 assert(css.includes('@media(max-width:520px)'));
 assert(css.includes('focus-visible'));
 assert(css.includes('--mio-sky'));
});

test('all content groups receive a distinct visual treatment and unchanged safety behavior',()=>{
 for(const selector of [
  'body[data-page=attendance]','body[data-page=mypage]','body[data-page=admin]',
  'body.next-premium-community','body.next-premium-gacha','body.next-premium-home',
  'body.next-portal'
 ])assert(css.includes(selector),selector);
 assert(read('community-demo.html').includes('class="next-premium-community"'));
 assert(read('gacha-cinematic-demo.html').includes('class="next-premium-gacha"'));
 for(const path of ['home-top-demo.html','home-updates-demo.html','news.html','schedule.html'])
  assert(read(path).includes('next-premium-home'),path);
 for(const path of ['community-demo.html','gacha-cinematic-demo.html'])
  assert(!/fetch\s*\(|XMLHttpRequest|WebSocket/.test(read(path)),path+' must remain disconnected');
});

test('31-day attendance progress and medals use explicit demo labels and accessible structures',()=>{
 const html=read('attendance-deluxe-demo.html');
 assert(html.includes('role="progressbar"'));
 assert(html.includes('aria-valuemax="31"'));
 assert(html.includes('aria-valuenow="15"'));
 assert(html.includes('mio-milestones'));
 assert(html.includes('LOCKED · DEMO'));
 assert(html.includes('next-pages.js'));
 assert(!/fetch\s*\(/.test(html));
});

test('production-only code remains blocked from static replica routes',()=>{
 for(const pattern of ["! -name 'api-*.js'","! -name 'bridge.js'","! -name 'index.html'","! -name 'gacha.html'"])assert(cfg.buildCommand.includes(pattern),pattern);
});

test('premium HOME keeps the existing approved desktop and mobile Mio portrait art',()=>{
 assert(read('backgrounds.css').includes("url('/assets/bg-top-desktop.webp')"));
 assert(read('backgrounds.css').includes("url('/assets/bg-top-mobile.webp')"));
 for(const image of ['assets/bg-top-desktop.webp','assets/bg-top-mobile.webp'])
  assert(cfg.buildCommand.includes('cp -R assets public/assets'),image+' assets folder must be copied');
 assert(css.includes('body.next-experience,body.next-premium-community{\n background-image:'));
 assert(!css.includes('body.next-experience,body.next-premium-home,body.next-premium-community{\n background-image:'));
 assert(read('home-top-demo.html').includes('class="next-premium-home"'));
});
