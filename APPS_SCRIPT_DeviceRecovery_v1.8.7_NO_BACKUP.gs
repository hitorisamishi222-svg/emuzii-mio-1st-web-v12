/**
 * 翠央1周年 v1.8.7 NO-BACKUP 運用・端末復旧アドオン
 * APPS_SCRIPT_Code_v1.8.7_NO_BACKUP.gs と同じ既存Apps Scriptプロジェクトへ追加する。
 * 管理者が emuzii_Web登録 の「登録承認」を承認済みに変更した時だけ端末整理を行う。
 * 「翠央(お試し)」は自動却下しない。
 * 二重保存・第二保存にはアクセスしない。
 */

function setupV187Complete(){
  setup();
  setupWebRecoveryV187_();
}

function setupWebRecoveryV187_(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    var handler=t.getHandlerFunction();
    if(handler==='webRecoveryOnEdit_'||handler==='backupSweep_')ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('webRecoveryOnEdit_').forSpreadsheet(SHEET_ID).onEdit().create();
}

function webRecoveryOnEdit_(e){
  if(!e||!e.range)return;
  var sh=e.range.getSheet();
  if(sh.getName()!==WEB_TAB||e.range.getRow()<2||e.range.getColumn()!==6)return;
  if(String(e.value||'')!=='承認済み')return;

  var ss=sh.getParent(),row=e.range.getRow();
  var webId=String(sh.getRange(row,1).getDisplayValue()||'');
  var name=String(sh.getRange(row,3).getDisplayValue()||'').trim();
  if(!webId||!name)return;

  var people=rows_(ss,'emuzii_参加者').filter(function(p){
    return p[1]===name&&/^MIO-\d{4}$/.test(String(p[0]||''));
  });

  if(people.length!==1){
    sh.getRange(row,18).setValue((name==='翠央(お試し)'?'管理者テスト保護／':'')+'承認済みだがMIO-IDを一意に確認できません');
    sh.getRange(row,19).setValue(new Date());
    ensureWebDerivedRow_(sh,row);
    return;
  }

  var id=String(people[0][0]);
  sh.getRange(row,8).setValue(id);
  sh.getRange(row,10).setValue('既存一致');
  sh.getRange(row,11).setValue(id);
  sh.getRange(row,12).setValue('確認済み');
  sh.getRange(row,17).setValue('使用中');
  sh.getRange(row,18).setValue((name==='翠央(お試し)'?'管理者テスト保護／':'')+'承認端末を使用中に設定・'+id+'へ統合確認');
  sh.getRange(row,19).setValue(new Date());
  ensureWebDerivedRow_(sh,row);
  SpreadsheetApp.flush();

  if(name!=='翠央(お試し)'){
    var last=webActualLastRow_(sh);
    var values=last>=2?sh.getRange(2,1,last-1,20).getValues():[];
    for(var i=0;i<values.length;i++){
      var otherRow=i+2,r=values[i];
      if(otherRow===row||r[5]!=='承認済み')continue; // By MIO-ID, including approved nickname changes
      var otherId=String(r[7]||r[10]||r[15]||'');
      if(otherId!==id)continue;
      sh.getRange(otherRow,6).setValue('却下');
      sh.getRange(otherRow,17).setValue('旧端末');
      sh.getRange(otherRow,18).setValue('新端末 '+webId+' 承認により旧端末へ自動整理／'+id+'維持');
      sh.getRange(otherRow,19).setValue(new Date());
      ensureWebDerivedRow_(sh,otherRow);
    }
  }

  SpreadsheetApp.flush();
}

/**
 * Administrative repair for registrations which were already approved before
 * the onEdit device-switch trigger was installed. Call with the exact Web ID.
 * Requires an existing, confirmed MIO-ID-to-name link; no rows are deleted.
 * Never expose this function as a public doPost action.
 */
function switchApprovedWebRegistrationV189_(newWebId){
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw Error('他の登録更新が実行中です');
  try{
    var ss=SpreadsheetApp.openById(SHEET_ID);
    var web=ss.getSheetByName(WEB_TAB);
    if(!web)throw Error('Web登録シートが見つかりません');
    var rows=webActualRows_(web);
    var matches=[];
    for(var k=0;k<rows.length;k++){
      if(String(rows[k][0]||'')===String(newWebId||''))matches.push({row:k+2,data:rows[k]});
    }
    if(matches.length!==1)throw Error('対象Web登録IDが一意に見つかりません');
    var target=matches[0],record=target.data;
    var name=String(record[2]||''),mioId=String(record[7]||'');
    if(record[5]!=='承認済み')throw Error('新端末がまだ承認されていません');
    if(!/^MIO-\d{4}$/.test(mioId)||record[11]!=='確認済み')throw Error('MIO-IDと本人照合が必要です');
    var people=rows_(ss,'emuzii_参加者').filter(function(p){return String(p[0]||'')===mioId&&String(p[1]||'')===name;});
    if(people.length!==1)throw Error('本人の登録が一意ではありません');
    if(name==='翠央(お試し)')throw Error('管理者テスト端末は自動整理対象外です');

    var retired=[];
    for(var i=0;i<rows.length;i++){
      var otherRow=i+2,other=rows[i];
      if(otherRow===target.row||other[5]!=='承認済み'||String(other[7]||'')!==mioId)continue;
      web.getRange(otherRow,6).setValue('却下');
      web.getRange(otherRow,17).setValue('旧端末');
      web.getRange(otherRow,18).setValue('端末切替 '+newWebId+' により旧端末扱い／'+mioId+'維持');
      web.getRange(otherRow,19).setValue(new Date());
      ensureWebDerivedRow_(web,otherRow);
      retired.push(String(other[0]||''));
    }
    web.getRange(target.row,17).setValue('使用中');
    web.getRange(target.row,18).setValue('管理者の端末切替確認済／'+mioId+'維持');
    web.getRange(target.row,19).setValue(new Date());
    ensureWebDerivedRow_(web,target.row);
    SpreadsheetApp.flush();
    return {ok:true,mioId:mioId,activeWebId:String(newWebId),retiredWebIds:retired};
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
