/**
 * v1.8.8 live GAS safe gacha gate patch
 * Apply only to the existing Apps Script project.
 *
 * 1) Replace the current gachaOpenState_(ss) function with this version.
 * 2) Add setupGachaGateOnlyV188_() as a separate function.
 * 3) Run setupGachaGateOnlyV188_ only when ready to add two STOPPED switches.
 * Never run setup() or setupGachaAdminV188_ for this patch.
 *
 * Controls are appended below existing admin-sheet content so they do not
 * overwrite I16:L25 or the participant/day-key areas.
 */
function setupGachaGateOnlyV188_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var admin = ss.getSheetByName('emuzii_管理画面');
  if (!admin) throw new Error('emuzii_管理画面がありません');

  var rows = gachaGateRowsSafeV188_(admin);
  var next = Math.max(admin.getLastRow() + 2, 1);

  if (!rows.normalRow) {
    rows.normalRow = next++;
    admin.getRange(rows.normalRow, 1).setValue('メンシプガチャ受付');
  }
  if (!rows.festRow) {
    rows.festRow = next++;
    admin.getRange(rows.festRow, 1).setValue('ラキフェス受付');
  }

  [rows.normalRow, rows.festRow].forEach(function(row) {
    var cell = admin.getRange(row, 2);
    cell.insertCheckboxes();
    cell.setValue(false);
    admin.getRange(row, 1, 1, 2).setBackground('#eaf2ff');
    admin.getRange(row, 1).setFontWeight('bold');
  });

  var state = gachaOpenState_(ss);
  if (!state.configured) throw new Error('受付スイッチを確認できません');
  return state;
}

function gachaGateRowsSafeV188_(admin) {
  if (!admin) return {normalRow: 0, festRow: 0};
  var last = admin.getLastRow();
  if (last < 1) return {normalRow: 0, festRow: 0};

  var labels = admin.getRange(1, 1, last, 1).getDisplayValues();
  var normalRow = 0;
  var festRow = 0;
  for (var i = 0; i < labels.length; i++) {
    var label = String(labels[i][0] || '').trim();
    if (label === 'メンシプガチャ受付') normalRow = i + 1;
    if (label === 'ラキフェス受付') festRow = i + 1;
  }
  return {normalRow: normalRow, festRow: festRow};
}

/**
 * Replace the existing gachaOpenState_(ss) in GachaAdminV188.gs with this.
 * Missing switches or read errors fail closed.
 */
function gachaOpenState_(ss) {
  try {
    var admin = ss.getSheetByName('emuzii_管理画面');
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
