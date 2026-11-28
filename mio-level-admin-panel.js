/* MIO owner Web center: recovery-ID management, preview-gated API.
   No user IDs, admin codes or issuance secrets in localStorage/URL/logs. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
if(!$('mioRecoveryPanel'))return;
let verified=false,busy=false,lastTarget=null,lastIssuedTarget=null;
const status=(message)=>{$('mioRecoveryStatus').textContent=message};
const cleanResult=()=>{
 $('mioRecoveryOutput').value='';
 $('mioRecoveryResult').hidden=true;
 $('mioRecoveryPreviewLinks').hidden=true;
};
const clearHistory=(message='対象者を照合すると履歴を表示します。')=>{
 const root=$('mioRecoveryHistory');if(!root)return;
 const p=document.createElement('p');p.textContent=message;root.replaceChildren(p);
};
const renderHistory=items=>{
 const root=$('mioRecoveryHistory');if(!root)return;
 root.replaceChildren();
 if(!Array.isArray(items)||items.length===0){clearHistory('この参加者の発行履歴はありません。');return}
 const labels={issued:'未使用（発行済み）',used:'使用済み',expired:'期限切れ',revoked:'失効'};
 for(const item of items){
  const box=document.createElement('div');box.className='ops-item';
  const heading=document.createElement('strong');
  heading.textContent='Lv.'+String(item.level)+' · '+(labels[item.status]||'状態不明');
  const dates=document.createElement('p');
  const created=item.createdAt?new Date(item.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'日時未確認';
  const expires=item.expiresAt?new Date(item.expiresAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'期限未確認';
  dates.textContent='発行：'+created+' / 期限：'+expires;
  box.append(heading,dates);
  if(item.claimedAt){
   const claimed=document.createElement('p');
   claimed.textContent='使用：'+new Date(item.claimedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
   box.append(claimed);
  }
  root.append(box);
 }
};
function mayDiscardIssuedCode(){
 if(!lastIssuedTarget||$('mioRecoveryResult').hidden||!$('mioRecoveryOutput').value)return true;
 const ok=confirm('発行済みIDが表示中です。必要なら先にコピーしてください。次の対象へ進むとID表示が消えます。進みますか？');
 if(ok){cleanResult();lastIssuedTarget=null}
 return ok;
}
const target=()=>({masterId:$('mioRecoveryMasterId').value.trim(),
 displayName:$('mioRecoveryName').value.trim().normalize('NFKC')});
function invalidate(message='対象を確認するには「登録・復旧状態を照合」を押してください。'){
 verified=false;lastTarget=null;cleanResult();clearHistory();status(message);redraw();
}
function currentLevel(){return Number($('mioRecoveryLevel').value)}
function redraw(){
 const member=currentLevel()===3;
 for(const id of ['mioRecoveryMasterId','mioRecoveryName','mioRecoveryLevel','mioRecoveryUntil','mioRecoveryMemberVerified','mioRecoveryConfirmed','mioRecoveryAdminCode'])$(id).disabled=busy;
 $('mioRecoveryIssue').textContent=busy?'発行中…':'復旧IDを発行・再発行する';
 $('mioRecoveryUntilGroup').hidden=!member;
 $('mioRecoveryMemberGroup').hidden=!member;
 $('mioRecoveryIssue').disabled=busy||!verified||!$('mioRecoveryConfirmed').checked||
  (member&&(!$('mioRecoveryUntil').value||!$('mioRecoveryMemberVerified').checked));
 $('mioRecoveryRead').disabled=busy;
}
async function request(action,values={}){
 const adminCode=$('mioRecoveryAdminCode').value;
 const resp=await fetch('/api/mio-level-admin',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action,adminCode,...values})
 });
 const data=await resp.json().catch(()=>({}));
 if(!resp.ok||data.ok!==true){
  if(resp.status===503)throw Error('共通復旧IDはまだ隔離検証中です。ユーリさん用の既存復旧画面を利用してください。');
  if(resp.status===403)throw Error('管理者コードまたはFace ID認証を確認してください。');
  throw Error(data.error||'運営側で登録を確認できません');
 }
 return data;
}
function newOperationId(){return crypto.randomUUID()}
async function read(){
 if(busy||!mayDiscardIssuedCode())return;
 busy=true;verified=false;cleanResult();clearHistory('照合中…');redraw();
 status('参加者台帳と発行状態を照合しています…');
 try{
  const id=target();
  if(!/^MIO-(?:[0-9]{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$/.test(id.masterId)||!id.displayName)
   throw Error('既存のMIO-IDとColorSing名を指定してください');
  const data=await request('read',{masterId:id.masterId});
  const matching=(data.roster||[]).filter(p=>p.mioId===id.masterId);
  if(matching.length!==1||matching[0].name.trim().normalize('NFKC')!==id.displayName)
   throw Error('GAS台帳の名前とMIO-IDを確認できません。同名者・別IDへの発行は停止します。');
  verified=true;lastTarget=id;renderHistory(data.history||[]);
  const old=data.current;
  status((data.previewSynthetic?'隔離用の合成参加者：':'本人確認候補：')+id.displayName+' / '+id.masterId+
   '\n現在の共通登録：'+(old?('Lv.'+old.level+' / '+old.status+' / 世代'+old.generation):'未登録')+
   '\n※本人・資格・元IDをみおが最終確認してから発行してください。');
 }catch(e){status(e.message)}
 finally{busy=false;redraw()}
}
async function issue(){
 if(busy||!verified||!$('mioRecoveryConfirmed').checked)return;
 const id=target(),level=currentLevel();
 if(!lastTarget||id.masterId!==lastTarget.masterId||id.displayName!==lastTarget.displayName){
  invalidate('対象者の情報が変わりました。台帳を再照合してください。');return;
 }
 if(level===3&&(!$('mioRecoveryMemberVerified').checked||!$('mioRecoveryUntil').value)){
  status('Lv.3はメンシプ資格と期限の確認が必要です。');redraw();return;
 }
 if(!confirm(id.displayName+' / '+id.masterId+' の復旧IDを'+
  ' Lv.'+level+' で発行しますか？\n以前の未使用IDは無効になります。\n過去のガチャ・皆勤は変更しません。'))return;
 const operationId=newOperationId();
 busy=true;cleanResult();redraw();
 status('新しい復旧IDを発行しています。途中で通信が切れても自動で再送しません。');
 try{
  const expiration=$('mioRecoveryUntil').value;
  const d=await request('issue',{
   ...id,level,operatorConfirmed:true,
   memberConfirmed:level===3&&$('mioRecoveryMemberVerified').checked,
   memberUntil:level===3?expiration+'T23:59:59+09:00':null,
   operationId
  });
  if(!/^MIO-ACCESS-[a-f0-9]{40}$/.test(d.recoveryId||'')||d.masterId!==id.masterId)
   throw Error('発行結果が一致しません。発行履歴を照合してください。');
  $('mioRecoveryOutput').value=d.recoveryId;
  $('mioRecoveryResult').hidden=false;
  $('mioRecoveryPreviewLinks').hidden=!d.previewSynthetic;
  lastIssuedTarget={...id};
  verified=false;lastTarget=null;
  $('mioRecoveryMasterId').value='';
  $('mioRecoveryName').value='';
  $('mioRecoveryConfirmed').checked=false;
  $('mioRecoveryMemberVerified').checked=false;
  $('mioRecoveryUntil').value='';
  $('mioRecoveryLevel').value='2';
  try{
   const state=await request('read',{masterId:id.masterId});
   renderHistory(state.history||[]);
  }catch{
   renderHistory([]);
  }
  status('発行完了。旧未使用ID '+d.replacedCount+
   '件が失効しました。\n最新IDを本人へ個別送信してください。次の参加者は一覧から選択して照合できます（ページ再読み込み不要）。');
 }catch(e){
  cleanResult();
  verified=false;lastTarget=null;
  const failure='発行結果を確定できません。自動再送はしていません。発行履歴を照合してください。';
  try{
   const state=await request('read',{masterId:id.masterId});
   renderHistory(state.history||[]);
   status(failure+'\n履歴を更新しました。状態を確認してから次の操作をしてください。');
  }catch{
   renderHistory([]);
   status(failure+'\n通信が戻ったら対象を再照合してください。');
  }
 }finally{
  busy=false;$('mioRecoveryAdminCode').value='';redraw();
 }
}
for(const id of ['mioRecoveryMasterId','mioRecoveryName']){
 $(id).addEventListener('input',()=>{
  if(!mayDiscardIssuedCode()){
   $('mioRecoveryMasterId').value='';$('mioRecoveryName').value='';
   return;
  }
  invalidate();
 });
}
$('mioRecoveryLevel').addEventListener('change',()=>{
 if(!mayDiscardIssuedCode()){$('mioRecoveryLevel').value='2';return}
 cleanResult();redraw()
});
$('mioRecoveryUntil').addEventListener('change',redraw);
$('mioRecoveryMemberVerified').addEventListener('change',redraw);
$('mioRecoveryConfirmed').addEventListener('change',redraw);
$('mioRecoveryRead').addEventListener('click',read);
$('mioRecoveryIssue').addEventListener('click',issue);
$('mioRecoveryCopy').addEventListener('click',async()=>{
 try{
  if(!$('mioRecoveryOutput').value)throw Error('表示中のIDがありません');
  await navigator.clipboard.writeText($('mioRecoveryOutput').value);
  status('最新IDをコピーしました。本人だけに個別送信してください。');
 }catch{status('コピーできませんでした。表示欄から手動でコピーしてください。')}
});
window.addEventListener('mio:admin-person-selected',event=>{
 const p=event.detail||{};
 if(typeof p.name!=='string'||typeof p.mioId!=='string'||!mayDiscardIssuedCode())return;
 $('mioRecoveryMasterId').value=p.mioId;
 $('mioRecoveryName').value=p.name;
 $('mioRecoveryConfirmed').checked=false;
 invalidate('参加者一覧で選択しました。復旧ID発行前に「登録・復旧状態を照合」を押してください。');
});
redraw();
})();

