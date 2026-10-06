from pathlib import Path

# This script prepares v1.8.8 files only on the feature branch.
# It does not deploy Apps Script or change the production spreadsheet.

core_path = Path('APPS_SCRIPT_Code_v1.8.8_NO_DUPLICATES.gs')
core = core_path.read_text(encoding='utf-8')

old = "function setup() {\n  setupGacha_();"
new = "function setup() {\n  setupGacha_();\n  setupGachaAdminV188_();"
if old not in core:
    raise SystemExit('setup insertion point not found')
core = core.replace(old, new, 1)

old = """  var festEntitled=total>=festAvailableFrom;
  var festUnlocked=festEntitled&&history.length>=festAvailableFrom-1&&remaining>0;

  if(d.action==='catalog')return {ok:true,participantId:r[0],confirmed:confirmed,remaining:confirmed?remaining:0,used:used,nextOrdinal:used+1,festEntitled:festEntitled,festUnlocked:festUnlocked,festAvailableFrom:festAvailableFrom,webDrawsUsed:history.length,normal:normal,fest:fest};"""
new = """  var festEntitled=total>=festAvailableFrom;
  var festUnlocked=festEntitled&&history.length>=festAvailableFrom-1&&remaining>0;
  var gate=gachaOpenState_(ss);

  if(d.action==='catalog')return {ok:true,participantId:r[0],confirmed:confirmed,remaining:confirmed?remaining:0,used:used,nextOrdinal:used+1,festEntitled:festEntitled,festUnlocked:festUnlocked,festAvailableFrom:festAvailableFrom,webDrawsUsed:history.length,normalOpen:gate.normalOpen,festOpen:gate.festOpen,normal:normal,fest:fest};"""
if old not in core:
    raise SystemExit('catalog response insertion point not found')
core = core.replace(old, new, 1)

old = """  if(!confirmed)return {ok:false,error:'メンシプ購入の確認をお待ちください'};"""
new = """  if(d.mode==='通常'&&!gate.normalOpen)return {ok:false,error:'メンシプガチャは現在停止中です'};
  if(d.mode==='ラキフェス'&&!gate.festOpen)return {ok:false,error:'ラキフェスガチャは現在停止中です'};
  if(!confirmed)return {ok:false,error:'メンシプ購入の確認をお待ちください'};"""
if old not in core:
    raise SystemExit('draw gate insertion point not found')
core = core.replace(old, new, 1)

core_path.write_text(core, encoding='utf-8')

admin_module = r'''/**
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
'''
Path('APPS_SCRIPT_GachaAdmin_v1.8.8.gs').write_text(admin_module, encoding='utf-8')

recovery = Path('APPS_SCRIPT_DeviceRecovery_v1.8.7_NO_BACKUP.gs').read_text(encoding='utf-8')
recovery = recovery.replace('翠央1周年 v1.8.7 NO-BACKUP', '翠央1周年 v1.8.8 NO-BACKUP + GACHA ADMIN')
recovery = recovery.replace('APPS_SCRIPT_Code_v1.8.7_NO_BACKUP.gs', 'APPS_SCRIPT_Code_v1.8.8_NO_DUPLICATES.gs + APPS_SCRIPT_GachaAdmin_v1.8.8.gs')
recovery = recovery.replace('function setupV187Complete(){', 'function setupV188Complete(){')
recovery = recovery.replace('setupWebRecoveryV187_();', 'setupWebRecoveryV188_();')
recovery = recovery.replace('function setupWebRecoveryV187_(){', 'function setupWebRecoveryV188_(){')
recovery = recovery.replace("function verifyV187Ready_(){", "function verifyV188Ready_(){")
old = """function webRecoveryOnEdit_(e){
  if(!e||!e.range)return;
  var sh=e.range.getSheet();"""
new = """function webRecoveryOnEdit_(e){
  if(!e||!e.range)return;
  if(typeof handleGachaAdminEdit_==='function'&&handleGachaAdminEdit_(e))return;
  var sh=e.range.getSheet();"""
