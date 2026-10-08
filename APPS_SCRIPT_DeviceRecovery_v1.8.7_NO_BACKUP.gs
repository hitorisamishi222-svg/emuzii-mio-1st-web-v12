/**
 * 翠央1周年 v1.8.7 NO-BACKUP 運用・端末復旧アドオン
 * APPS_SCRIPT_Code_v1.8.7_NO_BACKUP.gs と同じ既存Apps Scriptプロジェクトへ追加する。
 * 管理者が emuzii_Web登録 の「登録承認」を承認済みに変更した時だけ端末整理を行う。
 * 「翠央(お試し)」は自動却下しない。
 * 二重保存・第二保存にはアクセスしない。
 */


/** Run on the existing spreadsheet Apps Script only; it never creates a second project. */
function setupV187Complete(){
  setup();
  setupWebRecoveryV187_();
  setupV189DuplicateReview_();
}
var DUP_REVIEW_TAB_V189='emuzii_重複整理';
var DUP_AUDIT_TAB_V189='emuzii_端末切替履歴';
function setupWebRecoveryV187_(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    var handler=t.getHandlerFunction();
    if(handler==='webRecoveryOnEdit_'||handler==='backupSweep_')ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('webRecoveryOnEdit_').forSpreadsheet(SHEET_ID).onEdit().create();
}

