/**
 * GAS additive device auth gate, staging only.
 * Call AFTER bridge-secret verification and AFTER locating exactly one
 * approved original Web row; do not replace the existing token check.
 */
function mioExistingOrAddedDevice_(ss, webRow, submittedHash) {
  if (!webRow || !/^[a-f0-9]{64}$/.test(String(submittedHash||'')))
    return false;
  var webId=String(webRow[0]||'');
  var original=String(webRow[1]||'');
  var masterId=String(webRow[7]||'');
  if (!/^MIO-W-[a-f0-9]{24}$/.test(webId) ||
      !/^MIO-\d{4,}$/.test(masterId) ||
      webRow[5]!=='承認済み' ||
      !/^[a-f0-9]{64}$/.test(original)) return false;
  // Original-device authorization remains unchanged. Added credentials
  // are accepted only for the same approved, non-conflicting identity.
  if ([webRow[10], webRow[15]].some(function(v) {
    return String(v || '').trim() && String(v).trim() !== masterId;
  })) return false;
  if (original===submittedHash) return true;
  var sh=ss.getSheetByName(MIO_DEVICE_TAB);
  if (!sh || sh.getLastRow()<2) return false;
  var rows=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  return rows.filter(function(r) {
    return r[0]===webId && r[1]===masterId &&
      r[2]===submittedHash && r[3]==='有効' && !r[6];
  }).length===1;
}
