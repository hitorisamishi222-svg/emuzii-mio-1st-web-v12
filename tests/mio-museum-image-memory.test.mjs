import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../museum-image-client.js',import.meta.url),'utf8');

function sandbox({mode='success'}={}){
 const canvases=[],revoked=[],formats=[];
 class FakeFile{
  constructor(parts,name,{type}={}){this.size=parts.length;this.name=name;this.type=type||'image/jpeg'}
 }
 class FakeImage{
  naturalWidth=2400;naturalHeight=1800;
  set src(v){this.url=v;queueMicrotask(()=>this.onload?.())}
 }
 class FakeReader{
  readAsDataURL(){this.result='data:image/webp;base64,YWJj';queueMicrotask(()=>this.onload?.())}
 }
 const document={createElement(tag){
  assert.equal(tag,'canvas');
  const c={width:0,height:0,toBlob(callback,type){
   formats.push(type);
   const unavailable=mode==='throw'||(mode==='safari-webp-null'&&type==='image/webp');
   queueMicrotask(()=>callback(unavailable?null:{
    type:mode==='safari-webp-as-jpeg'?'image/jpeg':type,
    size:mode==='oversized'?800000:150
   }));
  },getContext(){return {fillRect(){},drawImage(){},set fillStyle(_) {}}}};
  canvases.push(c);return c;
 }};
 const window={},mockUrl={createObjectURL:()=>('blob:local-input'),revokeObjectURL:url=>revoked.push(url)};
 runInNewContext(source,{window,document,URL:mockUrl,File:FakeFile,FileReader:FakeReader,Image:FakeImage,queueMicrotask});
 return {encode:window.MioMuseumImage.encode,File:FakeFile,canvases,revoked,formats};
}
const photo=s=>new s.File(['x'],'image.png',{type:'image/png'});

test('successful photo encoding releases every backing canvas before returning',async()=>{
 const s=sandbox(),r=await s.encode(photo(s));
 assert.equal(r.format,'webp');
 assert.equal(r.bytes,150);
 assert.equal(s.canvases.length,1);
 assert.deepEqual(s.canvases.map(c=>[c.width,c.height]),[[0,0]]);
 assert.deepEqual(s.revoked,['blob:local-input']);
});
test('image encoder failure releases canvas and image URL before rejecting',async()=>{
 const s=sandbox({mode:'throw'});
 await assert.rejects(s.encode(photo(s)),/IMAGE_ENCODE_FAILED/);
 assert.deepEqual(s.canvases.map(c=>[c.width,c.height]),[[0,0]]);
 assert.deepEqual(s.revoked,['blob:local-input']);
});
test('oversized images release all three canvases after retries',async()=>{
 const s=sandbox({mode:'oversized'});
 await assert.rejects(s.encode(photo(s)),/IMAGE_COMPRESS_FAILED/);
 assert.equal(s.canvases.length,3);
 assert.deepEqual(s.canvases.map(c=>[c.width,c.height]),[[0,0],[0,0],[0,0]]);
 assert.deepEqual(s.revoked,['blob:local-input']);
});
test('multiple image conversions never retain a finished canvas',async()=>{
 const s=sandbox();
 for(let i=0;i<5;i++){
  await s.encode(photo(s));
  assert.ok(s.canvases.every(c=>c.width===0&&c.height===0));
 }
 assert.equal(s.revoked.length,5);
});

test('Safari WebP null Blob falls back to JPEG and frees backing memory',async()=>{
 const s=sandbox({mode:'safari-webp-null'});
 const r=await s.encode(photo(s));
 assert.equal(r.format,'jpeg');
 assert.equal(r.bytes,150);
 assert.deepEqual(s.formats,['image/webp','image/jpeg']);
 assert.deepEqual(s.canvases.map(c=>[c.width,c.height]),[[0,0]]);
 assert.deepEqual(s.revoked,['blob:local-input']);
});
test('browser returning a JPEG Blob for WebP request is safely re-encoded as JPEG',async()=>{
 const s=sandbox({mode:'safari-webp-as-jpeg'});
 const r=await s.encode(photo(s));
 assert.equal(r.format,'jpeg');
 assert.deepEqual(s.formats,['image/webp','image/jpeg']);
 assert.deepEqual(s.canvases.map(c=>[c.width,c.height]),[[0,0]]);
});
