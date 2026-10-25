/**
 * GAS additional-device registry (staging; not installed into doPost).
 * The caller MUST first authenticate an authorized administrator, and a
 * separate server-side grant verifier MUST bind the device proof to the
 * approved Web-ID. Never accept a participant-supplied adminVerified flag.
 *
 * Schema: webId, masterId, tokenHash, state, createdAt, approvedBy, revokedAt
 * This registry adds a credential without changing the immutable Web row.
 */
var MIO_DEVICE_TAB = 'emuzii_追加端末認証';
function mioDeviceSheet_(ss) {
  var sh = ss.getSheetByName(MIO_DEVICE_TAB);
  if (!sh) {
    sh = ss.insertSheet(MIO_DEVICE_TAB);
    sh.appendRow(['Web-ID','MIO-ID','認証ハッシュ','状態','作成日時','承認管理者','失効日時']);
  }
  return sh;
}
function mioDeviceAddApproved_(ss, verified) {
  // 'verified' must be constructed exclusively by a trusted server-side
  // administrator-authentication and grant-verification routine.
  if (!verified || verified.serverValidated !== true ||
      verified.adminAuthenticated !== true ||
      verified.grantVerified !== true ||
      !/^MIO-W-[a-f0-9]{24}$/.test(String(verified.webId||'')) ||
      !/^MIO-\d{4,}$/.test(String(verified.masterId||'')) ||
      !/^[a-f0-9]{64}$/.test(String(verified.tokenHash||''))) {
    throw new Error('trusted device approval required');
  }
  var web = ss.getSheetByName(WEB_TAB);
  if (!web) throw new Error('missing web registration table');
  var rows = rows_(ss,WEB_TAB);
  var matches = rows.filter(function(r) {
    return String(r[0]) === verified.webId &&
      String(r[7]) === verified.masterId && r[5] === '承認済み' &&
      String(r[10]) === verified.masterId &&
      String(r[15]) === verified.masterId;
  });
  if (matches.length !== 1) throw new Error('approved identity mismatch');
  var sh = mioDeviceSheet_(ss);
  var count = sh.getLastRow();
  var records = count>1 ? sh.getRange(2,1,count-1,7).getValues() : [];
  if (records.some(function(r){return r[2]===verified.tokenHash;}))
    throw new Error('duplicate device token');
  sh.appendRow([verified.webId,verified.masterId,verified.tokenHash,
    '有効',new Date(),String(verified.adminId||''),'']);
  SpreadsheetApp.flush();
  return {ok:true,webId:verified.webId,masterId:verified.masterId};
}
function mioDeviceAuthenticate_(ss,webId,tokenHash) {
  if (!/^MIO-W-[a-f0-9]{24}$/.test(String(webId||'')) ||
      !/^[a-f0-9]{64}$/.test(String(tokenHash||''))) return false;
  var sh=ss.getSheetByName(MIO_DEVICE_TAB);
  if(!sh || sh.getLastRow()<2)return false;
  var rows=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  return rows.filter(function(r) {
    return r[0]===webId && r[2]===tokenHash &&
      r[3]==='有効' && !r[6];
  }).length===1;
}
