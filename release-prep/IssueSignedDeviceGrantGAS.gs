/**
 * Administrator-only grant issuer. Run manually in the Apps Script editor
 * AFTER the administrator has verified the participant in person.
 * Never expose this function via doPost, doGet or a public web page.
 * Requires the new device to supply its token hash privately to the admin.
 * The secret never leaves Script Properties; only the signed grant is shared.
 */
function mioIssueDeviceGrantForVerifiedUser_(masterId, deviceProofHash) {
  if (masterId!=='MIO-0010' && masterId!=='MIO-0018')
    throw new Error('対象は管理者確認済みの2名のみです');
  if (!/^[a-f0-9]{64}$/.test(String(deviceProofHash||'')))
    throw new Error('新端末の認証ハッシュ（64桁）が必要です');
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var candidates=rows_(ss,WEB_TAB).filter(function(r){
    return r[5]==='承認済み' && String(r[7])===masterId &&
      /^MIO-W-[a-f0-9]{24}$/.test(String(r[0]||'')) &&
      /^[a-f0-9]{64}$/.test(String(r[1]||'')) &&
      [r[10],r[15]].every(function(x){
        return !String(x||'').trim() || String(x).trim()===masterId;
      });
  });
  if (candidates.length!==1)throw new Error('承認済みWeb-IDが一意に特定できません');
  if (candidates[0][1]===deviceProofHash)
    throw new Error('元端末と同じ認証情報は使用できません');
  var secret=PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
  if (!secret || secret.length<32)throw new Error('BRIDGE_SECRET未設定');
  var grant={
    webId:String(candidates[0][0]),masterId:masterId,
    deviceProofHash:deviceProofHash,
    nonce:(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'').toLowerCase(),
    expiresAt:Date.now()+5*60*1000,
    scope:'device-enroll',issuer:'authenticated-admin'
  };
  var message=JSON.stringify(grant);
  var bytes=Utilities.computeHmacSha256Signature(message,secret);
  var signature=Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
  // No sheet mutation occurs until the grant is redeemed through doPost.
  return {grant:grant,signature:signature};
}
