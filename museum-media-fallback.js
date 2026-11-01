'use strict';
// Existing public video artwork may be moved by the gallery administrator.
// Restore the original local approved cover if the public thumbnail does not load.
// This is image-only; no API calls, cookies, session changes, or draw operations.
(()=>{
 const img=document.querySelector('[data-mio-video-thumb]');
 if(!img)return;
 const fallback='/assets/gallery-emuzii-mio-cover.svg';
 img.addEventListener('error',()=>{
  if(img.dataset.mioFallback==='true')return;
  img.dataset.mioFallback='true';
  img.src=fallback;
 });
})();
