/**
 * GAS durable one-time grant ledger. STAGING ONLY.
 * Called only after cryptographic grant verification on a trusted backend.
 * Must execute under the existing doPost script lock.
 * This function does not authenticate admins or create participant sessions.
 */
var MIO_GRANT_LEDGER_TAB = 'emuzii_端末許可使用履歴';
function mioConsumeVerifiedGrant_(ss, verifiedGrant) {
  if (!verifiedGrant || verifiedGrant.signatureVerified !== true ||
      !/^[a-f0-9]{32,64}$/.test(String(verifiedGrant.nonce||'')) ||
      !/^MIO-W-[a-f0-9]{24}$/.test(String(verifiedGrant.webId||'')) ||
      !/^MIO-\d{4,}$/.test(String(verifiedGrant.masterId||'')) ||
      !Number.isSafeInteger(verifiedGrant.expiresAt) ||
      verifiedGrant.expiresAt <= Date.now()) {
    return {ok:false,reason:'INVALID_VERIFIED_GRANT'};
  }
  var sh=ss.getSheetByName(MIO_GRANT_LEDGER_TAB);
  if(!sh){
    sh=ss.insertSheet(MIO_GRANT_LEDGER_TAB);
    sh.appendRow(['Nonce','Web-ID','MIO-ID','使用日時','許可期限']);
  }
  var n=sh.getLastRow();
  var used=n>1?sh.getRange(2,1,n-1,1).getValues():[];
  if(used.some(function(row){return row[0]===verifiedGrant.nonce;}))
    return {ok:false,reason:'GRANT_ALREADY_USED'};
  sh.appendRow([verifiedGrant.nonce,verifiedGrant.webId,
    verifiedGrant.masterId,new Date(),new Date(verifiedGrant.expiresAt)]);
  SpreadsheetApp.flush();
  return {ok:true};
}
