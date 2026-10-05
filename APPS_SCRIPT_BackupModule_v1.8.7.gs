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

function backupEnsureRecovery_(ss){
  var sh=ss.getSheetByName('emuzii_復旧チェック');
  if(!sh){
    sh=ss.insertSheet('emuzii_復旧チェック');
    sh.getRange('A1:J1').setValues([['参加者ID','ColorSing名','正本ガチャ権利','正本残数','正本FA数','正本皆勤日数','第二保存確認','照合結果','最終確認','備考']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function backupHash_(text){
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text||''));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}

function backupAttemptsState_(id){
  var props=PropertiesService.getScriptProperties().getProperties();
  var prefix='CHECKIN_ATTEMPTS:'+String(id)+':',out=[];
  Object.keys(props).forEach(function(k){
    if(k.indexOf(prefix)!==0)return;
    var d=Number(k.slice(prefix.length)),n=Number(props[k]||0);
    if(Number.isSafeInteger(d)&&d>=1&&d<=31&&n>0)out.push([d,n]);
  });
  out.sort(function(a,b){return a[0]-b[0]});
  return out.length?out.map(function(x){return x[0]+':'+x[1]}).join(','):'なし';
}

function backupParticipantMetrics_(ss,id,name){
  id=String(id||'');name=String(name||'');
  var g=rows_(ss,'emuzii_ガチャ').filter(function(x){return x[0]===id&&x[1]===name});
  var gr=g.length===1?g[0]:null;
  var total=gr?(Number(gr[5])||0):0;
  var remaining=gr?(Number(gr[7])||0):0;
  var fa=rows_(ss,'emuzii_FA').filter(function(x){return x[1]===name&&x[10]==='受付'}).length;
  var att=rows_(ss,'emuzii_皆勤31日').filter(function(x){return x[0]===id&&x[1]===name});
  var days=att.length===1?(Number(att[0][33])||0):0;
  return [total,remaining,fa,days];
}

function backupParticipantState_(ss,id,name){
  var m=backupParticipantMetrics_(ss,id,name);
  var web=(typeof webActualRows_==='function'?webActualRows_(ss.getSheetByName(WEB_TAB)):rows_(ss,WEB_TAB)).filter(function(x){return x[2]===String(name||'')&&x[5]==='承認済み'&&x[7]===String(id||'')});
  return 'ガチャ'+m[0]+'／残'+m[1]+'／FA'+m[2]+'／皆勤'+m[3]+'／Web承認'+web.length+'／確認文字試行'+backupAttemptsState_(id);
}

function backupWebState_(ss,webId,name){
  var web=ss.getSheetByName(WEB_TAB);
  var list=(typeof webActualRows_==='function'?webActualRows_(web):rows_(ss,WEB_TAB)).filter(function(x){return x[0]===webId});
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

function backupMirrorMatrix_(secondarySs,name,m){
  var dst=secondarySs.getSheetByName(name);
  if(!dst)dst=secondarySs.insertSheet(name);
  var clearRows=Math.max(dst.getLastRow(),m.rows,1),clearCols=Math.max(dst.getLastColumn(),m.cols,1);
  if(dst.getMaxRows()<clearRows)dst.insertRowsAfter(dst.getMaxRows(),clearRows-dst.getMaxRows());
  if(dst.getMaxColumns()<clearCols)dst.insertColumnsAfter(dst.getMaxColumns(),clearCols-dst.getMaxColumns());
  dst.getRange(1,1,clearRows,clearCols).clearContent();
  if(m.rows&&m.cols)dst.getRange(1,1,m.rows,m.cols).setValues(m.data);
  SpreadsheetApp.flush();
  var copied=backupMatrix_(dst);
  return m.rows===copied.rows&&m.cols===copied.cols&&backupMatrixHash_(m)===backupMatrixHash_(copied);
}

function backupRefreshRecoveryCheck_(primarySs,secondarySs,globalOk,note){
  var primarySh=backupEnsureRecovery_(primarySs);
  var secondarySh=secondarySs?backupEnsureRecovery_(secondarySs):null;
  var participants=rows_(primarySs,'emuzii_参加者').filter(function(p){return /^MIO-\d{4}$/.test(String(p[0]||''))&&String(p[1]||'').trim()!==''});
  var now=new Date(),rows=[];
  participants.forEach(function(p){
    var id=String(p[0]),name=String(p[1]);
    var pm=backupParticipantMetrics_(primarySs,id,name);
    var sm=secondarySs?backupParticipantMetrics_(secondarySs,id,name):[-1,-1,-1,-1];
    var same=!!globalOk&&JSON.stringify(pm)===JSON.stringify(sm);
    var memo=(note?String(note)+'／':'')+'第二保存照合 '+Utilities.formatDate(now,'Asia/Tokyo','yyyy/MM/dd HH:mm:ss')+' JST';
    if(id==='MIO-0004'&&name==='翠央(お試し)')memo+='／管理者テスト・承認済み維持';
    rows.push([id,safeText_(name),pm[0],pm[1],pm[2],pm[3],same?'一致':'要確認',same?'一致':'要確認',now,memo]);
  });

  var clearPrimary=Math.max(primarySh.getLastRow()-1,0);
  if(clearPrimary>0)primarySh.getRange(2,1,clearPrimary,10).clearContent();
  if(rows.length)primarySh.getRange(2,1,rows.length,10).setValues(rows);

  if(secondarySh){
    var clearSecondary=Math.max(secondarySh.getLastRow()-1,0);
    if(clearSecondary>0)secondarySh.getRange(2,1,clearSecondary,10).clearContent();
    if(rows.length)secondarySh.getRange(2,1,rows.length,10).setValues(rows);
  }
}

function backupMirrorSelected_(primarySs,names,refreshStatus,force){
  var secondary=null,bad=[],changed=[],props=PropertiesService.getScriptProperties();
  try{
    secondary=SpreadsheetApp.openById(SECONDARY_SHEET_ID);
    names.forEach(function(name){
      var src=primarySs.getSheetByName(name);
      if(!src){bad.push(name);return;}
      var m=backupMatrix_(src),hash=backupMatrixHash_(m),key='BACKUP_TAB_HASH:'+name;
      if(!force&&props.getProperty(key)===hash)return;
      if(backupMirrorMatrix_(secondary,name,m)){
        props.setProperty(key,hash);
        changed.push(name);
      }else bad.push(name);
    });
    var ok=bad.length===0;
    if(refreshStatus){
      backupRefreshRecoveryCheck_(primarySs,secondary,ok,ok?'重要シート同期一致':'不一致:'+bad.join(','));
      var cfg=primarySs.getSheetByName('emuzii_連携設定');
      if(cfg){
        cfg.getRange('B30').setValue(ok?'第二保存 同期正常':'第二保存 要確認');
        cfg.getRange('C30').setValue(Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd HH:mm:ss')+' JST / '+(changed.length?changed.join(','):'変更なし')+(bad.length?' / 不一致:'+bad.join(','):''));
      }
      if(ok)props.setProperty('BACKUP_LAST_MIRROR',new Date().toISOString());
    }
    return {ok:ok,bad:bad,changed:changed};
  }catch(err){
    if(refreshStatus)backupRefreshRecoveryCheck_(primarySs,null,false,'第二保存本体同期失敗');
    return {ok:false,bad:['SECONDARY_OPEN_OR_SYNC'],changed:changed};
  }
}

function backupMirrorCritical_(primarySs,force){
  return backupMirrorSelected_(primarySs,BACKUP_MIRROR_TABS,true,!!force);
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
  if(r[5]==='却下'||r[5]==='承認待ち')return true;
  if(r[5]!=='承認済み')return false;
  var h=String(r[7]||''),k=String(r[10]||''),p=String(r[15]||'');
  if(!h)return false;
  if(k&&k!==h)return false;
  if(p&&p!==h)return false;
  return r[11]==='確認済み';
}

function backupAfterWebMutation_(ss,webId,name,operation,note){
  var web=ss.getSheetByName(WEB_TAB);
  var current=(typeof webActualRows_==='function'?webActualRows_(web):rows_(ss,WEB_TAB)).filter(function(x){return x[0]===webId});
  var id=current.length===1?String(current[0][7]||current[0][10]||webId):String(webId||'');
  var logged=backupAppend_(ss,id,name,'Web登録',operation,note||'');
  var mirrored=backupMirrorSelected_(ss,['emuzii_Web登録','emuzii_参加者'],false,false);
  return logged&&mirrored.ok;
}

function backupAfterParticipantMutation_(ss,id,name,dataType,operation,note){
  var logged=backupAppend_(ss,id,name,dataType,operation,note||'');
  var tabs=[];
  if(String(dataType).indexOf('ガチャ')>=0)tabs=['emuzii_当選履歴','emuzii_ガチャ'];
  else if(String(dataType).indexOf('皆勤')>=0)tabs=['emuzii_皆勤31日'];
  else if(String(dataType).indexOf('FA')>=0)tabs=['emuzii_FA'];
  else tabs=['emuzii_参加者'];
  var mirrored=backupMirrorSelected_(ss,tabs,false,false);
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
    var mirrored=backupMirrorCritical_(ss,false);
    changes.forEach(function(x){
      if(backupAppend_(ss,x.id,x.name,'定期保存','差分スナップショット','差分回収／本体同期'+(mirrored.ok?'一致':'要確認'))){
        props.setProperty('BACKUP_STATE:'+x.id,x.hash);
      }
    });
  }finally{
    lock.releaseLock();
  }
}

function verifyBackupV187_(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  return backupMirrorCritical_(ss,true);
}

function setupBackupV187_(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  backupEnsureLog_(ss);
  backupEnsureLog_(SpreadsheetApp.openById(SECONDARY_SHEET_ID));
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction()==='backupSweep_')ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupSweep_').timeBased().everyMinutes(BACKUP_SWEEP_MINUTES).create();
  var mirrored=backupMirrorCritical_(ss,true);
  backupSweep_();
  var cfg=ss.getSheetByName('emuzii_連携設定');
  if(cfg){
    cfg.getRange('B31').setValue('GAS v1.8.7 自動二重保存 稼働');
    cfg.getRange('C31').setValue('即時変更シート同期＋5分差分照合'+(mirrored.ok?'':'（要確認）'));
  }
}
