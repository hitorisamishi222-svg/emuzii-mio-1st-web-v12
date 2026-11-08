'use strict';
// Opt-in: load this file only in owner management UI or local-only device check, not public museum pages.
// Converts photos locally (metadata/EXIF is not copied) before submit.
(function(){
 const MAX_SOURCE=12*1024*1024;
 const MAX_OUTPUT=700_000;
 const waitImage=file=>new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>resolve({img,url});
  img.onerror=()=>{
   URL.revokeObjectURL(url);
   reject(new Error('IMAGE_DECODE_UNAVAILABLE'));
  };
  img.src=url;
 });
 const toBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>{
   if(blob&&blob.size>0)resolve(blob);
   else reject(new Error('IMAGE_ENCODE_FAILED'));
  },type,quality);
 });
 const base64=blob=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>{const str=String(reader.result||'');resolve(str.slice(str.indexOf(',')+1));};
  reader.onerror=()=>reject(new Error('IMAGE_READ_FAILED'));
  reader.readAsDataURL(blob);
 });
 async function encode(file){
  if(!(file instanceof File)||file.size<=0||file.size>MAX_SOURCE)throw Error('SOURCE_IMAGE_TOO_LARGE');
  if(!/^image\/(?:jpe?g|png|webp|heic|heif)$/i.test(file.type)&&
     !/\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name))throw Error('SOURCE_FORMAT_NOT_ALLOWED');
  const {img,url}=await waitImage(file);
  try{
   if(!img.naturalWidth||!img.naturalHeight)throw Error('INVALID_DIMENSIONS');
   for(const maxSide of [1600,1200,900]){
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    const width=Math.max(1,Math.round(img.naturalWidth*scale));
    const height=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    try{
     const ctx=canvas.getContext('2d');
     if(!ctx)throw Error('CANVAS_UNAVAILABLE');
     ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height); // transparent source -> neutral background
     ctx.drawImage(img,0,0,width,height);
     for(const quality of [0.83,0.68,0.53]){
      // Some iOS Safari versions return a null Blob when WebP encoding is
      // unsupported. Try JPEG rather than failing the entire local photo check.
      let blob=null,format='webp';
      try{blob=await toBlob(canvas,'image/webp',quality)}
      catch(e){if(e?.message!=='IMAGE_ENCODE_FAILED')throw e}
      if(!blob||blob.type!=='image/webp'){
       blob=await toBlob(canvas,'image/jpeg',quality);
       format='jpeg';
      }
      if(blob.size<=MAX_OUTPUT){
       return {base64:await base64(blob),format,bytes:blob.size,width,height};
      }
     }
    }finally{
     // iOS Safari may retain the backing store until the canvas dimensions are reset.
     // This must run even when a successful conversion returns early or encoding throws.
     canvas.width=0;canvas.height=0;
    }
   }
   throw Error('IMAGE_COMPRESS_FAILED');
  }finally{URL.revokeObjectURL(url);}
 }
 window.MioMuseumImage=Object.freeze({encode});
})();