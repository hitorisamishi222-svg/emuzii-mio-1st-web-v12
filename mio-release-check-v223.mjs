/**
 * STAGING-ONLY release readiness audit CLI.
 * Prints no names or credentials. Exit code 1 for any release attempt while
 * required independent evidence remains unavailable.
 * Never deploys, edits, initializes, or connects to production resources.
 *
 * This is NOT a live deployment hook. Integrate into protected release flow
 * only after an independently reviewed change-control process.
 */
import {
  evaluateMioReleaseReadiness,
  CURRENT_V223_RELEASE_EVIDENCE
} from './mio-release-readiness-v223.js';
const argument=process.argv.slice(2);
const auditOnly=argument.length===0||(argument.length===1&&argument[0]==='--audit');
const releaseMode=argument.length===1&&argument[0]==='--release';
if(!auditOnly&&!releaseMode){
  process.stderr.write('Usage: node mio-release-check-v223.mjs [--audit|--release]\n');
  process.exitCode=2;
}else{
  const report=evaluateMioReleaseReadiness(CURRENT_V223_RELEASE_EVIDENCE);
  process.stdout.write(JSON.stringify({
    mode:releaseMode?'release':'audit',
    canRelease:report.canRelease,
    complete:report.complete,
    required:report.required,
    incomplete:report.incomplete
  },null,2)+'\n');
  if(releaseMode&&!report.canRelease){
    process.stderr.write('Release blocked: verification evidence missing. No deployment attempted.\n');
    process.exitCode=1;
  }
}
