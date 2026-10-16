import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const conf=JSON.parse(read('vercel.json'));
const home=read('index.html');
test('candidate explicitly keeps production API and adopted data widgets',()=>{
  const srcs=new Set(conf.builds.map(x=>x.src));
  for(const p of ['index.html','app.js','gacha.html','gacha-page.js','api-register.js','api-status.js','api-checkin.js','api-gacha.js','community.html','music-gallery.html','mio-awakening.mp3','assets/mio-bg-princess.jpg'])
    assert(srcs.has(p),'missing build resource: '+p);
  assert(conf.routes.some(r=>r.src==='/'&&r.dest==='/index.html'));
  for(const route of ['/api/register','/api/status','/api/checkin','/api/gacha'])
    assert(conf.routes.some(r=>r.src===route&&r.dest===route.replace('/api/','/api-')+'.js'),'missing real protected route '+route);
  for(const id of ['register','attendanceSubmit','personal','counts','refresh'])
    assert(home.includes('id="'+id+'"'),'missing existing authenticated screen '+id);
  assert(home.includes('src="/app.js"'));
  assert(home.includes('href="/gacha.html"'));
});
test('community and gallery are deliberately read-only until backend approval',()=>{
  assert(home.includes('href="/community.html"')&&home.includes('href="/music-gallery.html"'));
  for(const p of ['community.html','music-gallery.html']){
    const c=read(p);
    assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|<form[\s>]/i.test(c),'unexpected data submission surface: '+p);
    assert(c.includes('準備中'),'not marked as non-operational: '+p);
  }
  assert(read('music-gallery.html').includes('src="/mio-awakening.mp3"'));
  assert(home.includes('登録名の一致のみで本人確認はできません'));
});
test('existing API enforces production only; client result follows server draw',()=>{
  const api=read('bridge.js');
  assert(api.includes("process.env.VERCEL_ENV!=='production'"));
  assert(api.includes("req.method!=='POST'"));
  assert(api.includes('timingSafeEqual'));
  assert(api.includes('SameSite=Lax'));
  const g=read('api-gacha.js');
  assert(g.includes("['catalog','draw','history']"));
  assert(g.includes('readSession('));
  assert(g.includes("body.drawId"));
  const ui=read('gacha-page.js');
  assert(ui.includes("post('/api/gacha'"));
  assert(ui.includes('pendingKey()'));
  assert(ui.includes('startEffect('));
  assert(ui.includes('5000'));
  assert(ui.includes('renderResult(d)'));
});
test('static routes never include exposed secrets',()=>{
  for(const p of ['index.html','community.html','music-gallery.html']){
    const text=read(p);
    assert(!/APPS_SCRIPT_SECRET|BRIDGE_SECRET|MIO_TEST_DATABASE_URL|MIO_TEST_AUTH_ENABLED/.test(text),'secret config leaked into '+p);
  }
});