if old not in recovery:
    raise SystemExit('recovery onEdit insertion point not found')
recovery = recovery.replace(old, new, 1)
old = """  var recoveryCount=triggerNames.filter(function(x){return x==='webRecoveryOnEdit_'}).length;
  var backupCount=triggerNames.filter(function(x){return x==='backupSweep_'}).length;

  return {
    ok:badWeb.length===0&&normal.ready&&fest.ready&&recoveryCount===1&&backupCount===0,"""
new = """  var recoveryCount=triggerNames.filter(function(x){return x==='webRecoveryOnEdit_'}).length;
  var backupCount=triggerNames.filter(function(x){return x==='backupSweep_'}).length;
  var admin=ss.getSheetByName(GACHA_ADMIN_TAB),grantHistory=ss.getSheetByName(GACHA_GRANT_HISTORY_TAB);
  var gachaAdminReady=!!(admin&&grantHistory),gate=gachaAdminReady?gachaOpenState_(ss):{normalOpen:false,festOpen:false};

  return {
    ok:badWeb.length===0&&normal.ready&&fest.ready&&recoveryCount===1&&backupCount===0&&gachaAdminReady,"""
if old not in recovery:
    raise SystemExit('verify insertion point not found')
recovery = recovery.replace(old, new, 1)
old = """    secondSaveEnabled:false,
    webRecoveryTriggerCount:recoveryCount,"""
new = """    secondSaveEnabled:false,
    gachaAdminReady:gachaAdminReady,
    normalGachaOpen:gate.normalOpen,
    luckyFestivalGachaOpen:gate.festOpen,
    webRecoveryTriggerCount:recoveryCount,"""
if old not in recovery:
    raise SystemExit('verify fields insertion point not found')
recovery = recovery.replace(old, new, 1)
Path('APPS_SCRIPT_DeviceRecovery_v1.8.8.gs').write_text(recovery, encoding='utf-8')

js = Path('gacha-page.js').read_text(encoding='utf-8')
old = """function setButtons(c){
  const pending=remember(),start=Number(c.festAvailableFrom)||5;
  $('drawNormal').disabled=!!pending||!c.confirmed||c.remaining<1||!c.normal.ready;
  $('drawFest').disabled=!!pending||!c.confirmed||c.remaining<1||!c.festUnlocked||!c.fest.ready;
  $('drawFest').textContent=c.festUnlocked?'ラキフェスを引く':`${start}回目から解放`;
  $('retryDraw').hidden=!pending
}"""
new = """function setButtons(c){
  const pending=remember(),start=Number(c.festAvailableFrom)||5,normalOpen=c.normalOpen===true,festOpen=c.festOpen===true;
  $('drawNormal').disabled=!!pending||!normalOpen||!c.confirmed||c.remaining<1||!c.normal.ready;
  $('drawFest').disabled=!!pending||!festOpen||!c.confirmed||c.remaining<1||!c.festUnlocked||!c.fest.ready;
  $('drawNormal').textContent=normalOpen?'メンシプガチャを引く':'メンシプガチャ（停止中）';
  $('drawFest').textContent=!festOpen?'ラキフェス（停止中）':c.festUnlocked?'ラキフェスを引く':`${start}回目から解放`;
  $('retryDraw').hidden=!pending
}"""
if old not in js:
    raise SystemExit('JS setButtons block not found')
