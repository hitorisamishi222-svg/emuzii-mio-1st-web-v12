/**
 * Additional-device authorization policy.
 * Pure validation only: this module cannot create sessions or mutate GAS data.
 * A trusted server must verify admin authority and persist the approved device
 * before invoking this policy.
 */
export function authorizeAdditionalDevice({approval, device, existing} = {}) {
  if (!approval || !device || !existing) return {ok:false,reason:'MISSING_PROOF'};
  if (approval.status !== 'approved' || approval.adminVerified !== true)
    return {ok:false,reason:'ADMIN_APPROVAL_REQUIRED'};
  if (!/^MIO-\d{4,}$/.test(approval.masterId || '') ||
      !/^MIO-W-[a-f0-9]{24}$/.test(approval.webId || '') ||
      !/^[a-f0-9]{64}$/.test(device.tokenHash || ''))
    return {ok:false,reason:'INVALID_IDENTITY'};
  if (approval.masterId !== existing.masterId ||
      approval.webId !== existing.webId ||
      existing.status !== '承認済み')
    return {ok:false,reason:'IDENTITY_MISMATCH'};
  if (typeof approval.expiresAt !== 'number' ||
      typeof device.now !== 'number' ||
      approval.expiresAt <= device.now)
    return {ok:false,reason:'APPROVAL_EXPIRED'};
  if (approval.deviceProofHash !== device.proofHash ||
      !/^[a-f0-9]{64}$/.test(device.proofHash || ''))
    return {ok:false,reason:'DEVICE_PROOF_MISMATCH'};
  return {ok:true,masterId:existing.masterId,webId:existing.webId,
    tokenHash:device.tokenHash,mode:'ADDITIVE_DEVICE'};
}
