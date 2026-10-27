'use strict';
(async()=>{
 const roots=document.querySelectorAll('[data-mio-background]');
 if(!roots.length)return;
 try{
  const response=await fetch('/api/background',{credentials:'omit',cache:'no-store'});
  if(!response.ok)return;
  const data=await response.json();
  if(data.ok!==true||!['princess','devil'].includes(data.theme))return;
  for(const root of roots)root.dataset.mioBackground=data.theme;
 }catch{/* Keep original design on network errors. */}
})();