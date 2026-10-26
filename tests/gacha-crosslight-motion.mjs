/**
 * New gacha-only spotlight choreography check: opposite beams, direction
 * reversals, reduced-motion fallback, and demo not calling draw APIs.
 * Runs against local assets, never against production.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const root='http://127.0.0.1:8765/gacha.html?deluxeDemo=1';
const signs=list=>new Set(list.map(a=>Math.sign(a))).size>1;
async function open({reducedMotion='no-preference'}={}){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion});
 const errors=[],api=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/api/gacha'))api.push(r.url())});
 await page.goto(root,{waitUntil:'load'});
 await page.locator('.mio-deluxe-demo-actions button').first().click();
 await page.locator('#gachaStage.draw-active').waitFor({state:'attached'});
 return {page,errors,api};
}
try{
 const {page,errors,api}=await open();
 try {
  const sample=await page.evaluate(()=>{
   const el=document.querySelector('#gachaStage .stage-lights');
   const styles={bed:getComputedStyle(el),left:getComputedStyle(el,'::before'),right:getComputedStyle(el,'::after')};
   const names={bed:styles.bed.animationName,left:styles.left.animationName,right:styles.right.animationName};
   const animations=el.getAnimations({subtree:false}).filter(a=>a.animationName&&a.animationName.startsWith('mio-crosslight-'));
   const angle=pseudo=>{
    const x=getComputedStyle(el,pseudo).transform;
    if(x==='none')return 0;
    const m=new DOMMatrixReadOnly(x);
    return Math.atan2(m.b,m.a)*180/Math.PI;
   };
   const out={names,animations:animations.map(x=>({name:x.animationName,pseudo:x.effect?.pseudoElement||''})),bed:[],left:[],right:[]};
   animations.forEach(a=>a.pause());
   const frames=[[0,0],[900,1000],[1900,2300],[2700,3500]];
   for (const [beamT,bedT] of frames) {
    for(const a of animations){
     a.currentTime=a.animationName==='mio-crosslight-bed'?bedT:beamT;
    }
    out.bed.push(angle(null));
    out.left.push(angle('::before'));
    out.right.push(angle('::after'));
   }
   return out;
  });
  assert.equal(sample.names.bed,'mio-crosslight-bed');
  assert.equal(sample.names.left,'mio-crosslight-left');
  assert.equal(sample.names.right,'mio-crosslight-right');
  assert.equal(sample.animations.length,3,'three independent timed light layers');
  assert.ok(signs(sample.bed),'base beam direction reverses: '+JSON.stringify(sample.bed));
  assert.ok(signs(sample.left),'blue beam crosses both sides: '+JSON.stringify(sample.left));
  assert.ok(signs(sample.right),'gold beam crosses both sides: '+JSON.stringify(sample.right));
  assert.ok(Math.sign(sample.left[0])!==Math.sign(sample.right[0]),'opposing directions at start');
  assert.deepEqual(errors,[]);
  assert.equal(api.length,0);
  await page.locator('.mio-deluxe-demo-skip').click();
  assert.equal(await page.locator('#gachaStage').evaluate(x=>x.classList.contains('draw-active')),false);
  console.log('GACHA_CROSSLIGHT PASS: opposing beams, repeated direction changes, skip and no API');
 }finally{await page.close()}
 const reduced=await open({reducedMotion:'reduce'});
 try {
  const styles=await reduced.page.locator('#gachaStage .stage-lights').evaluate(el=>({
   bed:getComputedStyle(el).animationName,
   left:getComputedStyle(el,'::before').animationName,
   right:getComputedStyle(el,'::after').animationName
  }));
  assert.deepEqual(styles,{bed:'none',left:'none',right:'none'},'reduced-motion cancels all spotlight motion');
  assert.equal(reduced.api.length,0);
  assert.deepEqual(reduced.errors,[]);
  console.log('GACHA_CROSSLIGHT_REDUCED_MOTION PASS');
 }finally{await reduced.page.close()}
}finally{await browser.close()}
