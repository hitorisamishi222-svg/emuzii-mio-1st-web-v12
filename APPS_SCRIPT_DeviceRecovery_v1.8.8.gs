/**
 * 翠央1周年 v1.8.8 NO-BACKUP + GACHA ADMIN 運用・端末復旧アドオン
 * APPS_SCRIPT_Code_v1.8.8_NO_DUPLICATES.gs + APPS_SCRIPT_GachaAdmin_v1.8.8.gs と同じ既存Apps Scriptプロジェクトへ追加する。
 * 管理者が emuzii_Web登録 の「登録承認」を承認済みに変更した時だけ端末整理を行う。
 * 「翠央(お試し)」は自動却下しない。
 * 二重保存・第二保存にはアクセスしない。
 */

function setupV188Complete(){
  setup();
  setupWebRecoveryV188_();
}

function setupWebRecoveryV188_(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    var handler=t.getHandlerFunction();
    if(handler==='webRecoveryOnEdit_'||handler==='backupSweep_')ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('webRecoveryOnEdit_').forSpreadsheet(SHEET_ID).onEdit().create();
}

function webRecoveryOnEdit_(e){
  if(!e||!e.range)return;
  if(typeof handleGachaAdminEdit_==='function'&&handleGachaAdminEdit_(e))return;
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
      if(otherRow===row||String(r[2]||'')!==name||r[5]!=='承認済み')continue;
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

function verifyV188Ready_(){
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
  var adminTab=typeof GACHA_ADMIN_TAB==='undefined'?'emuzii_管理画面':GACHA_ADMIN_TAB;
  var grantTab=typeof GACHA_GRANT_HISTORY_TAB==='undefined'?'emuzii_ガチャ付与履歴':GACHA_GRANT_HISTORY_TAB;
  var admin=ss.getSheetByName(adminTab),grantHistory=ss.getSheetByName(grantTab);
  var gachaAdminReady=!!(admin&&grantHistory&&typeof gachaOpenState_==='function');
  var gate=gachaAdminReady?gachaOpenState_(ss):{normalOpen:false,festOpen:false};

  return {
    ok:badWeb.length===0&&normal.ready&&fest.ready&&recoveryCount===1&&backupCount===0&&gachaAdminReady,
    webActualCount:web?webActualCount_(web):0,
    webIntegrityIssues:badWeb,
    normalReady:normal.ready,
    normalProbability:normal.total,
    luckyFestivalReady:fest.ready,
    luckyFestivalProbability:fest.total,
    secondSaveEnabled:false,
    gachaAdminReady:gachaAdminReady,
    normalGachaOpen:gate.normalOpen,
    luckyFestivalGachaOpen:gate.festOpen,
    webRecoveryTriggerCount:recoveryCount,
    backupTriggerCount:backupCount,
    triggers:triggerNames
  };
}
