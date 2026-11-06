// MIO MUSEUM — real server-side pixel decoding + metadata-free re-encoding.
// Development module only: no HTTP handler, storage provider, DB pool, GAS,
// authorisation, publish permission, or production-route wiring.
// Never use the header preflight alone as proof an image is decodable.
// This consumes the narrow output of the browser encoder, not arbitrary files.
import sharp from 'sharp';
import {prepareMuseumImageIngestPreflightStage as preflight}
 from './museum-image-ingest-preflight-stage.mjs';

const OUTPUT_LIMIT=700_000;
const INPUT_PIXEL_LIMIT=1600*1600;
const MAX_SIDE=1600;
const fail=reason=>{throw Error('MUSEUM_MEDIA_REENCODE_'+reason)};
const safeSharp=(bytes)=>sharp(bytes,{
 failOn:'error',limitInputPixels:INPUT_PIXEL_LIMIT,
 limitInputChannels:4,sequentialRead:true,animated:false,
 pages:1,unlimited:false
});

export async function decodeAndReencodeMuseumImageStage(payload){
 // First check the magic bytes, strict declared dimensions/size, canonical
 // base64 and image-specific header constraints. This is not a pixel decoder.
 const source=preflight(payload);
 let metadata;
 try{
  metadata=await safeSharp(source.content).metadata();
 }catch{fail('INPUT_DECODE_FAILED')}
 if(metadata?.format!==source.format||metadata.width!==source.width||
    metadata.height!==source.height||metadata.pages>1||
    metadata.width*metadata.height>INPUT_PIXEL_LIMIT)
  fail('INPUT_FRAME_MISMATCH');
 // libvips fully decodes source pixels, reduces dimensions if necessary and
 // explicitly writes a brand-new WebP without preserving source metadata.
 // Fixed white canvas handles alpha, preventing unintended black backgrounds.
 let clean=null,cleanInfo=null;
 const attempts=[
  {side:1600,q:82},{side:1600,q:67},{side:1200,q:69},
  {side:900,q:63},{side:700,q:57},{side:520,q:48}
 ];
 for(const {side,q} of attempts){
  try{
   const result=await safeSharp(source.content)
    .resize({width:side,height:side,fit:'inside',withoutEnlargement:true})
    .flatten({background:'#ffffff'})
    .webp({quality:q,effort:4,lossless:false})
    .toBuffer({resolveWithObject:true});
   if(result.info.format!=='webp'||!Number.isSafeInteger(result.info.width)||
      !Number.isSafeInteger(result.info.height)||result.info.width<1||
      result.info.height<1||result.info.width>MAX_SIDE||
      result.info.height>MAX_SIDE||result.data.length<1)fail('OUTPUT_INVALID');
   if(result.data.length<=OUTPUT_LIMIT){clean=result.data;cleanInfo=result.info;break}
  }catch(error){
   if(error?.message?.startsWith('MUSEUM_MEDIA_REENCODE_'))throw error;
   fail('PIXEL_DECODE_OR_ENCODE_FAILED');
  }
 }
 if(!clean||!cleanInfo)fail('OUTPUT_SIZE_UNSATISFIED');
 // Validate the actual regenerated compressed bytes independently of libvips.
 const output=preflight({base64:clean.toString('base64'),
  format:'webp',bytes:clean.length,width:cleanInfo.width,height:cleanInfo.height});
 // Read the resulting image again; success requires a genuinely decodable
 // standalone output, not a format/size claim returned from an encoder.
 try{
  const confirmed=await safeSharp(output.content).metadata();
  if(confirmed.format!=='webp'||confirmed.width!==output.width||
    confirmed.height!==output.height||confirmed.pages>1||
    confirmed.exif||confirmed.xmp||confirmed.icc)fail('OUTPUT_METADATA_OR_FRAME_INVALID');
  const decoded=await safeSharp(output.content).raw().toBuffer({resolveWithObject:true});
  if(decoded.info.width!==output.width||decoded.info.height!==output.height||
     decoded.data.length<output.width*output.height*3)
   fail('OUTPUT_READBACK_INVALID');
 }catch(error){
  if(error?.message?.startsWith('MUSEUM_MEDIA_REENCODE_'))throw error;
  fail('OUTPUT_DECODE_FAILED');
 }
 // Keep the bytes only in memory for a future authenticated *private* store.
 // Never hand this object to browser clients or make it a public URL.
 return Object.freeze({format:'webp',contentType:'image/webp',
  width:output.width,height:output.height,bytes:output.bytes,
  sha256:output.sha256,content:Buffer.from(output.content)});
}
