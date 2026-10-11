/* Approved-design integration layer, preview only. Existing backend is untouched. */
const stage=document.getElementById('gachaStage');
if(stage&&!stage.dataset.whaleV3){
 stage.dataset.whaleV3='ready';
 const machine=stage.querySelector('.v19-machine-img');
 const hopper=stage.querySelector('.v191-ball-chamber');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const sync=()=>{
  const img=stage.querySelector('.v19-machine-img');
  if(!img)return;
  // The approved art is an asset dependency, never silently substitute an unrelated drawing.
  const approved='/mio-whale-approved.webp';
  const probe=new Image();
  probe.onload=()=>{if(!img.isConnected)return;img.src=approved;stage.classList.add('whale-v3-approved');};
  probe.onerror=()=>{stage.classList.remove('whale-v3-approved');};
  probe.src=approved;
 };
 const observer=new MutationObserver(()=>{if(stage.classList.contains('draw-active'))stage.classList.add('whale-v3-running');else stage.classList.remove('whale-v3-running');});
 observer.observe(stage,{attributes:true,attributeFilter:['class']});
 window.addEventListener('mio:gacha-result-shown',()=>{stage.classList.remove('whale-v3-running');stage.classList.add('whale-v3-result');},{passive:true});
 window.addEventListener('mio:gacha-animation-start',()=>{stage.classList.remove('whale-v3-result');},{passive:true});
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 sync();
}
