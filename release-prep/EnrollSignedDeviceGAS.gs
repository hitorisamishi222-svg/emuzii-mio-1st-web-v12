/**
 * Atomic, signed additive-device enrollment. Invoke ONLY from the existing
 * authenticated GAS doPost, inside its script lock, after bridge-secret check.
 * The caller passes the server-side bridge secret; it MUST NOT be read from
 * untrusted request data. This function is not a public endpoint.
 * Requires VerifyDeviceGrantGAS.gs, DeviceGrantLedger.gs and
 * AdditionalDeviceRegistry.gs in the same GAS project.
 */
function mioEnrollSignedDevice_(ss, grant, signature, serverSecret) {
  var v=mioVerifyDeviceGrantGAS_(grant,signature,serverSecret);
  if (!v) return {ok:false,error:'INVALID_GRANT'};
  // Scope recovery to the two administrator-verified participants only.
  if (v.masterId!=='MIO-0010' && v.masterId!=='MIO-0018')
    return {ok:false,error:'NOT_RECOVERY_TARGET'};
  var web=ss.getSheetByName(WEB_TAB);
  if (!web) return {ok:false,error:'MISSING_WEB_TABLE'};
  var rows=web.getDataRange().getValues().slice(1);
  var matches=rows.filter(function(r){
    return String(r[0])===v.webId && String(r[7])===v.masterId &&
      r[5]==='承認済み' &&
      [r[10],r[15]].every(function(x){
        return !String(x||'').trim() || String(x).trim()===v.masterId;
      });
  });
  if (matches.length!==1) return {ok:false,error:'IDENTITY_MISMATCH'};
  if (!/^[a-f0-9]{64}$/.test(String(matches[0][1]||'')) ||
      matches[0][1]===v.tokenHash)
    return {ok:false,error:'ORIGINAL_CREDENTIAL_INVALID'};
  // Precheck without mutation. The enclosing doPost script lock is mandatory.
  var devices=ss.getSheetByName(MIO_DEVICE_TAB);
  if (devices && devices.getLastRow()>1) {
    var existing=devices.getRange(2,1,devices.getLastRow()-1,7).getValues();
    if (existing.some(function(r){return r[2]===v.tokenHash;}))
      return {ok:false,error:'DUPLICATE_DEVICE'};
  }
  var ledger=ss.getSheetByName(MIO_GRANT_LEDGER_TAB);
  if (ledger && ledger.getLastRow()>1) {
    var nonces=ledger.getRange(2,1,ledger.getLastRow()-1,1).getValues();
    if (nonces.some(function(r){return r[0]===v.nonce;}))
      return {ok:false,error:'GRANT_ALREADY_USED'};
  }
  // Ensure destination exists before consuming a grant; no original row changes.
  mioDeviceSheet_(ss);
  // The grant ledger and device registry are two separate Sheets writes.
  // An append failure after consumption is fail-closed and requires a new grant.
  // Never auto-retry enrollment with a different token or overwrite column B.
  // Record grant use before adding credentials (fail closed on partial error).
  var used=mioConsumeVerifiedGrant_(ss,{
    signatureVerified:true,nonce:v.nonce,webId:v.webId,
    masterId:v.masterId,expiresAt:v.expiresAt
  });
  if (!used.ok) return used;
  return mioDeviceAddApproved_(ss,{
    serverValidated:true,adminAuthenticated:true,grantVerified:true,
    webId:v.webId,masterId:v.masterId,tokenHash:v.tokenHash,
    adminId:'signed-admin-grant'
  });
}
