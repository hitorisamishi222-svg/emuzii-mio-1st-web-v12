/**
 * 翠央1周年 v1.8.7 追加モジュール
 * 第二保存・復旧監査・Web統合整合チェック
 * 既存 APPS_SCRIPT_Code_v1.8.6.gs と同じ Apps Script プロジェクトへ追加して使用する。
 * 新しい Apps Script プロジェクトは作らない。
 */
var SECONDARY_SHEET_ID = '1rEInhrjUOhBajdq-6uOqdIQ5-8VFguutgdmfK9iVa6w';
var BACKUP_LOG_TAB = 'emuzii_バックアップ履歴';
var BACKUP_SWEEP_MINUTES = 5;
var BACKUP_MIRROR_TABS = [
  'フォームの回答 1','フォームの回答 2','フォームの回答 3',
  'emuzii_景品設定','emuzii_当選履歴','emuzii_Web登録','emuzii_参加者',
  'emuzii_管理画面','emuzii_皆勤31日','emuzii_予想ランキング','emuzii_FA',
  'emuzii_ガチャ','emuzii_景品集計','emuzii_統合進捗','emuzii_公開用',
  'emuzii_個人進捗','emuzii_スマホ表示'
];

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

function backupAttemptsState_(id){
  var out=[];
  for(var d=1;d<=31;d++){
    var n=checkinAttempts_(id,d);
    if(n>0)out.push(d+':'+n);
  }
  return out.length?out.join(','):'なし';
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
  return 'ガチャ'+total+'／残'+remaining+'／FA'+fa+'／皆勤'+days+'／Web承認'+web.length+'／確認文字試行'+backupAttemptsState_(id);
}

function backupWebState_(ss,webId,name){
  var list=rows_(ss,WEB_TAB).filter(function(x){return x[0]===webId});
  if(list.length!==1)return 'Web登録未確認';
  var r=list[0];
  var integrated=String(r[7]||r[10]||'未接続');
  return 'Web状態'+String(r[5]||'')+'／統合'+integrated+'／名前照合'+String(r[9]||'');
}

function backupState_(ss,id,name){
  return /^MIO-\d{4}$/.test(String(id||''))?backupParticipantState_(ss,id,name):backupWebState_(ss,id,name);
}

function backupMatrix_(sh){
  var lastRow=sh.getLastRow(),lastCol=sh.getLastColumn();
  if(lastRow<1||lastCol<1)return {rows:0,cols:0,data:[]};
  var rg=sh.getRange(1,1,lastRow,lastCol),values=rg.getValues(),formulas=rg.getFormulas();
  for(var r=0;r<values.length;r++)for(var c=0;c<values[r].length;c++)if(formulas[r][c])values[r][c]=formulas[r][c];
  return {rows:lastRow,cols:lastCol,data:values};
}

function backupMatrixHash_(m){
  return backupHash_(JSON.stringify(m.data));
}

function backupMirrorOne_(primarySs,secondarySs,name){
  var src=primarySs.getSheetByName(name),dst=secondarySs.getSheetByName(name);
  if(!src)return {name:name,ok:false,error:'正本シートなし'};
  if(!dst)dst=secondarySs.insertSheet(name);
  var m=backupMatrix_(src);
  var clearRows=Math.max(dst.getLastRow(),m.rows,1),clearCols=Math.max(dst.getLastColumn(),m.cols,1);
  if(dst.getMaxRows()<clearRows)dst.insertRowsAfter(dst.getMaxRows(),clearRows-dst.getMaxRows());
  if(dst.getMaxColumns()<clearCols)dst.insertColumnsAfter(dst.getMaxColumns(),clearCols-dst.getMaxColumns());
  dst.getRange(1,1,clearRows,clearCols).clearContent();
  if(m.rows&&m.cols)dst.getRange(1,1,m.rows,m.cols).setValues(m.data);
  SpreadsheetApp.flush();
  var copied=backupMatrix_(dst);
  return {name:name,ok:m.rows===copied.rows&&m.cols===copied.cols&&backupMatrixHash_(m)===backupMatrixHash_(copied)};
}

