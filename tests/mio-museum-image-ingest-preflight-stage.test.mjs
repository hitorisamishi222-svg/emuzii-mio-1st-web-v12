import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareMuseumImageIngestPreflightStage as prepare} from '../museum-image-ingest-preflight-stage.mjs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const webpChunk=(type,data)=>{
 const header=Buffer.alloc(8);
 header.write(type,0,4,'ascii');
 header.writeUInt32LE(data.length,4);
 return Buffer.concat([header,data,...(data.length%2?[Buffer.from([0])]:[])]);
};
const riff=(...chunks)=>{
 const payload=Buffer.concat([Buffer.from('WEBP','ascii'),...chunks]);
 const head=Buffer.alloc(8);
 head.write('RIFF',0,'ascii');head.writeUInt32LE(payload.length,4);
 return Buffer.concat([head,payload]);
};
const vp8=(width=3,height=2)=>{
 const b=Buffer.from([0,0,0,0x9d,1,0x2a,0,0,0,0]);
 b.writeUInt16LE(width,6);b.writeUInt16LE(height,8);
 return riff(webpChunk('VP8 ',b));
};
const vp8l=(width=3,height=2)=>{
 const w=width-1,h=height-1;
 return riff(webpChunk('VP8L',Buffer.from([
  0x2f,w&255,((w>>8)&0x3f)|((h&3)<<6),(h>>2)&255,(h>>10)&15
 ])));
};
const vp8x=(width=3,height=2)=>{
 const b=Buffer.alloc(10);
 const w=width-1,h=height-1;
 b[4]=w&255;b[5]=(w>>8)&255;b[6]=(w>>16)&255;
 b[7]=h&255;b[8]=(h>>8)&255;b[9]=(h>>16)&255;
 return webpChunk('VP8X',b);
};
const jpeg=()=>Buffer.from([
 0xff,0xd8,
 0xff,0xc0,0x00,0x11,0x08,0x00,0x02,0x00,0x03,
 0x03,0x01,0x11,0x00,0x02,0x11,0x01,0x03,0x11,0x01,
 0xff,0xda,0x00,0x08,0x01,0x01,0x00,0x00,0x3f,0x00,
 0x00,0xff,0xd9
]);
const wrap=(data,format,width=3,height=2)=>({
 base64:data.toString('base64'),format,bytes:data.length,width,height
});
test('encoded WEBP is canonical, has matching decoded dimensions, content hash, and no publication side effects',()=>{
 const data=vp8(),payload=wrap(data,'webp');
 const verified=prepare(payload);
 assert.deepEqual({
  format:verified.format,contentType:verified.contentType,
  width:verified.width,height:verified.height,bytes:verified.bytes
 },{format:'webp',contentType:'image/webp',width:3,height:2,bytes:data.length});
 assert.equal(verified.sha256,createHash('sha256').update(data).digest('hex'));
 assert.ok(verified.content.equals(data));
 assert.ok(Object.isFrozen(verified));
 assert.equal(payload.imageUrl,undefined);
});
test('lossless WEBP and extended still-image WEBP accept exact frame headers',()=>{
 for(const data of [vp8l(),riff(vp8x(),webpChunk('VP8 ',vp8().subarray(20)))]) {
  const x=prepare(wrap(data,'webp'));
  assert.equal(x.width,3);assert.equal(x.height,2);
 }
});
test('JPEG fallback from Safari must contain a JPEG frame, not only a client-declared format',()=>{
 const good=jpeg(),x=prepare(wrap(good,'jpeg'));
 assert.equal(x.contentType,'image/jpeg');
 assert.equal(x.sha256,createHash('sha256').update(good).digest('hex'));
});
test('client cannot provide arbitrary URLs, auth tokens, publication states or owner identities',()=>{
 for(const rogue of [
  {imageUrl:'https://example.invalid/image.png'},
  {isPublished:true},
  {admin:true},
  {ownerId:'pretend'},
  {deviceId:'pretend'},
  {storageBucket:'production'},
  {token:'secret'},
  {imageUrl:'/assets/hijacked.png'}
 ])assert.throws(()=>prepare({...wrap(vp8(),'webp'),...rogue}),/FIELDS_INVALID/);
});
test('malformed base64, overlong payload and permissive Buffer decoding must fail closed',()=>{
 const normal=wrap(vp8(),'webp');
 for(const base64 of ['YWJj\n',normal.base64+'=',normal.base64.slice(0,-1),
  normal.base64.replace(/A/,'-'),'aa','',normal.base64+'Z',
  'A'.repeat(933340),null]){
  assert.throws(()=>prepare({...normal,base64}),/BASE64_/);
 }
});
test('size, 1600px maximum dimensions and declared format are strict',()=>{
 const p=wrap(vp8(),'webp');
 for(const item of [
  {...p,bytes:0},{...p,bytes:700001},{...p,bytes:undefined},
  {...p,bytes:p.bytes+1},{...p,bytes:1.5},
  {...p,width:1601},{...p,height:1601},{...p,width:0},{...p,height:-1},
  {...p,width:2},{...p,height:3},{...p,format:'png'},
  {...p,format:'jpeg'},{...p,format:'WEBP'}
 ])assert.throws(()=>prepare(item),/MUSEUM_IMAGE_PREFLIGHT_/);
});
test('RIFF length, payload truncation, trailing garbage and conflicting dimensions are rejected',()=>{
 const data=vp8();
 const variants=[
  data.subarray(0,data.length-1),
  Buffer.concat([data,Buffer.from('evil')]),
  Buffer.from(data),
  riff(vp8x(4,2),webpChunk('VP8 ',data.subarray(20)))
 ];
 variants[2].writeUInt32LE(9999,4);
 for(const b of variants)assert.throws(()=>prepare(wrap(b,'webp')),/MUSEUM_IMAGE_PREFLIGHT_/);
});
test('EXIF/XMP/animated WEBP and JPEG EXIF/comment segments cannot silently enter storage',()=>{
 const base=vp8().subarray(20);
 for(const type of ['EXIF','XMP ','ANIM','ANMF']){
  const content=riff(webpChunk(type,Buffer.from([1,2])),webpChunk('VP8 ',base));
  assert.throws(()=>prepare(wrap(content,'webp')),/METADATA_OR_ANIMATION_NOT_ALLOWED/);
 }
 const j=jpeg();
 for(const segment of [
  Buffer.from([0xff,0xe1,0,8,0x45,0x78,0x69,0x66,0,0]),
  Buffer.from([0xff,0xfe,0,4,0x12,0x34])
 ]){
  const injected=Buffer.concat([j.subarray(0,2),segment,j.subarray(2)]);
  assert.throws(()=>prepare(wrap(injected,'jpeg')),/JPEG_METADATA_NOT_ALLOWED/);
 }
});
test('unsupported chunks, duplicate WEBP frame and wrong declared media type fail closed',()=>{
 const base=vp8().subarray(20);
 const cases=[
  riff(webpChunk('BAD!',Buffer.from([1,2])),webpChunk('VP8 ',base)),
  riff(webpChunk('VP8 ',base),webpChunk('VP8 ',base)),
  riff(webpChunk('VP8X',Buffer.alloc(9)),webpChunk('VP8 ',base)),
  riff(webpChunk('VP8 ',Buffer.alloc(6)))
 ];
 for(const value of cases)assert.throws(()=>prepare(wrap(value,'webp')),/MUSEUM_IMAGE_PREFLIGHT_/);
 assert.throws(()=>prepare(wrap(jpeg(),'webp')),/WEBP_/);
});
test('preflight stays unrouted and cannot itself persist or publish an image',()=>{
 const src=read('museum-image-ingest-preflight-stage.mjs');
 assert.doesNotMatch(src,/\b(fetch|XMLHttpRequest|app\.post|server\.post)\s*\(|BlobStore|S3Client|pool\.query|client\.query|process\.env|document\.cookie|localStorage/);
 const config=JSON.parse(read('vercel.json'));
 assert.equal(config.builds.some(x=>x.src==='museum-image-ingest-preflight-stage.mjs'),false);
 assert.equal(config.routes.some(x=>x.src?.includes('museum-image-ingest')),false);
 assert.match(read('museum-exhibit-ui-contract-stage.mjs'),/imageUrl:''/);
 assert.doesNotMatch(read('museum-curator-preview.js'),/fetch\s*\(|XMLHttpRequest/);
});
