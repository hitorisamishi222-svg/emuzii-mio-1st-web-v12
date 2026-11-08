// MIO MUSEUM — UNROUTED server-side image upload preflight (2026-11-06).
// No HTTP route, Blob write, database query, ownership claim, or public URL.
// This structural gate is NOT a decoder, malware scanner, approval, backup,
// server-side image re-encoder, or permission to enable a real upload.
// Require real owner/device auth, isolated media storage, restore exercise,
// rights/privacy approval and independently validated image decoding later.
import {createHash} from 'node:crypto';

const MAX_OUTPUT_BYTES=700_000;
const MAX_SIDE=1600;
const FIELDS=['base64','bytes','format','height','width'];
const fail=x=>{throw Error('MUSEUM_IMAGE_PREFLIGHT_'+x)};
const between=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const exactFields=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join(',')===FIELDS.join(',');
const EXIF_OR_COMMENT=new Set([0xe1,0xfe]);
const SOF=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
function jpegDimensions(b){
 if(b.length<26||b[0]!==0xff||b[1]!==0xd8||
   b[b.length-2]!==0xff||b[b.length-1]!==0xd9)fail('JPEG_STRUCTURE_INVALID');
 let pos=2,frame=null,scan=false;
 while(pos<b.length-2){
  if(b[pos++]!==0xff)fail('JPEG_SEGMENT_INVALID');
  while(b[pos]===0xff&&pos<b.length-2)pos++;
  const marker=b[pos++];
  if(marker===0xda){
   if(pos+2>b.length-2)fail('JPEG_SCAN_INVALID');
   const len=b.readUInt16BE(pos);
   if(len<6||pos+len>b.length-2)fail('JPEG_SCAN_INVALID');
   scan=true;break;
  }
  if(marker===0xd9||marker===0xd8||marker===0x00||
   marker>=0xd0&&marker<=0xd7)fail('JPEG_SEGMENT_INVALID');
  if(pos+2>b.length-2)fail('JPEG_SEGMENT_INVALID');
  const len=b.readUInt16BE(pos);pos+=2;
  if(len<2||pos+len-2>b.length-2)fail('JPEG_SEGMENT_INVALID');
  if(EXIF_OR_COMMENT.has(marker))fail('JPEG_METADATA_NOT_ALLOWED');
  if(SOF.has(marker)){
   if(frame||len<8||b[pos]!==8)fail('JPEG_FRAME_INVALID');
   frame={height:b.readUInt16BE(pos+1),width:b.readUInt16BE(pos+3)};
  }
  pos+=len-2;
 }
 if(!scan||!frame)fail('JPEG_FRAME_MISSING');
 return frame;
}
function webpDimensions(b){
 if(b.length<26||b.toString('ascii',0,4)!=='RIFF'||
  b.toString('ascii',8,12)!=='WEBP'||b.readUInt32LE(4)!==b.length-8)
  fail('WEBP_STRUCTURE_INVALID');
 let pos=12,ext=null,image=null,hasFrame=false;
 while(pos<b.length){
  if(pos+8>b.length)fail('WEBP_CHUNK_INVALID');
  const type=b.toString('ascii',pos,pos+4),len=b.readUInt32LE(pos+4);
  const start=pos+8,end=start+len;
  if(end>b.length||end+(len%2)>b.length)fail('WEBP_CHUNK_INVALID');
  if(type==='EXIF'||type==='XMP '||type==='ANIM'||type==='ANMF')
   fail('WEBP_METADATA_OR_ANIMATION_NOT_ALLOWED');
  if(type==='VP8X'){
   if(ext||len!==10)fail('WEBP_CHUNK_INVALID');
   // Canvas export is a still image. Animated frames are rejected.
   if(b[start]&0x02)fail('WEBP_METADATA_OR_ANIMATION_NOT_ALLOWED');
   ext={width:1+b[start+4]+(b[start+5]<<8)+(b[start+6]<<16),
    height:1+b[start+7]+(b[start+8]<<8)+(b[start+9]<<16)};
  }
  if(type==='VP8 '){
   if(hasFrame||len<10||b[start+3]!==0x9d||
      b[start+4]!==0x01||b[start+5]!==0x2a)fail('WEBP_FRAME_INVALID');
   image={width:b.readUInt16LE(start+6)&0x3fff,height:b.readUInt16LE(start+8)&0x3fff};
   hasFrame=true;
  }else if(type==='VP8L'){
   if(hasFrame||len<5||b[start]!==0x2f)fail('WEBP_FRAME_INVALID');
   image={width:1+b[start+1]+((b[start+2]&0x3f)<<8),
    height:1+((b[start+2]&0xc0)>>6)+(b[start+3]<<2)+((b[start+4]&0x0f)<<10)};
   hasFrame=true;
  }else if(!['VP8X','ALPH','ICCP'].includes(type))fail('WEBP_CHUNK_NOT_ALLOWED');
  pos=end+(len%2);
 }
 if(!hasFrame||pos!==b.length)fail('WEBP_FRAME_MISSING');
 if(ext&&(ext.width!==image.width||ext.height!==image.height))fail('WEBP_DIMENSION_CONFLICT');
 return image;
}
export function prepareMuseumImageIngestPreflightStage(payload){
 if(!exactFields(payload))fail('FIELDS_INVALID');
 if(!['webp','jpeg'].includes(payload.format))fail('FORMAT_INVALID');
 if(!between(payload.bytes,1,MAX_OUTPUT_BYTES))fail('BYTE_COUNT_INVALID');
 if(!between(payload.width,1,MAX_SIDE)||!between(payload.height,1,MAX_SIDE)||
    payload.width*payload.height>MAX_SIDE*MAX_SIDE)fail('DIMENSION_INVALID');
 if(typeof payload.base64!=='string'||payload.base64.length<20||
    payload.base64.length>Math.ceil(MAX_OUTPUT_BYTES/3)*4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.base64))
   fail('BASE64_INVALID');
 const content=Buffer.from(payload.base64,'base64');
 // Buffer.from is permissive by default; enforce canonical base64 round-trip.
 if(content.toString('base64')!==payload.base64)fail('BASE64_NONCANONICAL');
 if(content.length!==payload.bytes)fail('BYTE_COUNT_MISMATCH');
 const dimensions=payload.format==='webp'?webpDimensions(content):jpegDimensions(content);
 if(dimensions.width!==payload.width||dimensions.height!==payload.height)
  fail('DIMENSION_MISMATCH');
 const sha256=createHash('sha256').update(content).digest('hex');
 // Returned bytes are private in-process data, never an externally published URL.
 return Object.freeze({format:payload.format,
  contentType:payload.format==='webp'?'image/webp':'image/jpeg',
  bytes:content.length,width:dimensions.width,height:dimensions.height,
  sha256,content
 });
}
