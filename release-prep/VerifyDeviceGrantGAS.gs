/** Verify signed enrollment grant on GAS, using the existing server-only bridge secret.
 * Call only from doPost after its normal bridge-secret check and while holding
 * its existing script lock. Never trust booleans supplied by a browser.
 * Expected grant fields match device-grant-verifier.js.
 */
function mioVerifyDeviceGrantGAS_(grant, signature, secret) {
  if (!grant || typeof grant !== 'object' || typeof signature !== 'string' ||
      typeof secret !== 'string' || secret.length < 32) return null;
  var webId=grant.webId, masterId=grant.masterId,
      tokenHash=grant.deviceProofHash, nonce=grant.nonce,
      expiresAt=grant.expiresAt;
  if (!/^MIO-W-[a-f0-9]{24}$/.test(String(webId||'')) ||
      !/^MIO-\\d{4,}$/.test(String(masterId||'')) ||
      !/^[a-f0-9]{64}$/.test(String(tokenHash||'')) ||
      !/^[a-f0-9]{32,64}$/.test(String(nonce||'')) ||
      grant.scope !== 'device-enroll' ||
      grant.issuer !== 'authenticated-admin' ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= Date.now() || expiresAt > Date.now()+300000) return null;
  var payload=JSON.stringify({webId:webId,masterId:masterId,
    deviceProofHash:tokenHash,nonce:nonce,expiresAt:expiresAt,
    scope:'device-enroll',issuer:'authenticated-admin'});
  var mac=Utilities.computeHmacSha256Signature(payload,secret);
  var expected=Utilities.base64EncodeWebSafe(mac).replace(/=+$/,'');
  // Fixed-size MAC comparison. Never compare user-supplied proof flags.
  if (signature.length !== expected.length) return null;
  var mismatch=0;
  for (var i=0;i<expected.length;i++)
    mismatch |= expected.charCodeAt(i)^signature.charCodeAt(i);
  if (mismatch !== 0) return null;
  return {webId:webId,masterId:masterId,tokenHash:tokenHash,
    nonce:nonce,expiresAt:expiresAt};
}
