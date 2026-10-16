/**
 * v1.9.7 SAFETY CANDIDATE: identity verified browser switch module.
 * Derived from v1.8.9 historical reference. NOT DEPLOYED.
 */
/**
 * 翠央1周年 v1.8.9 端末切替・重複整理
 * v1.8.8の既存Code.gsを維持し、このファイルを既存端末復旧ファイルと置き換える。
 * 管理者が emuzii_Web登録 の「登録承認」を承認済みに変更した時だけ端末整理を行う。
 * 「翠央(お試し)」は自動却下しない。
 * 二重保存・第二保存にはアクセスしない。
 */


/**
 * Add only the v1.8.9 review sheets to the existing v1.8.8 project.
 * Do not call setup(): it rewrites existing admin ranges and can disturb the
 * v1.8.8 gacha controls. The existing webRecoveryOnEdit_ trigger is reused.
 */
function setupV189Complete(){throw Error('旧トリガーの再設定は禁止。ブラウザ追加パッチの現行トリガーを維持してください');}
function setupWebRecoveryV189_(){throw Error('旧トリガーの再設定は禁止');}

var DUP_REVIEW_TAB_V189='emuzii_重複整理';
var DUP_AUDIT_TAB_V189='emuzii_端末切替履歴';

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
function setupV189DuplicateReview_(){throw Error('管理画面初期化は既存データを消すため禁止');}
function refreshDuplicateReviewV189_(){
  if(typeof refreshBrowserAddReviewV189Patch_!=='function')
    throw Error('安全版ブラウザ追加モジュールが必要です');
  return refreshBrowserAddReviewV189Patch_();
}

/** Editing F=承認済み does NOT switch existing users behind their backs. */
function webRecoveryOnEdit_(e){throw Error('旧端末管理トリガーは停止済み。新管理トリガーを利用してください');}

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
    if(id==='MIO-0004'||name==='翠央(お試し)')throw Error('管理者テスト用端末は切替対象外です');
    if(v[5]!=='承認済み'&&v[5]!=='承認待ち')throw Error('切替対象の承認状態が不正です');
    if(String(v[16]||'')==='旧端末')throw Error('旧端末として失効済みの登録は再承認できません');
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

function verifyV188Ready_(){
  var ss=SpreadsheetApp.openById(SHEET_ID),web=ss.getSheetByName(WEB_TAB);
  var webRows=web?webActualRows_(web):[];
  var badWeb=[];
  webRows.forEach(function(r){
    if(r[5]==='承認済み'&&!webIntegrityOk_(r))badWeb.push({webId:String(r[0]||''),name:String(r[2]||''),h:String(r[7]||''),k:String(r[10]||''),p:String(r[15]||''),confirm:String(r[11]||'')});
  });

  var normal=catalog_(ss,'通常'),fest=catalog_(ss,'ラキフェス');
  var triggerNames=ScriptApp.getProjectTriggers().map(function(t){return t.getHandlerFunction()});
  var recoveryCount=triggerNames.filter(function(x){return x==='webRecoveryOnEditBrowserPatchV189_'}).length;
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

function verifyV189Ready_(){
  var base=verifyV188Ready_();
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var review=ss.getSheetByName(DUP_REVIEW_TAB_V189);
  var audit=ss.getSheetByName(DUP_AUDIT_TAB_V189);
  var result={
    ok:!!(base&&base.ok&&review&&audit&&typeof activeWebDeviceErrorV189_==='function'),
    v188:base,
    duplicateReviewReady:!!review,
    deviceSwitchAuditReady:!!audit,
    apiDeviceGuardReady:typeof activeWebDeviceErrorV189_==='function'
  };
  return result;
}

function runV189Check(){
  var result=verifyV189Ready_();
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
