'use strict';
// Local-only conservative GAS source inspection. NEVER evaluate imported source.
(function(){
 const OPS=['mioAdminOps_','mioAdminOpsStr_','mioAdminOpsName_','mioAdminOpsSheet_',
 'mioAdminOpsValues_','mioAdminOpsOne_','mioAdminOpsPeople_','mioAdminOpsSummary_',
 'mioAdminOpsRead_','mioAdminOpsRequest_','mioAdminOpsLog_','mioAdminOpsExisting_',
 'mioAdminOpsWriteLog_','mioAdminOpsCreate_','mioAdminOpsApprove_',
 'mioAdminOpsRecordGrant_','mioAdminOpsGrant_','mioAdminOpsReview_','mioAdminOpsIntake_'];
 const reasons={
  DO_POST_COUNT_NOT_ONE:'doPost の定義数が1件ではありません。',
  DUPLICATE_FUNCTION_DECLARATIONS:'同じ関数名が複数のファイルや位置で定義されています。',
  PARTIAL_ADMIN_FUNCTIONS:'Web管理に必要な19関数の一部だけが見つかりました。',
  DISPATCH_FUNCTION_MISMATCH:'doPost内の管理ルートと管理関数の構成が一致しません。',
  DISPATCH_WITHOUT_CONFIRMED_LOCK_OR_SECRET_ORDER:'管理処理より前の秘密鍵検査・ロック・失敗時停止を確認できません。',
  LIVE_ADMIN_OPS_MISSING:'管理19関数が見つかりません。稼働GASへの追加可否は未判断です。',
  LIVE_WRITE_AUDIT_SCHEMA_NOT_VERIFIED:'Web操作ID列と操作監査タブの実台帳照合・変更承認が未完了です。',
  DEPLOYED_GAS_VERSION_AND_BACKUP_NOT_VERIFIED:'稼働デプロイの版と安全な復元バックアップは、この検査では証明できません。'
 };
// Mask comments (and optionally quoted text) without changing offsets or line breaks.
// This conservative scanner is not a JavaScript parser: a live GAS review is still mandatory.
function maskInactiveGAS(source,maskStrings=false){
 let out='',state='code',quote='',escaped=false;
 const blank=ch=>ch.charCodeAt(0)===10||ch.charCodeAt(0)===13?ch:' ';
 for(let i=0;i<source.length;i++){
  const ch=source[i],next=source[i+1];
  if(state==='line'){out+=blank(ch);if(ch.charCodeAt(0)===10)state='code';continue}
  if(state==='block'){
   if(ch==='*'&&next==='/'){out+='  ';i++;state='code'}else out+=blank(ch);
   continue
  }
  if(state==='quoted'){
   out+=maskStrings?blank(ch):ch;
   if(escaped)escaped=false;
   else if(ch.charCodeAt(0)===92)escaped=true;
   else if(ch===quote)state='code';
   continue
  }
  if(ch==='/'&&next==='/'){out+='  ';i++;state='line';continue}
  if(ch==='/'&&next==='*'){out+='  ';i++;state='block';continue}
  if(ch==="'"||ch==='"'||ch.charCodeAt(0)===96){
   state='quoted';quote=ch;escaped=false;out+=maskStrings?blank(ch):ch;continue
  }
  out+=ch;
 }
 return out;
}
 const countDefs=src=>{
  const m=new Map();
  for(const hit of maskInactiveGAS(src,true).matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm))
   m.set(hit[1],(m.get(hit[1])||0)+1);
  return m;
 };
 const dispatcher=src=>{
  const active=maskInactiveGAS(src,true);
  const found=/^\s*function\s+doPost\s*\([^)]*\)\s*\{/gm.exec(active);
  if(!found)return {has:false,secret:false,lock:false,identity:false};
  const remaining=maskInactiveGAS(src).slice(found.index+found[0].length);
  const declarations=active.slice(found.index+found[0].length);
  const next=/^\s*(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/gm.exec(declarations);
  const b=next?remaining.slice(0,next.index):remaining;
  const activeBody=maskInactiveGAS(b,true);
  const action=activeBody.indexOf('webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)');
  const dispatch=activeBody.indexOf('mioAdminOps_(');
  const secret=[...activeBody.matchAll(/getProperty\s*\(/g)]
   .find(m=>/^getProperty\s*\(\s*(['"])BRIDGE_SECRET\1\s*\)/.test(b.slice(m.index)))?.index??-1;
  const match=activeBody.indexOf('equal_(d.secret,secret)');
  const getLock=activeBody.indexOf('LockService.getScriptLock(');
  const tryLock=activeBody.indexOf('lock.tryLock(');
  const guard=activeBody.indexOf('if(!lock.tryLock(');
  const guardReturns=guard>=0&&/^if\(!lock\.tryLock\([^)]*\)\)\s*return\b/.test(activeBody.slice(guard));
  return {
   has:action>=0&&dispatch>action,
   secret:secret>=0&&match>secret&&(action<0||match<action),
   lock:getLock>=0&&tryLock>getLock&&guard===tryLock-4&&guardReturns&&
    (action<0||tryLock<action)&&(dispatch<0||tryLock<dispatch),
   identity:action<0||activeBody.indexOf('d.participantId')>action
  };
 };
 function inspect(texts){
  if(!Array.isArray(texts)||!texts.length||texts.some(s=>typeof s!=='string'||!s.trim()))
   throw Error('INVALID_SOURCE');
  const counts=new Map(),route=[];
  let posts=0;
  for(const src of texts){
   const definitions=countDefs(src);
   for(const [name,n] of definitions)counts.set(name,(counts.get(name)||0)+n);
   posts+=definitions.get('doPost')||0;
   route.push(dispatcher(src));
  }
  const present=OPS.filter(n=>counts.has(n));
  const duplicated=[...counts].filter(([,n])=>n>1);
  const hasRoute=route.filter(x=>x.has);
  const unsafe=route.some(x=>x.has&&(!x.secret||!x.lock||!x.identity));
  const partial=present.length>0&&present.length<OPS.length;
  const mismatch=(present.length===0&&hasRoute.length>0)||
   (present.length===OPS.length&&hasRoute.length!==1);
  const blocked=[];
  if(posts!==1)blocked.push('DO_POST_COUNT_NOT_ONE');
  if(duplicated.length)blocked.push('DUPLICATE_FUNCTION_DECLARATIONS');
  if(partial)blocked.push('PARTIAL_ADMIN_FUNCTIONS');
  if(mismatch)blocked.push('DISPATCH_FUNCTION_MISMATCH');
  if(unsafe)blocked.push('DISPATCH_WITHOUT_CONFIRMED_LOCK_OR_SECRET_ORDER');
  let classification='BLOCKED_REVIEW';
  if(posts===1&&!duplicated.length&&!partial&&!mismatch&&!unsafe){
   classification=present.length===0?'NO_OPS_CANDIDATE_ONLY':'ALL_OPS_IN_SOURCE_UNVERIFIED_DEPLOYMENT';
  }
  if(classification==='NO_OPS_CANDIDATE_ONLY')blocked.push('LIVE_ADMIN_OPS_MISSING');
  blocked.push('LIVE_WRITE_AUDIT_SCHEMA_NOT_VERIFIED');
  blocked.push('DEPLOYED_GAS_VERSION_AND_BACKUP_NOT_VERIFIED');
  return Object.freeze({schema:'mio-gas-local-preflight-v1',classification,
   fileCount:texts.length,adminFunctionsPresent:present.length,
   adminFunctionsMissing:OPS.length-present.length,
   duplicateFunctionDeclarationCount:duplicated.length,
   doPostCount:posts,dispatchersFound:hasRoute.length,
   deployedVersionVerified:false,sourceBackupVerified:false,
   liveAdminWriteAllowed:false,readOnly:true,blockingReasons:blocked});
 }
 window.MioGasLocalCheck=Object.freeze({inspect});
 const pick=document.getElementById('gasSources'),check=document.getElementById('gasCheck'),
  clear=document.getElementById('gasClear'),save=document.getElementById('gasExport'),
  status=document.getElementById('gasStatus'),list=document.getElementById('gasReasons');
 let report=null,revision=0;
 const set=(id,v)=>{document.getElementById(id).textContent=String(v)};
 function draw(){
  set('gasFiles',report?.fileCount??'—');
  set('gasOps',report?report.adminFunctionsPresent+'/19':'—');
  set('gasPost',report?.doPostCount??'—');
  set('gasDup',report?.duplicateFunctionDeclarationCount??'—');
  list.replaceChildren();
  if(!report){list.append(Object.assign(document.createElement('li'),{textContent:'現行コードは未確認です。'}));return}
  for(const code of report.blockingReasons){
   const li=document.createElement('li');li.textContent=reasons[code]||'追加の確認が必要です。';
   list.append(li);
  }
 }
 check.addEventListener('click',async()=>{
  const request=++revision;
  report=null;save.disabled=true;draw();
  const files=[...pick.files||[]];
  if(!files.length){status.textContent='ファイルを選択してください。';return}
  if(files.length>30||files.some(f=>f.size<=0||!(/\.(?:gs|txt)$/i.test(f.name)))||
     files.reduce((sum,f)=>sum+f.size,0)>8*1024*1024){
   status.textContent='ファイル数・拡張子・容量が条件を満たしません。';pick.value='';return
  }
  check.disabled=true;status.textContent='端末内で解析しています。ファイルの送信はしません。';
  try{
   const texts=await Promise.all(files.map(f=>f.text()));
   // The user may have cleared the screen while a large local file was read.
   if(request!==revision)return;
   report=inspect(texts);
   status.textContent=report.classification==='BLOCKED_REVIEW'?
    '導入停止：コード候補に重複・不足・確認できない順序があります。':
    report.classification==='NO_OPS_CANDIDATE_ONLY'?
     '管理19関数のない候補です。新規追加の許可ではありません。':
     '管理19関数が揃った候補です。稼働版の一致・バックアップは未確認のため導入禁止。';
   save.disabled=false;draw();
  }catch{
   if(request!==revision)return;
   report=null;status.textContent='ファイルを安全に読み取れませんでした。結果は破棄しました。';draw();
  }finally{
   // Never restore an obsolete result after the user pressed clear.
   if(request===revision){pick.value='';check.disabled=false}
  }
 });
 clear.addEventListener('click',()=>{
  revision++;
  report=null;pick.value='';save.disabled=true;check.disabled=false;
  status.textContent='検査結果を消去しました。';
  draw();
 });
 save.addEventListener('click',()=>{
  if(!report)return;
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
  const u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download='mio-gas-redacted-preflight.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(u),1500);
 });
 // The following comparison reads both file sets locally and never derives any
 // production-release flag. It proves ONLY that the two selected local sets match.
 const backupSource=document.getElementById('gasBackupOriginal');
 const backupCopy=document.getElementById('gasBackupCopy');
 const backupCheck=document.getElementById('gasBackupCompare');
 const backupClear=document.getElementById('gasBackupClear');
 const backupStatus=document.getElementById('gasBackupStatus');
 let backupRevision=0;
 // Apps Script projects can include HTMLService templates and appsscript.json.
 // Reject duplicated names (including case/Unicode variants): a flattened browser
 // FileList cannot prove which of two same-named files would be restored.
 const validSet=files=>{
  if(!files.length||files.length>30||files.some(f=>f.size<=0||
    !['.gs','.txt','.html','.json'].some(ext=>f.name.toLowerCase().endsWith(ext)))||
    files.reduce((sum,f)=>sum+f.size,0)>8*1024*1024)return false;
  const keys=files.map(f=>f.name.normalize('NFC').toLocaleLowerCase('en'));
  return new Set(keys).size===keys.length;
 };
 const digestFile=async file=>{
  const bytes=await file.arrayBuffer();
  const digest=await window.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 };
 const localManifest=async files=>{
  const pairs=await Promise.all(files.map(async file=>[file.name,await digestFile(file)]));
  return pairs.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
 };
 backupCheck.addEventListener('click',async()=>{
  const seq=++backupRevision,source=[...backupSource.files],copy=[...backupCopy.files];
  if(!validSet(source)||!validSet(copy)){
   backupStatus.textContent='ファイル数・形式・容量、または同じ名前の重複を確認してください。同名ファイルを含む一式は照合しません。';
   backupSource.value='';backupCopy.value='';return;
  }
  if(!window.crypto?.subtle){
   backupStatus.textContent='この端末では安全なSHA-256照合が利用できません。';
   backupSource.value='';backupCopy.value='';return;
  }
  backupCheck.disabled=true;backupStatus.textContent='端末内で照合しています。ファイルは送信しません。';
  try{
   const [original,backup]=await Promise.all([localManifest(source),localManifest(copy)]);
   if(seq!==backupRevision)return;
   const equal=original.length===backup.length&&original.every((a,i)=>
    a[0]===backup[i][0]&&a[1]===backup[i][1]);
   backupStatus.textContent=equal?
    '選択した'+original.length+'ファイルの名前と内容が完全一致しました。ただし稼働GASの版は未検証です。':
    '不一致：選択した2組のファイル名または内容に差があります。GASの変更をしないでください。';
  }catch{
   if(seq!==backupRevision)return;
   backupStatus.textContent='安全な照合を完了できませんでした。GASの変更をしないでください。';
  }finally{
   if(seq===backupRevision){
    backupSource.value='';backupCopy.value='';backupCheck.disabled=false;
   }
  }
 });
 backupClear.addEventListener('click',()=>{
  backupRevision++;backupSource.value='';backupCopy.value='';
  backupCheck.disabled=false;
  backupStatus.textContent='バックアップ照合結果を消去しました。';
 });
 draw();
})();
