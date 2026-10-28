'use strict';
// vNext: apply only to pages that explicitly opt in.
// Existing princess/devil artwork stays in the repository; no gacha changes.
(async()=>{
 const roots=document.querySelectorAll('[data-mio-background]');
 if(!roots.length)return;
 try{
  const response=await fetch('/api/background',{credentials:'omit',cache:'no-store'});
  if(!response.ok)return;
  const data=await response.json();
  if(data.ok!==true||!['princess','devil'].includes(data.theme))return;
  const imagePath=data.theme==='devil'?'/assets/mio-bg-devil.jpg':'/assets/mio-bg-princess.jpg';
  // Preserve the image's layout rather than hiding it (which leaves a blank picture).
  const picture=document.querySelector('.hero-picture');
  if(picture){
   for(const source of picture.querySelectorAll('source'))source.srcset=imagePath;
   const img=picture.querySelector('img');
   if(img&&img.getAttribute('src')!==imagePath)img.setAttribute('src',imagePath);
  }
  const banner=document.querySelector('.mio-art-banner');
  if(banner)banner.setAttribute('aria-label',data.theme==='devil'?'翠央の魔王背景イラスト':'翠央のお姫様背景イラスト');
  for(const root of roots)root.dataset.mioBackground=data.theme;
 }catch{/* Network errors preserve the existing princess design. */}
})();
