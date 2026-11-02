'use strict';
// No network, storage, accounts, or API calls. Photos exist in this tab's memory only.
(function(){
 const $=id=>document.getElementById(id);
 let report={version:1,screen:null,synthetic:null,photo:null},previewUrl=null,busy=false;
 const messages={
  SOURCE_IMAGE_TOO_LARGE:'12MB以下の写真を選んでください。',
  SOURCE_FORMAT_NOT_ALLOWED:'この画像形式は確認できません。',
  IMAGE_DECODE_UNAVAILABLE:'この端末では画像を読み込めません。別の形式でお試しください。',
  INVALID_DIMENSIONS:'画像サイズを確認できません。',
  IMAGE_ENCODE_FAILED:'端末で画像を軽量化できません。',
  IMAGE_COMPRESS_FAILED:'画像の軽量化後も容量が大きすぎます。',
  IMAGE_READ_FAILED:'画像の読み込みに失敗しました。',
  CANVAS_UNAVAILABLE:'画像変換機能が利用できません。',
  IMAGE_ENCODER_UNAVAILABLE:'画像処理機能を読み込めません。'
 };
 const explain=e=>messages[e?.message]||'この端末で画像処理を完了できませんでした。';
 const detail=(label,value)=>{
  const dt=document.createElement('dt'),dd=document.createElement('dd');
  dt.textContent=label;dd.textContent=String(value);
  $('autoDetails').append(dt,dd);
 };
 const clear=()=>{
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
  $('photoPreview').removeAttribute('src');$('photoPreview').hidden=true;
 };
 const syntheticFile=async()=>{
  const canvas=document.createElement('canvas');
  canvas.width=500;canvas.height=350;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('CANVAS_UNAVAILABLE');
  ctx.fillStyle='#0e395d';ctx.fillRect(0,0,500,350);
  ctx.fillStyle='#f1d6a3';ctx.fillRect(70,70,360,200);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(
    x=>x?resolve(x):reject(Error('IMAGE_ENCODE_FAILED')),'image/jpeg',0.9
  ));
  canvas.width=0;canvas.height=0;
  return new File([blob],'local-diagnostic.jpg',{type:'image/jpeg'});
 };
 const supports=()=>Boolean(window.MioMuseumImage&&typeof window.MioMuseumImage.encode==='function');
 function updateButtons(){
  $('runAuto').disabled=busy;
  $('tryPhoto').disabled=busy||!$('localPhoto').files?.length;
  $('clearPhoto').disabled=busy||!$('localPhoto').files?.length&&!previewUrl;
  $('saveReport').disabled=busy||!report.screen;
 }
 async function runAuto(){
  if(busy)return;
  busy=true;updateButtons();$('autoStatus').textContent='画面と画像の動作を確認しています…';
  $('autoDetails').replaceChildren();
  $('autoDetails').hidden=true;
  const screen={
   viewportWidth:window.innerWidth,
   documentWidth:document.documentElement.scrollWidth,
   screenFits:document.documentElement.scrollWidth<=window.innerWidth+2,
   buttonHeight:Math.round($('runAuto').getBoundingClientRect().height),
   inputFontSize:parseFloat(getComputedStyle($('localPhoto')).fontSize)
  };
  screen.touchTarget=screen.buttonHeight>=48;
  screen.textSize=screen.inputFontSize>=16;
  report.screen=screen;
  try{
   if(!supports())throw Error('IMAGE_ENCODER_UNAVAILABLE');
   const result=await window.MioMuseumImage.encode(await syntheticFile());
   if(!result||result.bytes<=0||result.bytes>700000||!['webp','jpeg'].includes(result.format))
    throw Error('IMAGE_ENCODE_FAILED');
   report.synthetic={ok:true,format:result.format,outputBytes:result.bytes};
   const passed=screen.screenFits&&screen.touchTarget&&screen.textSize;
   $('autoStatus').textContent=passed?'✅ 画面・画像変換の自動確認が合格しました。':
    '⚠️ 画像変換は成功しましたが、画面サイズの確認に問題があります。';
  }catch(e){
   report.synthetic={ok:false,reason:e?.message||'UNKNOWN'};
   $('autoStatus').textContent='⚠️ 自動画像チェック未合格：'+explain(e);
  }finally{
   detail('画面の幅',screen.viewportWidth+'px');
   detail('必要な横幅',screen.documentWidth+'px');
   detail('保存ボタン相当の高さ',screen.buttonHeight+'px');
   detail('写真選択の文字サイズ',screen.inputFontSize+'px');
   detail('画像の変換',report.synthetic?.ok?'成功':'未合格');
   $('autoDetails').hidden=false;
   busy=false;updateButtons();
  }
 }
 const toPreview=(encoded)=>{
  const binary=atob(encoded.base64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const type=encoded.format==='webp'?'image/webp':'image/jpeg';
  return URL.createObjectURL(new Blob([bytes],{type}));
 };
 async function checkPhoto(){
  if(busy||!$('localPhoto').files?.length)return;
  busy=true;updateButtons();clear();
  $('photoStatus').textContent='写真を端末内で軽量化しています…';
  try{
   if(!supports())throw Error('IMAGE_ENCODER_UNAVAILABLE');
   const encoded=await window.MioMuseumImage.encode($('localPhoto').files[0]);
   previewUrl=toPreview(encoded);
   $('photoPreview').src=previewUrl;
   $('photoPreview').hidden=false;
   report.photo={ok:true,format:encoded.format,outputBytes:encoded.bytes};
   $('photoStatus').textContent='✅ 写真の変換に成功しました（'+Math.ceil(encoded.bytes/1024)+'KB）。画像は送信されていません。';
  }catch(e){
   report.photo={ok:false,reason:e?.message||'UNKNOWN'};
   $('photoStatus').textContent='⚠️ 写真確認は未合格：'+explain(e);
  }finally{busy=false;updateButtons();}
 }
 function saveReport(){
  if(!report.screen)return;
  // Only aggregate status data. Never include original photo names, contents or device identifiers.
  const minimal={
   schema:'mio-museum-device-check-v1',
   screen:report.screen,synthetic:report.synthetic,photo:report.photo,
   browserTestOnly:true,serverUploadTested:false,realAdminLoginTested:false
  };
  const blob=new Blob([JSON.stringify(minimal,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='mio-museum-device-check.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('reportStatus').textContent='確認結果の保存を指示しました。写真や端末の識別情報は含みません。';
 }
 $('runAuto').addEventListener('click',runAuto);
 $('tryPhoto').addEventListener('click',checkPhoto);
 $('localPhoto').addEventListener('change',()=>{
  clear();report.photo=null;
  $('photoStatus').textContent=$('localPhoto').files?.length?
   '写真が選ばれました。「選んだ写真を確認する」を押してください。':'未実施（任意）';
  updateButtons();
 });
 $('clearPhoto').addEventListener('click',()=>{
  clear();$('localPhoto').value='';report.photo=null;
  $('photoStatus').textContent='選択した画像を消しました。端末外に送信していません。';
  updateButtons();
 });
 $('saveReport').addEventListener('click',saveReport);
 window.addEventListener('pagehide',clear);
 updateButtons();
})();