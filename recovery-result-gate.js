/**
 * Fail closed until GAS proves the one-time, operator-approved grant
 * was bound to the EXACT new token hash on the EXISTING Web registration.
 * All identity references and proof fields must originate from GAS.
 * No names, IPs, old short login IDs, or client-supplied MIO IDs are proof.
 */
export function verifiedRecoveryResult(result,expected,requestedTokenHash){
  if(!result || !expected || result.ok!==true ||
     result.verified!==true || result.recoveryApproved!==true ||
     result.recoveryConsumed!==true || result.recoveryTokenBound!==true ||
     result.status!=='承認済み') return false;
  if(typeof requestedTokenHash!=='string' ||
     !/^[a-f0-9]{64}$/.test(requestedTokenHash) ||
     result.boundTokenHash!==requestedTokenHash) return false;
  if(typeof expected.webId!=='string' ||
     !/^MIO-W-[a-f0-9]{24}$/.test(expected.webId) ||
     typeof expected.masterId!=='string' ||
     !/^MIO-\\d{4,}$/.test(expected.masterId)) return false;
  return result.participantId===expected.webId &&
    result.approvedWebId===expected.webId &&
    result.integratedParticipantId===expected.masterId &&
    result.approvedMasterId===expected.masterId;
}
