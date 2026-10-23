/**
 * MIO v2.2.3 — nonproduction release readiness decision engine.
 * Strict and fail-closed. No effect on Vercel deployment or GAS.
 * This is a planning/CI tool, NOT an authorization mechanism.
 *
 * Evidence must be produced by independently reviewed test/audit steps;
 * never wire evidence values directly from an HTTP request or untrusted UI.
 */
export const MIO_RELEASE_CHECKS=Object.freeze([
  'gasEditorFourFilesRead',
  'gasLiveDeploymentRead',
  'gasDeploymentParityVerified',
  'gasTriggersAudited',
  'gasStatusReadOnlyVerified',
  'bridgeIdentityAttestationVerified',
  'freshBootstrapProofVerified',
  'browserRevocationGASSynchronized',
  'realDevicePasskeysVerified',
  'backupRestoreTestPassed',
  'legacyAttendanceGachaRegressionPassed',
  'orphanRowsReviewed',
  'participantIdentityConflictsReviewed',
  'manualReleaseApproval'
]);
export function evaluateMioReleaseReadiness(evidence={}){
  const checks=MIO_RELEASE_CHECKS.map(key=>({
    key,complete:Object.hasOwn(evidence,key)&&evidence[key]===true
  }));
  // A single missing gate blocks release even if every unit test passes.
  const incomplete=checks.filter(x=>!x.complete).map(x=>x.key);
  return Object.freeze({
    canRelease:incomplete.length===0,
    complete:checks.length-incomplete.length,
    required:checks.length,
    incomplete
  });
}
/**
 * Represents ONLY currently established evidence, never implied from
 * code being present or simulated tests passing.
 */
export const CURRENT_V223_RELEASE_EVIDENCE=Object.freeze({
  gasEditorFourFilesRead:false,
  gasLiveDeploymentRead:false,
  gasDeploymentParityVerified:false,
  gasTriggersAudited:false,
  gasStatusReadOnlyVerified:false,
  bridgeIdentityAttestationVerified:false,
  freshBootstrapProofVerified:false,
  browserRevocationGASSynchronized:false,
  realDevicePasskeysVerified:false,
  backupRestoreTestPassed:false,
  legacyAttendanceGachaRegressionPassed:false,
  orphanRowsReviewed:false,
  participantIdentityConflictsReviewed:false,
  manualReleaseApproval:false
});
