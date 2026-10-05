/**
 * 翠央1周年 v1.8.7 追加モジュール
 * 第二保存・復旧監査・Web統合整合チェック
 * 既存 APPS_SCRIPT_Code_v1.8.6.gs と同じ Apps Script プロジェクトへ追加して使用する。
 * 新しい Apps Script プロジェクトは作らない。
 */
var SECONDARY_SHEET_ID = '1rEInhrjUOhBajdq-6uOqdIQ5-8VFguutgdmfK9iVa6w';
var BACKUP_LOG_TAB = 'emuzii_バックアップ履歴';
var BACKUP_SWEEP_MINUTES = 5;

function backupEnsureLog_(ss){
  var sh=ss.getSheetByName(BACKUP_LOG_TAB);
  if(!sh){
    sh=ss.insertSheet(BACKUP_LOG_TAB);
    sh.getRange('A1:J1').setValues([['保存ID','保存日時','参加者ID','ColorSing名','データ種別','操作','正本値','第二保存値','照合結果','備考']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function backupHash_(text){
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text||''));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}

function backupParticipantState_(ss,id,name){
  id=String(id||'');name=String(name||'');
  var g=rows_(ss,'emuzii_ガチャ').filter(function(x){return x[0]===id&&x[1]===name});
  var gr=g.length===1?g[0]:null;
  var total=gr?(Number(gr[5])||0):0;
  var remaining=gr?(Number(gr[7])||0):0;
  var fa=rows_(ss,'emuzii_FA').filter(function(x){return x[1]===name&&x[10]==='受付'}).length;
  var att=rows_(ss,'emuzii_皆勤31日').filter(function(x){return x[0]===id&&x[1]===name});
  var days=att.length===1?(Number(att[0][33])||0):0;
  var web=rows_(ss,WEB_TAB).filter(function(x){return x[2]===name&&x[5]==='承認済み'&&x[7]===id});
  return 'ガチャ'+total+'／残'+remaining+'／FA'+fa+'／皆勤'+days+'／Web承認'+web.length;
}

function backupWebState_(ss,webId,name){
  var rows=rows_(ss,WEB_TAB).filter(function(x){return x[0]===webId});
  if(rows.length!==1)return 'Web登録未確認';
  var r=rows[0];
  var integrated=String(r[7]||r[10]||'未接続');
  return 'Web状態'+String(r[5]||'')+'／統合'+integrated+'／名前照合'+String(r[9]||'');
}

function backupState_(ss,id,name){
  return /^MIO-\d{4}$/.test(String(id||''))?backupParticipantState_(ss,id,name):backupWebState_(ss,id,name);
}

function backupAppend_(primarySs,id,name,dataType,operation,note){
  var now=new Date();
  var saveId='BK-'+Utilities.formatDate(now,'Asia/Tokyo','yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,8);
  id=String(id||'');name=String(name||'');
  var state=backupState_(primarySs,id,name);
  var primaryLog=backupEnsureLog_(primarySs);
  primaryLog.appendRow([saveId,now,id,safeText_(name),dataType,operation,state,'','保存中',note||'']);
  var primaryRow=primaryLog.getLastRow();
  try{
    var secondary=SpreadsheetApp.openById(SECONDARY_SHEET_ID);
    var secondaryLog=backupEnsureLog_(secondary);
    secondaryLog.appendRow([saveId,now,id,safeText_(name),dataType,operation,state,state,'一致',note||'']);
    SpreadsheetApp.flush();
    primaryLog.getRange(primaryRow,8,1,2).setValues([[state,'一致']]);
    if(/^MIO-\d{4}$/.test(id))PropertiesService.getScriptProperties().setProperty('BACKUP_STATE:'+id,backupHash_(state));
    return true;
  }catch(err){
    primaryLog.getRange(primaryRow,8,1,2).setValues([['','第二保存失敗']]);
    primaryLog.getRange(primaryRow,10).setValue((note?String(note)+'／':'')+'第二保存エラー');
    return false;
  }
}

function backupWebIntegrity_(r){
  if(!r)return false;
  if(r[5]==='却下')return true;
  if(r[5]==='承認待ち')return true;
  if(r[5]!=='承認済み')return false;
  var h=String(r[7]||''),k=String(r[10]||''),p=String(r[15]||'');
  if(!h)return false;
  if(k&&k!==h)return false;
  if(p&&p!==h)return false;
  return true;
}

function backupAfterWebMutation_(ss,webId,name,operation,note){
  var current=rows_(ss,WEB_TAB).filter(function(x){return x[0]===webId});
  var id=current.length===1?String(current[0][7]||current[0][10]||webId):String(webId||'');
  return backupAppend_(ss,id,name,'Web登録',operation,note||'');
}

function backupAfterParticipantMutation_(ss,id,name,dataType,operation,note){
  return backupAppend_(ss,id,name,dataType,operation,note||'');
}

function backupSweep_(){
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))return;
  try{
    var ss=SpreadsheetApp.openById(SHEET_ID);
    var props=PropertiesService.getScriptProperties();
    rows_(ss,'emuzii_参加者').forEach(function(p){
      var id=String(p[0]||''),name=String(p[1]||'');
      if(!/^MIO-\d{4}$/.test(id)||!name)return;
      var state=backupParticipantState_(ss,id,name);
      var hash=backupHash_(state);
      if(props.getProperty('BACKUP_STATE:'+id)!==hash){
        if(backupAppend_(ss,id,name,'定期保存','差分スナップショット','管理画面・フォーム・Web更新の差分回収')){
          props.setProperty('BACKUP_STATE:'+id,hash);
        }
      }
    });
  }finally{
    lock.releaseLock();
  }
}

function setupBackupV187_(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  backupEnsureLog_(ss);
  backupEnsureLog_(SpreadsheetApp.openById(SECONDARY_SHEET_ID));
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction()==='backupSweep_')ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupSweep_').timeBased().everyMinutes(BACKUP_SWEEP_MINUTES).create();
  backupSweep_();
  var cfg=ss.getSheetByName('emuzii_連携設定');
  if(cfg){
    cfg.getRange('B31').setValue('GAS v1.8.7 自動二重保存 稼働');
    cfg.getRange('C31').setValue('即時保存＋5分差分スナップショット');
  }
}
