/**
 * A successful bridge response is NOT sufficient unless it proves the exact
 * pre-approved target. Do not accept names, IP addresses, or login IDs as proof.
 * This guard is staged and intentionally NOT wired into production endpoints.
 */
export function verifiedRecoveryResult(result, expected) {
  if(!result || !expected || result.ok !== true ||
     result.verified !== true || result.recoveryApproved !== true ||
     result.recoveryConsumed !== true || result.status !== '承認済み') return false;
  if(typeof expected.webId !== 'string' ||
     !/^MIO-W-[a-f0-9]{24}$/.test(expected.webId) ||
     typeof expected.masterId !== 'string' ||
     !/^MIO-\d{4,}$/.test(expected.masterId)) return false;
  return result.participantId === expected.webId &&
    result.integratedParticipantId === expected.masterId;
}
