import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('next-integrated.html');
const css=read('next-premium.css');
const cfg=JSON.parse(read('vercel.json'));
const buildFiles=new Set(cfg.builds.map(x=>x.src));
const exposed=src=>cfg.routes.find(x=>x.dest==='/'+src&&x.src==='^/'+src.replace(/\./g,'\\.')+'$');

test('Cinematic hero uses previously approved desktop and mobile artwork',()=>{
 assert(html.includes('src="/assets/bg-top-desktop.webp"'));
 assert(html.includes('srcset="/assets/bg-top-mobile.webp"'));
 assert(html.includes('class="mio-hero cinematic-hero"'));
 assert(html.includes('一周年の物語。'));
 assert(html.includes('SCROLL TO EXPLORE'));
});
test('Premium cards use existing whale art, real calendar layout, and community stage',()=>{
 for(const art of ['gacha-v191-whale-blue.svg','gacha-v191-whale-gold.svg']){
  assert(html.includes('src="/'+art+'"'),art+' missing on page');
  assert(existsSync(new URL('../'+art,import.meta.url)),art+' absent on disk');
  assert(buildFiles.has(art),art+' not in static allowlist');
 }
 assert((html.match(/class="day-lit"/g)||[]).length>=10);
 assert((html.match(/<div class="calendar-tiles">/g)||[]).length===1);
 assert((html.match(/<span class="(day-lit|)"/g)||[]).length===31);
 assert(html.includes('class="community-stage"'));
 assert(html.includes('class="community-preview"'));
 assert(!html.includes('class="feature-art"'),'old emoji-centric feature-card artwork remains');
});
test('Premium static stylesheet is routed and supports accessibility and phones',()=>{
 assert(html.includes('href="/next-premium.css"'));
 assert(buildFiles.has('next-premium.css'));
 assert(exposed('next-premium.css'));
 for(const breakpoint of ['max-width:700px','max-width:430px','max-width:350px'])assert(css.includes(breakpoint));
 assert(css.includes('prefers-reduced-motion:reduce'));
 assert(html.includes('class="nav-icon"'));
 assert(html.includes('aria-hidden="true"'));
});
test('Cinematic upgrade remains read-only preview without new external services',()=>{
 for(const source of [html,css]){
  assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.cookie|@import/.test(source));
 }
 assert(cfg.routes.find(x=>x.src==='^/api(?:/.*)?$'&&x.status===404));
 assert(cfg.routes.at(-1)?.status===404);
 assert(cfg.routes.find(x=>x.src==='^/$')?.dest==='/next-preview.html');
});