function backupRefreshRecoveryCheck_(primarySs,ok,note){
  var sh=primarySs.getSheetByName('emuzii_復旧チェック');
  if(!sh||sh.getLastRow()<2)return;
  var n=sh.getLastRow()-1,now=Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd HH:mm:ss');
  var g=[],j=[];
  for(var i=0;i<n;i++){
    g.push([ok?'一致':'要確認']);
    j.push([(note?String(note)+'／':'')+'第二保存最終同期 '+now]);
  }
  sh.getRange(2,7,n,1).setValues(g);
  sh.getRange(2,10,n,1).setValues(j);
}

function backupMirrorCritical_(primarySs){
  try{
    var secondary=SpreadsheetApp.openById(SECONDARY_SHEET_ID),bad=[];
    BACKUP_MIRROR_TABS.forEach(function(name){
      var result=backupMirrorOne_(primarySs,secondary,name);
      if(!result.ok)bad.push(result.name);
    });
    var ok=bad.length===0;
    backupRefreshRecoveryCheck_(primarySs,ok,ok?'重要シート同期一致':'不一致:'+bad.join(','));
    var cfg=primarySs.getSheetByName('emuzii_連携設定');
    if(cfg){
      cfg.getRange('B30').setValue(ok?'第二保存 同期正常':'第二保存 要確認');
      cfg.getRange('C30').setValue(Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd HH:mm:ss')+' JST'+(bad.length?' / '+bad.join(','):' / 重要シート照合済み'));
    }
    if(ok)PropertiesService.getScriptProperties().setProperty('BACKUP_LAST_MIRROR',new Date().toISOString());
    return {ok:ok,bad:bad};
  }catch(err){
    backupRefreshRecoveryCheck_(primarySs,false,'第二保存本体同期失敗');
    return {ok:false,bad:['SECONDARY_OPEN_OR_SYNC']};
  }
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
  var logged=backupAppend_(ss,id,name,'Web登録',operation,note||'');
  var mirrored=backupMirrorCritical_(ss);
  return logged&&mirrored.ok;
}

function backupAfterParticipantMutation_(ss,id,name,dataType,operation,note){
  var logged=backupAppend_(ss,id,name,dataType,operation,note||'');
  var mirrored=backupMirrorCritical_(ss);
  return logged&&mirrored.ok;
}

function backupSweep_(){
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))return;
  try{
    var ss=SpreadsheetApp.openById(SHEET_ID);
    var props=PropertiesService.getScriptProperties(),changes=[];
    rows_(ss,'emuzii_参加者').forEach(function(p){
      var id=String(p[0]||''),name=String(p[1]||'');
      if(!/^MIO-\d{4}$/.test(id)||!name)return;
      var state=backupParticipantState_(ss,id,name);
      var hash=backupHash_(state);
      if(props.getProperty('BACKUP_STATE:'+id)!==hash)changes.push({id:id,name:name,state:state,hash:hash});
    });
    var mirrored=backupMirrorCritical_(ss);
    changes.forEach(function(x){
      if(backupAppend_(ss,x.id,x.name,'定期保存','差分スナップショット','管理画面・フォーム・Web更新の差分回収／本体同期'+(mirrored.ok?'一致':'要確認'))){
        props.setProperty('BACKUP_STATE:'+x.id,x.hash);
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
  var mirrored=backupMirrorCritical_(ss);
  backupSweep_();
  var cfg=ss.getSheetByName('emuzii_連携設定');
  if(cfg){
    cfg.getRange('B31').setValue('GAS v1.8.7 自動二重保存 稼働');
    cfg.getRange('C31').setValue('即時保存＋5分差分スナップショット＋重要シート本体同期'+(mirrored.ok?'':'（要確認）'));
  }
}
