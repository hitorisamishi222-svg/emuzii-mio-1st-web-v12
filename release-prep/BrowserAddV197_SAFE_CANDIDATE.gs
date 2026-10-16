/**
 * MIO browser-add v1.9.7 SAFE CANDIDATE: review snapshots, fail-closed approvals,
 * retired-device protection, per-Web-ID audit and best-effort rollback.
 * Uses current admin sheets and existing trigger. DO NOT DEPLOY WITHOUT REVIEW.
 */

function setupBrowserAddV189Patch(){
  throw Error('安全版では管理者用シートおよび既存トリガーを初期化しません。既存のwebRecoveryOnEditBrowserPatchV189_を維持してください。');
}

function refreshBrowserAddReviewV189Patch_(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var web=ss.getSheetByName(WEB_TAB),review=ss.getSheetByName('emuzii_重複整理');
  if(!web||!review)throw Error('必要なシートがありません');
  var rows=webActualRows_(web),nameCount={},idCount={};
  rows.forEach(function(r){
    var n=String(r[2]||''),id=String(r[7]||'');
    if(n)nameCount[n]=(nameCount[n]||0)+1;
    if(/^MIO-\d{4}$/.test(id))idCount[id]=(idCount[id]||0)+1;
  });
  if(review.getLastRow()>1)review.getRange(2,1,review.getLastRow()-1,13).clearContent();
  var output=[];
  rows.forEach(function(r,i){
    var w=String(r[0]||''),n=String(r[2]||''),id=String(r[7]||'');
    if(!w||!((nameCount[n]||0)>1||(idCount[id]||0)>1))return;
    output.push([n,id,w,String(r[5]||''),String(r[16]||''),r[4]||'',nameCount[n]||0,/^MIO-\d{4}$/.test(id)?idCount[id]||0:0,'未確認','保留','','',i+2]);
  });
  if(output.length)review.getRange(2,1,output.length,13).setValues(output);
  return {ok:true,count:output.length};
}

function confirmBrowserReviewSnapshotV197_(review,row,webId,mioId){
  var ss=SpreadsheetApp.openById(SHEET_ID),web=ss.getSheetByName(WEB_TAB);
  var found=[];
  webActualRows_(web).forEach(function(r,i){
    if(String(r[0]||'')===String(webId||''))found.push({data:r,row:i+2});
  });
  if(found.length!==1)throw Error('Web-IDが一意ではありません');
  var current=found[0],d=current.data;
  if(String(review.getRange(row,1).getDisplayValue()||'')!==String(d[2]||'')||
     String(review.getRange(row,2).getDisplayValue()||'')!==String(mioId||'')||
     String(review.getRange(row,4).getDisplayValue()||'')!==String(d[5]||'')||
     String(review.getRange(row,5).getDisplayValue()||'')!==String(d[16]||'')||
     Number(review.getRange(row,13).getValue())!==current.row){
       throw Error('候補一覧が更新されています。再表示して本人確認をやり直してください');
  }
  return current;
}

function webRecoveryOnEditBrowserPatchV189_(e){
  if(!e||!e.range||e.range.getNumRows()!==1||e.range.getNumColumns()!==1)return;
  var sh=e.range.getSheet(),row=e.range.getRow(),col=e.range.getColumn();
  if(sh.getName()!=='emuzii_重複整理')return;
  if(row===2&&col===14&&String(e.value||'')==='更新'){
    refreshBrowserAddReviewV189Patch_();
    sh.getRange('N2').clearContent();
    return;
  }
  if(row<2||col!==10)return;
  var action=String(e.value||'');
  if(action!=='このブラウザを追加'&&action!=='この端末へ切替')return;
  try{
    if(String(sh.getRange(row,9).getDisplayValue()||'')!=='確認済み')
      throw Error('本人確認を「確認済み」にしてください');
    var webId=String(sh.getRange(row,3).getDisplayValue()||''),mioId=String(sh.getRange(row,2).getDisplayValue()||'');
    confirmBrowserReviewSnapshotV197_(sh,row,webId,mioId);
    var result=action==='このブラウザを追加'
      ?approveAdditionalBrowserV189Patch_(webId,mioId)
      :switchApprovedWebRegistrationV189_(webId,mioId);
    sh.getRange(row,11).setValue(action==='このブラウザを追加'?'追加完了／既存ブラウザ維持':'切替完了／旧端末 '+result.retiredWebIds.length+'件');
    sh.getRange(row,12).setValue(new Date());
    sh.getRange(row,9).setValue('未確認');
    sh.getRange(row,10).setValue('保留');
  }catch(err){
    sh.getRange(row,11).setValue('実行不可：'+String(err.message||err));
    sh.getRange(row,9).setValue('未確認');
    sh.getRange(row,10).setValue('保留');
  }
}

