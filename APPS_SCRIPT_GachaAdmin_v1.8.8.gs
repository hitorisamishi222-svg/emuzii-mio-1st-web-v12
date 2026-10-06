/**
 * 翠央1周年 v1.8.8 ガチャ管理補助
 * 管理画面 I16:L25 に運用スイッチと回数付与UIを作る。
 * 本番適用前の準備ファイル。第二保存にはアクセスしない。
 */
var GACHA_ADMIN_TAB='emuzii_管理画面';
var GACHA_GRANT_HISTORY_TAB='emuzii_ガチャ付与履歴';
var GACHA_NORMAL_SWITCH='J17';
var GACHA_FEST_SWITCH='J18';
var GACHA_GRANT_ID='J21';
var GACHA_GRANT_AMOUNT='J23';
var GACHA_GRANT_REASON='J24';
var GACHA_GRANT_EXECUTE='J25';
var GACHA_GRANT_STATUS='L25';

function setupGachaAdminV188_(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var admin=ss.getSheetByName(GACHA_ADMIN_TAB);
  var gacha=ss.getSheetByName('emuzii_ガチャ');
  if(!admin||!gacha)return;

  admin.getRange('I16:L16').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
  admin.getRange('I16').setValue('🎰 ガチャ運用');
  admin.getRange('I17').setValue('メンシプガチャ');
  admin.getRange('I18').setValue('ラキフェスガチャ');

  var normalValue=admin.getRange(GACHA_NORMAL_SWITCH).getValue()===true;
  var festValue=admin.getRange(GACHA_FEST_SWITCH).getValue()===true;
  admin.getRange(GACHA_NORMAL_SWITCH).insertCheckboxes().setValue(normalValue);
  admin.getRange(GACHA_FEST_SWITCH).insertCheckboxes().setValue(festValue);
  admin.getRange('K17').setFormula('=IF(J17,"🟢 受付中","🔴 停止中")');
  admin.getRange('K18').setFormula('=IF(J18,"🟢 受付中","🔴 停止中")');
  admin.getRange('L17').setValue('必要な時だけON');
  admin.getRange('L18').setValue('必要な時だけON');

  admin.getRange('I20:L20').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
  admin.getRange('I20').setValue('🎁 ガチャ回数付与');
  admin.getRange('I21').setValue('参加者ID');
  admin.getRange('K21').setValue('ColorSing名');
  admin.getRange('I22').setValue('総権利');
  admin.getRange('K22').setValue('残り');
  admin.getRange('I23').setValue('追加回数');
  admin.getRange('K23').setValue('使用済');
  admin.getRange('I24').setValue('付与理由');
  admin.getRange('I25').setValue('付与実行');
  admin.getRange('K25').setValue('チェックで実行');

  var idRule=SpreadsheetApp.newDataValidation().requireValueInRange(gacha.getRange('A2:A500'),true).setAllowInvalid(false).build();
  admin.getRange(GACHA_GRANT_ID).setDataValidation(idRule);
  admin.getRange(GACHA_GRANT_AMOUNT).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(1,100).setAllowInvalid(false).setHelpText('1〜100の整数。通常は1/3/5などを入力').build()).setNumberFormat('0');
  var executeValue=admin.getRange(GACHA_GRANT_EXECUTE).getValue()===true;
  admin.getRange(GACHA_GRANT_EXECUTE).insertCheckboxes().setValue(executeValue);

  admin.getRange('L21').setFormula('=IFERROR(INDEX(\'emuzii_ガチャ\'!$B$2:$B$500,MATCH(J21,\'emuzii_ガチャ\'!$A$2:$A$500,0)),"")');
  admin.getRange('J22').setFormula('=IFERROR(INDEX(\'emuzii_ガチャ\'!$F$2:$F$500,MATCH(J21,\'emuzii_ガチャ\'!$A$2:$A$500,0)),"")');
  admin.getRange('L22').setFormula('=IFERROR(INDEX(\'emuzii_ガチャ\'!$H$2:$H$500,MATCH(J21,\'emuzii_ガチャ\'!$A$2:$A$500,0)),"")');
  admin.getRange('L23').setFormula('=IF(OR(J22="",L22=""),"",J22-L22)');

  admin.getRange(GACHA_NORMAL_SWITCH).setNote('OFF中はリスナー画面でもメンシプガチャを実行できません。権利・履歴は保持します。');
  admin.getRange(GACHA_FEST_SWITCH).setNote('OFF中はリスナー画面でもラキフェスを実行できません。権利・履歴は保持します。');
  admin.getRange(GACHA_GRANT_EXECUTE).setNote('参加者ID・追加回数・付与理由を確認してからチェック。付与後は自動でOFFへ戻ります。');
  admin.setColumnWidth(9,140);
  admin.setColumnWidth(10,150);
  admin.setColumnWidth(11,120);
  admin.setColumnWidth(12,220);

  var history=ss.getSheetByName(GACHA_GRANT_HISTORY_TAB);
  if(!history){
    history=ss.insertSheet(GACHA_GRANT_HISTORY_TAB);
    history.appendRow(['日時','参加者ID','ColorSing名','付与回数','付与理由','変更前特別付与','変更後特別付与','変更後総権利','変更後残り']);
    history.setFrozenRows(1);
    history.getRange('A1:I1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
    history.getRange('A2:A1000').setNumberFormat('yyyy/mm/dd hh:mm:ss');
  }
}