/** Display duplicates without changing active Web registrations. */
function collectDuplicateReviewV189_(ss){
  var web=ss.getSheetByName(WEB_TAB);
  var all=web?webActualRows_(web):[],nameCount={},idCount={};
  all.forEach(function(r){
    if(!String(r[0]||''))return;
    var name=String(r[2]||''),id=String(r[7]||'');
    if(name)nameCount[name]=(nameCount[name]||0)+1;
    if(/^MIO-\d{4}$/.test(id))idCount[id]=(idCount[id]||0)+1;
  });
  var out=[];
  all.forEach(function(r,i){
    var webId=String(r[0]||''),name=String(r[2]||''),id=String(r[7]||'');
    if(!webId||!((nameCount[name]||0)>1||(idCount[id]||0)>1))return;
    out.push({
      row:i+2,webId:webId,name:name,mioId:id,
      status:String(r[5]||''),deviceState:String(r[16]||''),
      registeredAt:r[4]||'',sameName:nameCount[name]||0,
      sameMio:/^MIO-\d{4}$/.test(id)?idCount[id]||0:0
    });
  });
  return out;
}
function setupV189DuplicateReview_(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var review=ss.getSheetByName(DUP_REVIEW_TAB_V189);
  if(!review)review=ss.insertSheet(DUP_REVIEW_TAB_V189);
  var audit=ss.getSheetByName(DUP_AUDIT_TAB_V189);
  if(!audit){
    audit=ss.insertSheet(DUP_AUDIT_TAB_V189);
    audit.getRange(1,1,1,8).setValues([['実行日時','ColorSing名','MIO-ID','使用端末Web-ID','旧端末Web-ID','変更前状態','結果','備考']]);
    audit.setFrozenRows(1);
  }
  review.getRange(1,1,1,13).setValues([['ColorSing名','照合MIO-ID','Web登録ID','承認状態','端末状態','登録日時','同名登録数','同MIO登録数','本人確認','端末切替操作','結果','処理日時','元シート行']]);
  review.getRange('N1').setValue('一覧更新');
  review.getRange('N2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['更新'],true).setAllowInvalid(false).build());
  review.setFrozenRows(1);
  review.getRange('A1:M1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
  review.getRange('I2:I500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['未確認','確認済み'],true).setAllowInvalid(false).build());
  review.getRange('J2:J500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['保留','この端末へ切替'],true).setAllowInvalid(false).build());
  review.setColumnWidth(1,180);
  review.setColumnWidth(3,295);
  review.setColumnWidth(11,320);
  return refreshDuplicateReviewV189_();
}
function refreshDuplicateReviewV189_(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var review=ss.getSheetByName(DUP_REVIEW_TAB_V189);
  if(!review)throw Error('先にsetupV189DuplicateReview_を実行してください');
  var rows=collectDuplicateReviewV189_(ss),last=Math.max(review.getLastRow(),2);
  review.getRange(2,1,last-1,13).clearContent();
  if(rows.length){
    var view=rows.map(function(r){return [
      r.name,r.mioId,r.webId,r.status,r.deviceState,r.registeredAt,
      r.sameName,r.sameMio,'未確認','保留','','',r.row
    ]});
    review.getRange(2,1,view.length,13).setValues(view);
  }
  return {ok:true,groups:rows.length,reviewSheet:DUP_REVIEW_TAB_V189};
}
/** Editing F=承認済み does NOT switch existing users behind their backs. */
function webRecoveryOnEdit_(e){
  if(!e||!e.range||e.range.getNumRows()!==1||e.range.getNumColumns()!==1)return;
  var sh=e.range.getSheet(),row=e.range.getRow(),col=e.range.getColumn();
  if(sh.getName()===DUP_REVIEW_TAB_V189){
    if(row===2&&col===14&&String(e.value||'')==='更新'){
      refreshDuplicateReviewV189_();
      sh.getRange('N2').clearContent();
      return;
    }
    if(row<2||col!==10||String(e.value||'')!=='この端末へ切替')return;
    try{
      if(String(sh.getRange(row,9).getDisplayValue()||'')!=='確認済み')
        throw Error('本人確認を「確認済み」にしてください');
      var webId=String(sh.getRange(row,3).getDisplayValue()||'');
      var expectedId=String(sh.getRange(row,2).getDisplayValue()||'');
      var result=switchApprovedWebRegistrationV189_(webId,expectedId);
      sh.getRange(row,11).setValue('切替完了／旧端末 '+result.retiredWebIds.length+'件');
      sh.getRange(row,12).setValue(new Date());
      sh.getRange(row,10).setValue('保留');
    }catch(err){
      sh.getRange(row,11).setValue('実行不可：'+String(err.message||err));
      sh.getRange(row,10).setValue('保留');
    }
    return;
  }
  if(sh.getName()!==WEB_TAB||row<2||col!==6||String(e.value||'')!=='承認済み')return;
  if(String(e.oldValue||'')==='承認済み')return;

  var ss=sh.getParent(),webId=String(sh.getRange(row,1).getDisplayValue()||'');
  var name=String(sh.getRange(row,3).getDisplayValue()||'').trim();
  if(!webId||!name)return;
  var people=rows_(ss,'emuzii_参加者').filter(function(p){
    return p[1]===name&&/^MIO-\d{4}$/.test(String(p[0]||''));
  });
  var id=people.length===1?String(people[0][0]):'';
  var existing=webActualRows_(sh).filter(function(r){
    return String(r[0]||'')!==webId&&r[5]==='承認済み'&&
      (String(r[2]||'')===name||(id&&String(r[7]||'')===id));
  });
  var linked=String(sh.getRange(row,8).getDisplayValue()||'');
  var linkedAlt=String(sh.getRange(row,11).getDisplayValue()||'');
  if(!id||(linked&&linked!==id)||(linkedAlt&&/^MIO-\d{4}$/.test(linkedAlt)&&linkedAlt!==id)||existing.length){
    sh.getRange(row,6).setValue('承認待ち');
    sh.getRange(row,17).setValue('未指定');
    sh.getRange(row,18).setValue('重複整理待ち：既存の承認済み端末は維持。管理者が専用シートで端末切替を選択');
    sh.getRange(row,19).setValue(new Date());
    ensureWebDerivedRow_(sh,row);
    if(ss.getSheetByName(DUP_REVIEW_TAB_V189))refreshDuplicateReviewV189_();
    return;
  }
  // The initial registration has no approved competitor and an unambiguous MIO ID.
  sh.getRange(row,8).setValue(id);
  sh.getRange(row,10).setValue('既存一致');
  sh.getRange(row,11).setValue(id);
  sh.getRange(row,12).setValue('確認済み');
  sh.getRange(row,17).setValue('使用中');
  sh.getRange(row,18).setValue('初回承認済み／'+id);
  sh.getRange(row,19).setValue(new Date());
  ensureWebDerivedRow_(sh,row);
}
/** Explicit manager-selected switch. Only rows with identical, verified MIO-ID retire. */
function switchApprovedWebRegistrationV189_(newWebId,expectedMioId){
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw Error('他の登録更新が実行中です');
  try{
    var ss=SpreadsheetApp.openById(SHEET_ID),web=ss.getSheetByName(WEB_TAB);
    if(!web)throw Error('Web登録シートが見つかりません');
    var entries=webActualRows_(web),chosen=[];
    entries.forEach(function(r,i){if(String(r[0]||'')===String(newWebId||''))chosen.push({r:r,row:i+2});});
    if(chosen.length!==1)throw Error('対象Web登録IDが一意ではありません');
    var target=chosen[0],v=target.r,id=String(v[7]||''),name=String(v[2]||'');
    if(!/^MIO-\d{4}$/.test(id)||id!==String(expectedMioId||''))throw Error('MIO-IDが一致しません');
    if(name==='翠央(お試し)')throw Error('管理者テスト用端末は切替対象外です');
    if(v[5]!=='承認済み'&&v[5]!=='承認待ち')throw Error('切替対象の承認状態が不正です');
    if(String(v[10]||'')!==id||String(v[11]||'')!=='確認済み'||(v[15]&&String(v[15])!==id))
      throw Error('H/K/P/Lの本人照合が確定していません');
    var people=rows_(ss,'emuzii_参加者').filter(function(x){
      return String(x[0]||'')===id&&String(x[1]||'')===name;
    });
    if(people.length!==1)throw Error('参加者のMIO-IDと名前を一意に照合できません');
    // If some registration with the same nickname belongs to a different MIO-ID,
    // it must NOT be merged or disabled by this operation.
    var other=entries.map(function(x,i){return {r:x,row:i+2};}).filter(function(x){
      return x.row!==target.row&&x.r[5]==='承認済み'&&String(x.r[7]||'')===id;
    });
    var touched=other.concat([target]);
    var snapshots=touched.map(function(x){
      return {row:x.row,webId:String(x.r[0]||''),status:String(x.r[5]||''),
        member:String(x.r[6]||''),device:String(x.r[16]||''),
        memo:String(x.r[17]||''),updated:x.r[18]||''};
    });
    var oldStates=snapshots.filter(function(x){return x.row!==target.row});
    var audit=ss.getSheetByName(DUP_AUDIT_TAB_V189);
    if(!audit)throw Error('管理者用の操作履歴シートがありません');
    var when=new Date();
    audit.appendRow([when,name,id,String(newWebId),oldStates.map(function(x){return x.webId}).join(','),
      JSON.stringify(snapshots),'切替実行開始','本人確認済み／対象'+target.row+'行']);
    var logRow=audit.getLastRow();
    var transferredMembership=other.some(function(x){return String(x.r[6]||'')==='確認済み';});
    try{
      // Preserve all MIO-ID keyed attendance, gacha grants and draws.
      other.forEach(function(x){
        web.getRange(x.row,6).setValue('却下');
        web.getRange(x.row,17).setValue('旧端末');
        web.getRange(x.row,18).setValue('端末切替による無効化／後継 '+newWebId+'／'+id);
        web.getRange(x.row,19).setValue(when);
        ensureWebDerivedRow_(web,x.row);
      });
      web.getRange(target.row,6).setValue('承認済み');
      if(transferredMembership&&String(v[6]||'')!=='確認済み')
        web.getRange(target.row,7).setValue('確認済み');
      web.getRange(target.row,17).setValue('使用中');
      web.getRange(target.row,18).setValue('本人確認済み／端末切替確定／'+id);
      web.getRange(target.row,19).setValue(when);
      ensureWebDerivedRow_(web,target.row);
      SpreadsheetApp.flush();
      audit.getRange(logRow,7).setValue('完了');
    }catch(err){
      // Best-effort rollback if an Apps Script/Sheets operation fails midway.
      var rollbackIssues=[];
      snapshots.forEach(function(x){
        try{
          web.getRange(x.row,6).setValue(x.status);
          web.getRange(x.row,7).setValue(x.member);
          web.getRange(x.row,17).setValue(x.device);
          web.getRange(x.row,18).setValue(x.memo);
          web.getRange(x.row,19).setValue(x.updated);
          ensureWebDerivedRow_(web,x.row);
        }catch(restoreErr){rollbackIssues.push(x.webId);}
      });
      try{audit.getRange(logRow,7).setValue(rollbackIssues.length?'復旧確認必要':'失敗・元に復旧');}catch(ignore){}
      throw Error(rollbackIssues.length?'切替に失敗しました。復旧確認が必要です':String(err.message||err));
    }
    return {ok:true,mioId:id,activeWebId:String(newWebId),retiredWebIds:oldStates.map(function(x){return x.webId})};

  }finally{
    lock.releaseLock();
  }
}

function verifyV187Ready_(){
  var ss=SpreadsheetApp.openById(SHEET_ID),web=ss.getSheetByName(WEB_TAB);
  var webRows=web?webActualRows_(web):[];
  var badWeb=[];
  webRows.forEach(function(r){
    if(r[5]==='承認済み'&&!webIntegrityOk_(r))badWeb.push({webId:String(r[0]||''),name:String(r[2]||''),h:String(r[7]||''),k:String(r[10]||''),p:String(r[15]||''),confirm:String(r[11]||'')});
  });

  var normal=catalog_(ss,'通常'),fest=catalog_(ss,'ラキフェス');
  var triggerNames=ScriptApp.getProjectTriggers().map(function(t){return t.getHandlerFunction()});
  var recoveryCount=triggerNames.filter(function(x){return x==='webRecoveryOnEdit_'}).length;
  var backupCount=triggerNames.filter(function(x){return x==='backupSweep_'}).length;

  return {
    ok:badWeb.length===0&&normal.ready&&fest.ready&&recoveryCount===1&&backupCount===0,
    webActualCount:web?webActualCount_(web):0,
    webIntegrityIssues:badWeb,
    normalReady:normal.ready,
    normalProbability:normal.total,
    luckyFestivalReady:fest.ready,
    luckyFestivalProbability:fest.total,
    secondSaveEnabled:false,
    webRecoveryTriggerCount:recoveryCount,
    backupTriggerCount:backupCount,
    triggers:triggerNames
  };
}
