/* Preview only. Remove the background class if an approved image fails to load. */
(()=>{'use strict';
 const scripts=document.querySelectorAll('script[src$="/mio-approved-background-guard.js"]');
 const script=document.currentScript||scripts[scripts.length-1];
 const mode=script?.dataset.mode==='event'?'event':'normal';
 const path=mode==='event'?'/assets/mio-bg-devil.jpg':'/assets/mio-bg-princess.jpg';
 const activate=()=>{
  if(!document.body){document.addEventListener('DOMContentLoaded',activate,{once:true});return;}
  document.body.classList.add('mio-approved-bg');
  if(mode==='event')document.body.classList.add('mio-event-bg');
  const image=new Image();
  image.onload=()=>{if(image.naturalWidth<100||image.naturalHeight<100){document.body.classList.remove('mio-approved-bg','mio-event-bg')}};
  image.onerror=()=>{document.body.classList.remove('mio-approved-bg','mio-event-bg');console.warn('Approved MIO background is not deployed:',path)};
  image.src=path;
 };
 activate();
})();
