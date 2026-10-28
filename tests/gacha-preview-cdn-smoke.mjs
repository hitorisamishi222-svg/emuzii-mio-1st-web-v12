// Read-only CDN inspection. NEVER touches /api/* or live participant data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=process.env.GACHA_PREVIEW_ORIGIN||
  'https://emuzii-mio-1st-web-v12-git-release-gacha-54b53b-gtgz8867jh-3139.vercel.app';
const origin=new URL(base);
assert.equal(origin.protocol,'https:');
assert.match(origin.hostname,/^emuzii-mio-1st-web-v12-git-release-gacha-[a-z0-9-]+\.vercel\.app$/);
const fixture=JSON.parse(readFileSync(new URL('../gacha-prize-demo-catalog.json',import.meta.url),'utf8'));
assert.equal(fixture.prizes.length,27);
async function get(relative){
  assert.ok(relative.startsWith('/')&&!relative.includes('/api/'),'Static files only');
  const response=await fetch(new URL(relative,origin),{redirect:'follow',
    signal:AbortSignal.timeout(12000),headers:{Accept:'*/*'}});
  if(!response.ok)throw Error(relative+' returned HTTP '+response.status);
  return {body:Buffer.from(await response.arrayBuffer()),type:response.headers.get('content-type')||''};
}
const required=['/gacha.html','/gacha-deluxe-v21.css',
  '/gacha-deluxe-v21.js','/assets/mio-undersea-palace-stage.svg'];
for(const asset of required){
  const {body}=await get(asset);
  assert.ok(body.length>100,asset+' empty/truncated');
  console.log('STATIC_OK '+asset+' '+body.length);
}
const js=(await get('/gacha-deluxe-v21.js')).body.toString('utf8');
assert.ok(js.includes('PREVIEW_SNAPSHOT'),'CDN preview still uses old network-dependent build');
assert.ok(js.includes('mioPrizeClose'),'CDN overlay script not present');
for(const [index,p] of fixture.prizes.entries()){
  const {body}=await get(p.image);
  assert.ok(body.length>100,p.image+' truncated');
  assert.equal(body[0],0xff,p.image+' not JPEG');
  assert.equal(body[1],0xd8,p.image+' not JPEG');
  assert.equal(body[2],0xff,p.image+' not JPEG');
  console.log('IMAGE_OK '+(index+1)+'/27 '+p.id+' '+body.length);
}
console.log('PASS: preview CDN serves HTML/CSS/JS/art and all 27 JPEG assets; no draw endpoints contacted.');