function gachaOpenState_(ss){
  var admin=ss.getSheetByName(GACHA_ADMIN_TAB);
  if(!admin)return {normalOpen:false,festOpen:false};
  return {
    normalOpen:admin.getRange(GACHA_NORMAL_SWITCH).getValue()===true,
    festOpen:admin.getRange(GACHA_FEST_SWITCH).getValue()===true
  };
}

function handleGachaAdminEdit_(e){
  if(!e||!e.range)return false;
  var sh=e.range.getSheet();
  if(sh.getName()!==GACHA_ADMIN_TAB)return false;
  if(e.range.getA1Notation()!==GACHA_GRANT_EXECUTE||String(e.value||'')!=='TRUE')return false;
  grantGachaFromAdmin_(sh.getParent());
  return true;
}

function grantGachaFromAdmin_(ss){
  var admin=ss.getSheetByName(GACHA_ADMIN_TAB);
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(5000)){
    admin.getRange(GACHA_GRANT_EXECUTE).setValue(false);
    admin.getRange(GACHA_GRANT_STATUS).setValue('⚠ 処理中です。少し待って再実行');
    return;
  }
  try{
    var id=String(admin.getRange(GACHA_GRANT_ID).getDisplayValue()||'').trim();
    var amount=Number(admin.getRange(GACHA_GRANT_AMOUNT).getValue());
    var reason=String(admin.getRange(GACHA_GRANT_REASON).getDisplayValue()||'').trim();
    if(!/^MIO-\d{4}$/.test(id))throw new Error('参加者IDを選択してください');
    if(!Number.isSafeInteger(amount)||amount<1||amount>100)throw new Error('追加回数は1〜100の整数で入力してください');
    if(!reason||reason.length>100)throw new Error('付与理由を100文字以内で入力してください');

    var gacha=ss.getSheetByName('emuzii_ガチャ');
    var last=Math.max(gacha.getLastRow(),2);
    var values=gacha.getRange(2,1,last-1,17).getValues();
    var row=0,name='';
    for(var i=0;i<values.length;i++){
      if(String(values[i][0]||'')===id){
        if(row)throw new Error('参加者IDが重複しています');
        row=i+2;
        name=String(values[i][1]||'');
      }
    }
    if(!row)throw new Error('ガチャ管理に対象参加者がいません');

    var specialCell=gacha.getRange(row,15);
    var before=Number(specialCell.getValue())||0;
    var after=before+amount;
    specialCell.setValue(after);
    SpreadsheetApp.flush();

    var total=Number(gacha.getRange(row,6).getValue())||0;
    var remaining=Number(gacha.getRange(row,8).getValue())||0;
    var history=ss.getSheetByName(GACHA_GRANT_HISTORY_TAB);
    if(!history)throw new Error('付与履歴シートがありません。setupV188Completeを実行してください');
    history.appendRow([new Date(),id,safeText_(name),amount,safeText_(reason),before,after,total,remaining]);

    admin.getRange(GACHA_GRANT_AMOUNT).clearContent();
    admin.getRange(GACHA_GRANT_REASON).clearContent();
    admin.getRange(GACHA_GRANT_EXECUTE).setValue(false);
    admin.getRange(GACHA_GRANT_STATUS).setValue('✅ '+name+' +'+amount+'回 / 残り'+remaining+'回');
  }catch(err){
    admin.getRange(GACHA_GRANT_EXECUTE).setValue(false);
    admin.getRange(GACHA_GRANT_STATUS).setValue('⚠ '+String(err&&err.message||err));
  }finally{
    lock.releaseLock();
  }
}
