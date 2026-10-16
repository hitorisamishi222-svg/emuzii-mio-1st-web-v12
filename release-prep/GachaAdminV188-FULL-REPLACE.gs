/**
 * 翠央1周年 v1.8.8 ガチャ管理補助（安全な全置換版）
 *
 * このファイルは既存 GachaAdminV188.gs の全置換用です。
 * 既存 Code.gs の SHEET_ID を使用します。safeText_ はこのファイル内の専用処理に置き換えています。
 * 既存シートの I16:L25 や参加者データ領域には書き込みません。
 *
 * 初期設定で実行する関数は setupGachaGateOnlyV188_() だけです。
 * setup() は実行しないでください。
 */
var GACHA_ADMIN_TAB = 'emuzii_管理画面';
var GACHA_TAB_V188 = 'emuzii_ガチャ';
var GACHA_GRANT_HISTORY_TAB = 'emuzii_ガチャ付与履歴';
var GACHA_NORMAL_LABEL_V188 = 'メンシプガチャ受付';
var GACHA_FEST_LABEL_V188 = 'ラキフェス受付';

// 既存の回数付与UIが使っているセル位置。既存UIの配置は変更しません。
var GACHA_GRANT_ID = 'J21';
var GACHA_GRANT_AMOUNT = 'J23';
var GACHA_GRANT_REASON = 'J24';
var GACHA_GRANT_EXECUTE = 'J25';
var GACHA_GRANT_STATUS = 'L25';

/** 受付スイッチを管理画面の末尾に追加し、両方OFFにする。初回に一度実行。 */
function setupGachaGateOnlyV188_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var admin = ss.getSheetByName(GACHA_ADMIN_TAB);
  if (!admin) throw new Error('emuzii_管理画面がありません');

  var rows = gachaGateRowsSafeV188_(admin);
  var next = Math.max(admin.getLastRow() + 2, 1);
  if (!rows.normalRow) {
    rows.normalRow = next++;
    admin.getRange(rows.normalRow, 1).setValue(GACHA_NORMAL_LABEL_V188);
  }
  if (!rows.festRow) {
    rows.festRow = next++;
    admin.getRange(rows.festRow, 1).setValue(GACHA_FEST_LABEL_V188);
  }

  [rows.normalRow, rows.festRow].forEach(function(row) {
    var cell = admin.getRange(row, 2);
    cell.insertCheckboxes();
    cell.setValue(false);
    admin.getRange(row, 1, 1, 2).setBackground('#eaf2ff');
    admin.getRange(row, 1).setFontWeight('bold');
  });
  SpreadsheetApp.flush();
  return gachaOpenState_(ss);
}

/** A列の受付ラベルからスイッチの行番号を取得。 */
function gachaGateRowsSafeV188_(admin) {
  if (!admin) return {normalRow: 0, festRow: 0};
  var last = admin.getLastRow();
  if (last < 1) return {normalRow: 0, festRow: 0};
  var labels = admin.getRange(1, 1, last, 1).getDisplayValues();
  var result = {normalRow: 0, festRow: 0};
  for (var i = 0; i < labels.length; i++) {
    var label = String(labels[i][0] || '').trim();
    if (label === GACHA_NORMAL_LABEL_V188) result.normalRow = i + 1;
    if (label === GACHA_FEST_LABEL_V188) result.festRow = i + 1;
  }
  return result;
}

/** 受付状態を返す。設定不足・読み込み失敗時は必ず停止扱い。 */
function gachaOpenState_(ss) {
  try {
    var admin = ss && ss.getSheetByName(GACHA_ADMIN_TAB);
    var rows = gachaGateRowsSafeV188_(admin);
    if (!rows.normalRow || !rows.festRow) {
      return {normalOpen: false, festOpen: false, configured: false};
    }
    return {
      normalOpen: admin.getRange(rows.normalRow, 2).getValue() === true,
      festOpen: admin.getRange(rows.festRow, 2).getValue() === true,
      configured: true
    };
  } catch (err) {
    console.error('gachaOpenState_ failed closed', err);
    return {normalOpen: false, festOpen: false, configured: false};
  }
}

