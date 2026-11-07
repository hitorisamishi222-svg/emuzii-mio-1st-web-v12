import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import sharp from 'sharp';
import {decodeAndReencodeMuseumImageStage as rewrite} from '../museum-media-decode-reencode-stage.mjs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const payload=(data,format,extra={})=>({base64:data.toString('base64'),
 format,bytes:data.length,width:extra.width||64,height:extra.height||40});
const webp=async(opts={})=>sharp({create:{
 width:opts.width||64,height:opts.height||40,channels:4,
 background:{r:50,g:100,b:140,alpha:0.35}
}}).webp({quality:82}).toBuffer();
const jpeg=async()=>sharp({create:{width:64,height:40,channels:3,
 background:'#1a6aaa'}}).jpeg({quality:85}).toBuffer();

test('Sharp truly decodes browser WebP pixels, re-encodes new standalone image, and hashes correct bytes',async()=>{
 const input=await webp(),src=payload(input,'webp');
 const output=await rewrite(src);
 assert.equal(output.format,'webp');
 assert.equal(output.contentType,'image/webp');
 assert.equal(output.width,64);
 assert.equal(output.height,40);
 assert.ok(output.bytes>0&&output.bytes<=700_000);
 assert.ok(Buffer.isBuffer(output.content));
 assert.notEqual(output.content.toString('hex'),input.toString('hex'));
 assert.equal(output.sha256,createHash('sha256').update(output.content).digest('hex'));
 assert.equal(output.content.length,output.bytes);
 assert.equal(Object.isFrozen(output),true);
 for(const forbidden of ['publicUrl','url','storageKey','ownerId','approved','published','imageUrl'])
  assert.equal(Object.hasOwn(output,forbidden),false);
 const meta=await sharp(output.content).metadata();
 assert.equal(meta.format,'webp');
 assert.equal(meta.width,64);assert.equal(meta.height,40);
 assert.equal(meta.exif,undefined);assert.equal(meta.xmp,undefined);
 assert.equal(meta.icc,undefined);
 const decoded=await sharp(output.content).raw().toBuffer({resolveWithObject:true});
 assert.equal(decoded.info.channels,3,'alpha must be flattened to a known white background');
 assert.equal(decoded.data.length,64*40*3);
});

test('valid Safari JPEG fallback is decoded and converted to metadata-free WebP',async()=>{
 const input=await jpeg(),out=await rewrite(payload(input,'jpeg'));
 assert.equal(out.format,'webp');
 assert.equal(out.width,64);
 assert.equal(out.height,40);
 const meta=await sharp(out.content).metadata();
 assert.equal(meta.format,'webp');
 assert.equal(meta.exif,undefined);
 assert.equal(meta.xmp,undefined);
 assert.equal(meta.icc,undefined);
});

test('input declaring format, image size or byte count incorrectly is rejected',async()=>{
 const input=await webp(),src=payload(input,'webp');
 for(const bad of [
  {...src,format:'jpeg'},{...src,bytes:src.bytes+1},
  {...src,width:65},{...src,height:41},{...src,bytes:0},
  {...src,width:1601},{...src,height:1601},
  {...src,publicUrl:'https://example.com/foo.webp'},
  {...src,clientApproved:true}
 ])await assert.rejects(rewrite(bad),/MUSEUM_IMAGE_PREFLIGHT_/);
});

test('header-only fake VP8 frame is not a complete image and cannot pass full pixel decoding',async()=>{
 // Deliberately like the early unit-test fake: structural header without
 // compressed pixel stream. The preflight can pass; Sharp MUST refuse it.
 const bytes=Buffer.from([
  0x52,0x49,0x46,0x46,0x16,0,0,0,0x57,0x45,0x42,0x50,
  0x56,0x50,0x38,0x20,10,0,0,0,0,0,0,0x9d,0x01,0x2a,0x40,0,0x28,0
 ]);
 await assert.rejects(rewrite(payload(bytes,'webp')),
  /MUSEUM_MEDIA_REENCODE_INPUT_DECODE_FAILED|MUSEUM_MEDIA_REENCODE_PIXEL_DECODE_OR_ENCODE_FAILED/);
});

test('EXIF-bearing JPEG and forged format must fail before recording any artwork',async()=>{
 let input=await jpeg();
 // An APP1 metadata segment is forbidden even if Sharp can decode it.
 const exif=Buffer.from([0xff,0xe1,0,8,0x45,0x78,0x69,0x66,0,0]);
 input=Buffer.concat([input.subarray(0,2),exif,input.subarray(2)]);
 await assert.rejects(rewrite(payload(input,'jpeg')),/MUSEUM_IMAGE_PREFLIGHT_JPEG_METADATA_NOT_ALLOWED/);
});

test('bounded near-maximum dimensions are preserved and are checked after output decoding',async()=>{
 const input=await webp({width:1599,height:120});
 const result=await rewrite(payload(input,'webp',{width:1599,height:120}));
 assert.equal(result.width,1599);
 assert.equal(result.height,120);
 assert.ok(result.bytes<=700_000);
});

test('no GIF, PNG, animated, or oversized untrusted input is converted by this webp/jpeg path',async()=>{
 const src=payload(await webp(),'webp');
 for(const alt of ['gif','png','heic','avif']){
  await assert.rejects(rewrite({...src,format:alt}),/MUSEUM_IMAGE_PREFLIGHT_FORMAT_INVALID/);
 }
 const content=Buffer.alloc(700001);
 await assert.rejects(rewrite({base64:content.toString('base64'),bytes:content.length,
  width:100,height:100,format:'webp'}),/MUSEUM_IMAGE_PREFLIGHT_BYTE_COUNT_INVALID/);
});

test('random image has no silent unbounded decompression or output-size pass',async()=>{
 const w=400,h=290,pixels=randomBytes(w*h*3);
 const input=await sharp(pixels,{raw:{width:w,height:h,channels:3}})
  .webp({quality:12,effort:3}).toBuffer();
 if(input.length>700000)throw Error('Fixture input exceeds browser output limit');
 const result=await rewrite(payload(input,'webp',{width:w,height:h}));
 assert.equal(result.width,w);assert.equal(result.height,h);
 assert.ok(result.bytes>0&&result.bytes<=700_000);
});

test('image rewrite does not expose storage/network/auth and remains un-routed until release gates',()=>{
 const src=read('museum-media-decode-reencode-stage.mjs');
 const conf=JSON.parse(read('vercel.json'));
 assert.equal(JSON.parse(read('package.json')).dependencies.sharp,'0.35.5');
 assert.match(src,/import sharp from 'sharp'/);
 assert.match(src,/limitInputPixels:INPUT_PIXEL_LIMIT/);
 assert.match(src,/.raw\(\)\.toBuffer/);
 assert.doesNotMatch(src,/\b(fetch|XMLHttpRequest|request|listen|connect)\s*\(|process\.env|GALLERY_DATABASE_URL|BRIDGE_SECRET|mio_gacha_|museum_exhibit_draft_operations_stage|keepMetadata|withMetadata|toFile\(/);
 assert.equal(conf.builds.some(x=>x.src==='museum-media-decode-reencode-stage.mjs'),false);
 assert.equal(conf.routes.some(x=>x.src?.includes('museum-media-decode-reencode')),false);
});