js = js.replace(old, new, 1)
old = """function statusText(c){const start=Number(c.festAvailableFrom)||5,next=Number(c.nextOrdinal)||1;if(!c.confirmed)return 'メンシプ購入の確認をお待ちください。';if(c.remaining<1)return 'ガチャ権利をすべて使用済みです。';if(!c.normal.ready&&!c.fest.ready)return '景品設定中です。';if(!c.festEntitled)return `メンシプガチャを利用できます。総ガチャ権利${start}回以上でラキフェス対象になります。`;if(!c.festUnlocked)return `ラキフェス対象です。あと${Math.max(0,start-next)}回メンシプガチャを引くと、${start}回目からラキフェスを選べます。`;return `${start}回目以降です。メンシプガチャ／ラキフェスを選んで抽選できます。`}"""
new = """function statusText(c){const start=Number(c.festAvailableFrom)||5,next=Number(c.nextOrdinal)||1;if(!c.confirmed)return 'メンシプ購入の確認をお待ちください。';if(c.remaining<1)return 'ガチャ権利をすべて使用済みです。';if(!c.normalOpen&&!c.festOpen)return 'メンシプガチャ／ラキフェスは現在停止中です。';if(!c.normal.ready&&!c.fest.ready)return '景品設定中です。';if(!c.festEntitled)return c.normalOpen?`メンシプガチャを利用できます。総ガチャ権利${start}回以上でラキフェス対象になります。`:'メンシプガチャは現在停止中です。';if(!c.festUnlocked)return c.normalOpen?`ラキフェス対象です。あと${Math.max(0,start-next)}回メンシプガチャを引くと、${start}回目からラキフェスを選べます。`:'メンシプガチャは現在停止中です。';if(c.normalOpen&&c.festOpen)return `${start}回目以降です。メンシプガチャ／ラキフェスを選んで抽選できます。`;if(c.festOpen)return 'ラキフェスのみ受付中です。';return 'メンシプガチャのみ受付中です。'}"""
if old not in js:
    raise SystemExit('JS statusText block not found')
js = js.replace(old, new, 1)
old = """const ok=mode==='通常'?lastCatalog.normal.ready:lastCatalog.festUnlocked&&lastCatalog.fest.ready;"""
new = """const ok=mode==='通常'?lastCatalog.normalOpen&&lastCatalog.normal.ready:lastCatalog.festOpen&&lastCatalog.festUnlocked&&lastCatalog.fest.ready;"""
if old not in js:
    raise SystemExit('JS start gate not found')
js = js.replace(old, new, 1)
Path('gacha-page.v1.8.8_PREP.js').write_text(js, encoding='utf-8')

handoff = '''# v1.8.8 ガチャ運用・付与UI 準備版\n\n## 絶対条件\n- このfeatureブランチは準備専用。今のv1.8.7本番更新が完了するまでデプロイしない。\n- Apps Script本番、正本Sheet、Vercel productionはこの準備作業では変更しない。\n- 二重保存は追加しない。\n\n## 追加仕様\n1. ガチャは参加者ごとに常時完全被りなし。\n2. 管理画面 `I16:L25` にガチャ運用ブロックを作る。現在この範囲は空きであることを読み取り確認済み。\n3. `J17` メンシプガチャ ON/OFF、`J18` ラキフェス ON/OFF。初回セットアップ時はOFF。\n4. OFF中はAPIでも抽選拒否。権利・当選履歴は保持。\n5. リスナー画面ではOFF側のボタンを無効化し「停止中」と表示。\n6. `J21` 参加者IDを選択し、名前・総権利・残り・使用済を自動表示。\n7. `J23` 追加回数、`J24` 付与理由、`J25` 実行チェック。\n8. 付与先は既存 `emuzii_ガチャ` の特別付与列Oへ加算。既存の1/3/5購入計算は変更しない。\n9. `emuzii_ガチャ付与履歴` に日時、ID、名前、回数、理由、変更前後、総権利、残りを記録。\n10. 付与処理はスクリプトロックを使い、Web抽選との同時更新を避ける。\n\n## 準備ファイル\n- `APPS_SCRIPT_Code_v1.8.8_NO_DUPLICATES.gs`\n- `APPS_SCRIPT_GachaAdmin_v1.8.8.gs`\n- `APPS_SCRIPT_DeviceRecovery_v1.8.8.gs`\n- `gacha-page.v1.8.8_PREP.js`\n\n本番適用時は、v1.8.7本番状態を再確認してから別更新として適用する。\n'''
Path('V1.8.8_GACHA_ADMIN_PREP_HANDOFF.md').write_text(handoff, encoding='utf-8')
