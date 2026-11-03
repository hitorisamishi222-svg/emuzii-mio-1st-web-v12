// MIO ONE-TIME MUSEUM RELEASE: staging-only readiness REPORT, not a launcher.
// This pure function neither reads nor changes a production system.
// Evidence MUST be independently collected by approved operators and verified
// against real GitHub/Vercel/Neon/GAS/iPhone data, not browser input or mocks.
// Even when everything is reported ready, it NEVER authorizes a deployment.
const DIGEST=/^[a-f0-9]{64}$/i;
const SHA=/^[a-f0-9]{40}$/i;
const REQUIREMENTS=Object.freeze([
 ['draft_branch_isolated','Current draft is isolated from main/Production'],
 ['draft_pr_unmerged','Draft PR is not merged or promoted'],
 ['production_sha_known','Production SHA is a verified 40-character commit'],
 ['all_ci_pass','All required CI checks passed on the same candidate SHA'],
 ['mobile_browser_pass','Mobile Chromium tests passed'],
 ['iphone_safari_pass','iPhone Safari real-device gallery/admin tests passed'],
 ['android_browser_pass','Android real-device gallery/admin tests passed'],
 ['desktop_browser_pass','Desktop browser gallery/admin tests passed'],
 ['correct_db_identity','Actual Vercel database project/branch/database was independently matched'],
 ['real_schema_verified','Museum/gallery schema was inspected on that exact database'],
 ['backup_restored','A recoverable backup was created and restored in isolation'],
 ['legacy_participants_preserved','Participant data identical to protected baseline'],
 ['legacy_attendance_preserved','Attendance and perfect-attendance records identical to baseline'],
 ['legacy_gacha_preserved','Gacha attempts and draws identical to baseline'],
 ['legacy_prizes_preserved','Gacha winnings and prize history identical to baseline'],
 ['legacy_history_preserved','Archived identity and award history identical to baseline'],
 ['current_gas_backed_up','Active GAS source and deployment version matched to backup'],
 ['gallery_rights_reviewed','Exhibits and imported works have current permission/privacy review'],
 ['gallery_admin_reviewed','Owner login, approvals, revisions and audit checked with real data'],
 ['legacy_gallery_audit_consistent','Read-only legacy gallery audit counts match persisted revisions'],
 ['single_release_route_reviewed','Museum root route and legacy-entry handling reviewed'],
 ['attendance_page_hidden','New public site hides the attendance-prize page without deleting data'],
 ['chat_deferred','Chat functionality remains disabled for this release'],
 ['preview_protected','Unpublished/management previews require access controls'],
 ['rollback_rehearsed','A rehearsal rollback restores the old public entry without data loss'],
 ['owner_signoff','Owner reviewed the exact one-time release candidate and approved']
]);
const RELEASE_CHECKS=Object.freeze(REQUIREMENTS.map(([key])=>key));
const boolean=x=>x===true;
const fingerprints=Object.freeze([
 'participants','attendance','gacha','prizes','history'
]);
const freeze=x=>Object.freeze(x);
export function evaluateMioMuseumReleaseGate(evidence={}){
 const src=evidence&&typeof evidence==='object'&&!Array.isArray(evidence)?evidence:{};
 const checks=src.checks&&typeof src.checks==='object'&&!Array.isArray(src.checks)?
  src.checks:{};
 const expected=src.protectedBaseline&&typeof src.protectedBaseline==='object'?
  src.protectedBaseline:{};
 const rehearsal=src.rehearsalSnapshot&&typeof src.rehearsalSnapshot==='object'?
  src.rehearsalSnapshot:{};
 const status=Object.create(null);
 for(const key of RELEASE_CHECKS)status[key]=boolean(checks[key]);
 // A bare true value must never substitute for identifying the actual
 // candidate, deployed baseline, or scoped repository.
 const candidateValid=typeof src.candidateSha==='string'&&SHA.test(src.candidateSha);
 const productionValid=typeof src.productionSha==='string'&&SHA.test(src.productionSha);
 const sameCandidate=checks.ciCandidateSha===src.candidateSha;
 status.production_sha_known=boolean(checks.production_sha_known)&&productionValid;
 status.all_ci_pass=boolean(checks.all_ci_pass)&&candidateValid&&sameCandidate;
 status.draft_branch_isolated=boolean(checks.draft_branch_isolated)&&
  candidateValid&&productionValid&&src.candidateSha!==src.productionSha;
 // Require count AND independently obtained non-empty SHA-256 digest.
 // This is a comparison, not a claim that a backup really exists.
 const preserved=fingerprints.map(name=>{
  const old=expected[name],now=rehearsal[name];
  const shape=x=>x&&Number.isSafeInteger(x.count)&&x.count>=0&&
   typeof x.sha256==='string'&&DIGEST.test(x.sha256);
  return freeze({name,
   matched:Boolean(shape(old)&&shape(now)&&old.count===now.count&&
    old.sha256.toLowerCase()===now.sha256.toLowerCase())});
 });
 for(const item of preserved)status['legacy_'+item.name+'_preserved']=
  boolean(checks['legacy_'+item.name+'_preserved'])&&item.matched;
 const audit=src.galleryAuditReport;
 status.legacy_gallery_audit_consistent=
  boolean(checks.legacy_gallery_audit_consistent)&&
  audit?.auditCountsConsistent===true&&
  Number.isSafeInteger(audit.checkedWorks)&&audit.checkedWorks>0&&
  Number.isSafeInteger(audit.mismatchCount)&&audit.mismatchCount===0;
 const details=freeze(REQUIREMENTS.map(([key,description])=>
  freeze({key,label:description,passed:status[key]===true})));
 const blockers=freeze(details.filter(x=>!x.passed).map(x=>x.key));
 return freeze({
  readiness:'staging_only',
  readyForOwnerReview:blockers.length===0,
  blockers,checks:details,
  preservedFingerprints:freeze(preserved),
  candidateSha:candidateValid?src.candidateSha:null,
  productionSha:productionValid?src.productionSha:null,
  canDeploy:false, // intentionally ALWAYS false. Human release control is separate.
  didModifyProduction:false
 });
}
