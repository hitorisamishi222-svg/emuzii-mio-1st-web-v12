/**
 * Staged release gate for additional-device recovery.
 * Never treat client JSON booleans as administrator authentication.
 * Require a verified, one-time grant from the trusted issuer.
 */
export function checkAdditionalDeviceRelease({grantResult, registration, device} = {}) {
  if (!grantResult || grantResult.ok !== true ||
      grantResult.signatureVerified !== true ||
      grantResult.consumed === true ||
      grantResult.adminAuthenticated !== true ||
      grantResult.issuer !== 'authenticated-admin')
    return {ok:false,code:'TRUSTED_GRANT_REQUIRED'};
  if (!registration || registration.status !== '承認済み' ||
      !/^MIO-W-[a-f0-9]{24}$/.test(registration.webId||'') ||
      !/^MIO-\d{4,}$/.test(registration.masterId||'') ||
      registration.webId !== grantResult.webId ||
      registration.masterId !== grantResult.masterId)
    return {ok:false,code:'APPROVED_IDENTITY_MISMATCH'};
  if (!device || !/^[a-f0-9]{64}$/.test(device.tokenHash||'') ||
      device.tokenHash === registration.originalTokenHash ||
      device.proofHash !== grantResult.deviceProofHash)
    return {ok:false,code:'DEVICE_PROOF_MISMATCH'};
  return {ok:true,webId:registration.webId,masterId:registration.masterId};
}
