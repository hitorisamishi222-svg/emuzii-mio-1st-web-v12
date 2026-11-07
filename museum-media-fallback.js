'use strict';
// Existing public video artwork may be moved by the gallery administrator.
// Restore the original local approved cover if the public thumbnail does not load.
// This is image-only; no API calls, cookies, session changes, or draw operations.
(()=>{
 const img=document.querySelector('[data-mio-video-thumb]');
 if(!img)return;
 const fallback='/assets/gallery-emuzii-mio-cover.svg';
 const restore=()=>{
  if(img.dataset.mioFallback==='true')return;
  img.dataset.mioFallback='true';
  img.src=fallback;
 };
 img.addEventListener('error',restore);
 // If the browser has already completed a failed image fetch before this
 // defer script initializes, the error event may already have been missed.
 if(img.complete===true&&img.naturalWidth===0)restore();
})();
