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
  const sample={names:null,bed:[],left:[],right:[]};
  for(let frame=0;frame<7;frame++){
   const current=await page.evaluate(()=>{
    const el=document.querySelector('#gachaStage .stage-lights');
    const styles={bed:getComputedStyle(el),left:getComputedStyle(el,'::before'),right:getComputedStyle(el,'::after')};
    const angle=pseudo=>{
     const matrix=getComputedStyle(el,pseudo).transform;
     if(matrix==='none')return 0;
     const m=new DOMMatrixReadOnly(matrix);
     return Math.atan2(m.b,m.a)*180/Math.PI;
    };
    return {names:{bed:styles.bed.animationName,left:styles.left.animationName,right:styles.right.animationName},
      bed:angle(null),left:angle('::before'),right:angle('::after')};
   });
   sample.names=current.names;
   sample.bed.push(current.bed);
   sample.left.push(current.left);
   sample.right.push(current.right);
   if(frame<6)await page.waitForTimeout(610);
  }
  assert.equal(sample.names.bed,'mio-crosslight-bed');
  assert.equal(sample.names.left,'mio-crosslight-left');
  assert.equal(sample.names.right,'mio-crosslight-right');
  assert.ok(sample.bed.length===7,'seven actual rendered light frames checked');
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