/** 旧関数名との互換用。シート全体の再設定はせず、受付スイッチだけをOFFにする。 */
function setupGachaAdminV188_() {
  return setupGachaGateOnlyV188_();
}

/** 管理画面の付与チェックがONになった時だけ付与処理を行う。 */
function handleGachaAdminEdit_(e) {
  if (!e || !e.range) return false;
  var sh = e.range.getSheet();
  if (sh.getName() !== GACHA_ADMIN_TAB) return false;
  if (e.range.getA1Notation() !== GACHA_GRANT_EXECUTE || String(e.value || '') !== 'TRUE') return false;
  grantGachaFromAdmin_(sh.getParent());
  return true;
}

/** 管理画面から特別付与回数を加算し、履歴を保存する。 */
function grantGachaFromAdmin_(ss) {
  var admin = ss.getSheetByName(GACHA_ADMIN_TAB);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    admin.getRange(GACHA_GRANT_EXECUTE).setValue(false);
    admin.getRange(GACHA_GRANT_STATUS).setValue('⚠ 処理中です。少し待って再実行');
    return;
  }

  var specialCell = null, before = 0, changed = false, historySaved = false;
  try {
    var id = String(admin.getRange(GACHA_GRANT_ID).getDisplayValue() || '').trim();
    var amount = Number(admin.getRange(GACHA_GRANT_AMOUNT).getValue());
    var reason = String(admin.getRange(GACHA_GRANT_REASON).getDisplayValue() || '').trim();
    if (!/^MIO-\d{4}$/.test(id)) throw new Error('参加者IDを選択してください');
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100) throw new Error('追加回数は1〜100の整数で入力してください');
    if (!reason || reason.length > 100) throw new Error('付与理由を100文字以内で入力してください');

    var gacha = ss.getSheetByName(GACHA_TAB_V188);
    var history = ss.getSheetByName(GACHA_GRANT_HISTORY_TAB);
    if (!gacha) throw new Error('ガチャ管理シートがありません');
    if (!history) throw new Error('付与履歴シートがありません');

    var last = Math.max(gacha.getLastRow(), 2);
    var values = gacha.getRange(2, 1, last - 1, 17).getValues();
    var row = 0, name = '';
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0] || '') === id) {
        if (row) throw new Error('参加者IDが重複しています');
        row = i + 2;
        name = String(values[i][1] || '');
      }
    }
    if (!row) throw new Error('ガチャ管理に対象参加者がいません');

    specialCell = gacha.getRange(row, 15);
    before = Number(specialCell.getValue()) || 0;
    var after = before + amount;
    specialCell.setValue(after);
    changed = true;
    SpreadsheetApp.flush();

    var total = Number(gacha.getRange(row, 6).getValue()) || 0;
    var remaining = Number(gacha.getRange(row, 8).getValue()) || 0;
    history.appendRow([new Date(), id, gachaAdminSafeTextV188_(name), amount,
      gachaAdminSafeTextV188_(reason), before, after, total, remaining]);
    historySaved = true;

    admin.getRange(GACHA_GRANT_AMOUNT).clearContent();
    admin.getRange(GACHA_GRANT_REASON).clearContent();
    admin.getRange(GACHA_GRANT_EXECUTE).setValue(false);
    admin.getRange(GACHA_GRANT_STATUS).setValue('✅ ' + name + ' +' + amount + '回 / 残り' + remaining + '回');
  } catch (err) {
    if (changed && !historySaved && specialCell) {
      try {
        specialCell.setValue(before);
        SpreadsheetApp.flush();
      } catch (rollbackErr) {}
    }
    admin.getRange(GACHA_GRANT_EXECUTE).setValue(false);
    admin.getRange(GACHA_GRANT_STATUS).setValue('⚠ ' + String(err && err.message || err));
  } finally {
    lock.releaseLock();
  }
}

/** シートへ書く文字列が数式として評価されないようにする。 */
function gachaAdminSafeTextV188_(value) {
  var text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