function approveAdditionalBrowserV189Patch_(webId,expectedMioId){
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw Error('他の登録更新が実行中です');
  try{
    var ss=SpreadsheetApp.openById(SHEET_ID),web=ss.getSheetByName(WEB_TAB),audit=ss.getSheetByName('emuzii_端末切替履歴');
    if(!web||!audit)throw Error('必要なシートがありません');
    var rows=webActualRows_(web),found=[];
    rows.forEach(function(r,i){if(String(r[0]||'')===String(webId||''))found.push({row:i+2,data:r});});
    if(found.length!==1)throw Error('対象Web登録IDが一意ではありません');
    var target=found[0],r=target.data,mioId=String(r[7]||''),name=String(r[2]||'');
    if(!/^MIO-\d{4}$/.test(mioId)||mioId!==String(expectedMioId||''))throw Error('MIO-IDが一致しません');
    if(mioId==='MIO-0004'||name==='翠央(お試し)')throw Error('管理者テスト端末は自動追加の対象外です');
    if(String(r[5]||'')!=='承認待ち'||String(r[16]||'')==='旧端末'||String(r[5]||'')==='却下')
      throw Error('承認待ちの新しいブラウザだけ追加できます。旧端末を復活できません');
    if(String(r[10]||'')!==mioId||String(r[11]||'')!=='確認済み'||String(r[15]||'')!==mioId)
      throw Error('H/K/P/Lの本人照合が確定していません');
    var people=rows_(ss,'emuzii_参加者').filter(function(p){
      return String(p[0]||'')===mioId&&String(p[1]||'')===name;
    });
    if(people.length!==1)throw Error('参加者のMIO-IDと名前を一意に照合できません');
    var approved=rows.map(function(x,i){return {row:i+2,data:x};}).filter(function(x){
      return x.row!==target.row&&x.data[5]==='承認済み'&&String(x.data[7]||'')===mioId;
    });
    var inherited=approved.some(function(x){return String(x.data[6]||'')==='確認済み';});
    var prior={
      f:r[5],g:r[6],h:r[7],j:r[9],k:r[10],l:r[11],
      q:r[16],memo:r[17],time:r[18]
    };
    var now=new Date();
    audit.appendRow([now,name,mioId,String(webId),'',JSON.stringify({targetRow:target.row,oldState:prior,keptActive:approved.map(function(x){return String(x.data[0]||'');})}),'追加処理開始','本人確認／既存ブラウザ維持']);
    var logRow=audit.getLastRow();
    try{
      // Permission-bearing F column is written last, after verified linkage is set.
      web.getRange(target.row,8).setValue(mioId);
      web.getRange(target.row,10).setValue('既存一致');
      web.getRange(target.row,11).setValue(mioId);
      web.getRange(target.row,12).setValue('確認済み');
      if(inherited&&String(r[6]||'')!=='確認済み')web.getRange(target.row,7).setValue('確認済み');
      web.getRange(target.row,17).setValue('使用中');
      web.getRange(target.row,18).setValue('本人確認済み／追加ブラウザ承認／'+mioId);
      web.getRange(target.row,19).setValue(now);
      web.getRange(target.row,6).setValue('承認済み');
      ensureWebDerivedRow_(web,target.row);
      SpreadsheetApp.flush();
      audit.getRange(logRow,7).setValue('追加完了');
    }catch(err){
      var bad=[];
      [[6,prior.f],[7,prior.g],[8,prior.h],[10,prior.j],[11,prior.k],[12,prior.l],
        [17,prior.q],[18,prior.memo],[19,prior.time]].forEach(function(pair){
          try{web.getRange(target.row,pair[0]).setValue(pair[1]);}catch(rollbackError){bad.push(pair[0]);}
      });
      try{ensureWebDerivedRow_(web,target.row);SpreadsheetApp.flush();}catch(rollbackError){bad.push('派生列');}
      try{audit.getRange(logRow,7).setValue(bad.length?'復旧確認必要':'失敗・復旧済み');}catch(ignore){}
      throw Error(bad.length?'追加に失敗。手動の復旧確認が必要です':String(err.message||err));
    }
    return {ok:true,mioId:mioId,activeWebId:String(webId),keptWebIds:approved.map(function(x){return String(x.data[0]||'');})};
  }finally{lock.releaseLock();}
}

function runBrowserAddV189PatchCheck(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var funcs=ScriptApp.getProjectTriggers().map(function(x){return x.getHandlerFunction();});
  var c=function(n){return funcs.filter(function(x){return x===n;}).length;};
  return {ok:!!ss.getSheetByName('emuzii_重複整理')&&!!ss.getSheetByName('emuzii_端末切替履歴')&&c('webRecoveryOnEditBrowserPatchV189_')===1&&c('webRecoveryOnEdit_')===0&&c('backupSweep_')===0,
    triggerCount:c('webRecoveryOnEditBrowserPatchV189_'),oldTriggerCount:c('webRecoveryOnEdit_'),triggers:funcs};
}
