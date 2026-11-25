/* MIO owner Web center: recovery-ID management, preview-gated API.
   No user IDs, admin codes or issuance secrets in localStorage/URL/logs. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
if(!$('mioRecoveryPanel'))return;
let verified=false,busy=false,lastTarget=null;
const status=(message)=>{$('mioRecoveryStatus').textContent=message};
const cleanResult=()=>{
 $('mioRecoveryOutput').value='';
 $('mioRecoveryResult').hidden=true;
};
const target=()=>({masterId:$('mioRecoveryMasterId').value.trim(),
 displayName:$('mioRecoveryName').value.trim().normalize('NFKC')});
function invalidate(message='対象を確認するには「登録・復旧状態を照合」を押してください。'){
 verified=false;lastTarget=null;cleanResult();status(message);redraw();
}
function currentLevel(){return Number($('mioRecoveryLevel').value)}
function redraw(){
 const member=currentLevel()===3;
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
 if(busy)return;
 busy=true;verified=false;cleanResult();redraw();
 status('GASの参加者台帳と発行状態を照合しています…');
 try{
  const id=target();
  if(!/^MIO-(?:[0-9]{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$/.test(id.masterId)||!id.displayName)
   throw Error('既存のMIO-IDとColorSing名を指定してください');
  const data=await request('read',{masterId:id.masterId});
  const matching=(data.roster||[]).filter(p=>p.mioId===id.masterId);
  if(matching.length!==1||matching[0].name.trim().normalize('NFKC')!==id.displayName)
   throw Error('GAS台帳の名前とMIO-IDを確認できません。同名者・別IDへの発行は停止します。');
  verified=true;lastTarget=id;
  const old=data.current;
  status('本人確認候補：'+id.displayName+' / '+id.masterId+
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
 busy=true;cleanResult();redraw();
 status('新しい復旧IDを発行しています。途中で通信が切れても自動で再送しません。');
 try{
  const expiration=$('mioRecoveryUntil').value;
  const d=await request('issue',{
   ...id,level,operatorConfirmed:true,
   memberConfirmed:level===3&&$('mioRecoveryMemberVerified').checked,
   memberUntil:level===3?expiration+'T23:59:59+09:00':null,
   operationId:newOperationId()
  });
  if(!/^MIO-ACCESS-[a-f0-9]{40}$/.test(d.recoveryId||'')||d.masterId!==id.masterId)
   throw Error('発行結果が一致しません。再発行する前に管理台帳を確認してください。');
  $('mioRecoveryOutput').value=d.recoveryId;
  $('mioRecoveryResult').hidden=false;
  status('発行完了。旧未使用ID '+d.replacedCount+
   '件が失効しました。\n新しいIDだけを本人へ個別送信してください。');
  $('mioRecoveryConfirmed').checked=false;
 }catch(e){
  cleanResult();
  verified=false;
  status(e.message+'\n前のIDが有効かどうか不明な場合は管理台帳を再照合してから再発行してください。');
 }finally{
  busy=false;$('mioRecoveryAdminCode').value='';redraw();
 }
}
for(const id of ['mioRecoveryMasterId','mioRecoveryName']){
 $(id).addEventListener('input',()=>invalidate());
}
$('mioRecoveryLevel').addEventListener('change',()=>{cleanResult();redraw()});
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
 if(typeof p.name!=='string'||typeof p.mioId!=='string')return;
 $('mioRecoveryMasterId').value=p.mioId;
 $('mioRecoveryName').value=p.name;
 $('mioRecoveryConfirmed').checked=false;
 invalidate('参加者一覧で選択しました。復旧ID発行前に「登録・復旧状態を照合」を押してください。');
});
redraw();
})();
