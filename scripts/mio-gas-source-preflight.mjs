/**
 * Offline, read-only verification of an EXISTING Apps Script source export.
 * No GAS calls, fetch, spreadsheet operations, or credentials are ever used.
 * The tool prints counts and safety classifications, never source or secrets.
 *
 * Usage: node scripts/mio-gas-source-preflight.mjs /path/to/Code.gs [/path/to/other.gs ...]
 * Do not paste live GAS secrets into a chat or Git repository.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const OPS_NAMES = Object.freeze([
 'mioAdminOps_','mioAdminOpsStr_','mioAdminOpsName_','mioAdminOpsSheet_',
 'mioAdminOpsValues_','mioAdminOpsOne_','mioAdminOpsPeople_',
 'mioAdminOpsSummary_','mioAdminOpsRead_','mioAdminOpsRequest_',
 'mioAdminOpsLog_','mioAdminOpsExisting_','mioAdminOpsWriteLog_',
 'mioAdminOpsCreate_','mioAdminOpsApprove_','mioAdminOpsRecordGrant_',
 'mioAdminOpsGrant_','mioAdminOpsReview_','mioAdminOpsIntake_'
]);

// Count declarations only, never printed source content; do not treat calls as definitions.
export function countDeclarations(source){
 const counts=new Map();
 for(const match of source.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)){
  const name=match[1];counts.set(name,(counts.get(name)||0)+1);
 }
 return counts;
}
function bodyOfDoPost(source){
 const hit=/^\s*function\s+doPost\s*\([^)]*\)\s*\{/gm.exec(source);
 if(!hit)return '';
 // Only require relative order, not emulate execution of private credentials.
 // Curly matching is deliberately conservative: use the next top-level declaration
 // boundary so strings / JSON are not interpreted as executed functions.
 const following=source.slice(hit.index+hit[0].length);
 const next=/^\s*(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/gm.exec(following);
 return next?following.slice(0,next.index):following;
}
function checkDispatcher(source){
 const body=bodyOfDoPost(source);
 if(!body)return {hasDispatcher:false,secretBefore:false,identityAfter:false,scriptLock:false};
 const actionPosition=body.indexOf('webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)');
 const dispatchPosition=body.indexOf('mioAdminOps_(');
 const secretCheckPosition=Math.max(body.indexOf("getProperty('BRIDGE_SECRET')"),body.indexOf('getProperty("BRIDGE_SECRET")'));
 const comparePosition=body.indexOf('equal_(d.secret,secret)');
 const participantPosition=body.indexOf('d.participantId');
 return {
  hasDispatcher:actionPosition>=0&&dispatchPosition>actionPosition,
  secretBefore:secretCheckPosition>=0&&comparePosition>secretCheckPosition&&
      (actionPosition<0||comparePosition<actionPosition),
  identityAfter:actionPosition<0||participantPosition>actionPosition,
  // Lock acquisition MUST precede the first admin dispatch, not merely appear later.
  // This is a conservative structural check, never a proof of runtime authentication.
  scriptLock:(()=>{
   const lockPosition=body.indexOf('LockService.getScriptLock(');
   const tryPosition=body.indexOf('lock.tryLock(');
   const gatedPosition=body.indexOf('if(!lock.tryLock(');
   // A failed tryLock must return before admin operations; a bare tryLock is insufficient.
   const failedLockReturns=gatedPosition>=0&&
    /^if\(!lock\.tryLock\([^)]*\)\)\s*return\b/.test(body.slice(gatedPosition));
   return lockPosition>=0&&tryPosition>lockPosition&&gatedPosition===tryPosition-4&&
    failedLockReturns&&
    (actionPosition<0||tryPosition<actionPosition)&&
    (dispatchPosition<0||tryPosition<dispatchPosition);
  })()
 };
}

export function inspectSources(sourceTexts,{liveHeaders=null}={}){
 if(!Array.isArray(sourceTexts)||sourceTexts.length===0||
   sourceTexts.some(s=>typeof s!=='string'||!s.trim()))
  throw Error('At least one readable, non-empty GAS source is required');
 const counts=new Map(),dispatchers=[];
 let doPost=0;
 for(const source of sourceTexts){
  const defs=countDeclarations(source);
  for(const [name,n] of defs)counts.set(name,(counts.get(name)||0)+n);
  doPost+=defs.get('doPost')||0;
  dispatchers.push(checkDispatcher(source));
 }
 const present=OPS_NAMES.filter(n=>counts.has(n));
 const missing=OPS_NAMES.filter(n=>!counts.has(n));
 const duplicate=OPS_NAMES.filter(n=>(counts.get(n)||0)>1);
 const duplicateAny=[...counts].filter(([n,count])=>count>1).map(([n])=>n);
 const foundDispatcher=dispatchers.filter(d=>d.hasDispatcher);
 const unsafeDispatch=dispatchers.some(d=>d.hasDispatcher&&
  (!d.secretBefore||!d.identityAfter||!d.scriptLock));
 const partial=(present.length>0&&missing.length>0);
 const mismatched=(present.length===0&&foundDispatcher.length>0)||
  (present.length===OPS_NAMES.length&&foundDispatcher.length!==1);
 const headersReady=liveHeaders?.requiredForWebAdminWrites?
  liveHeaders.requiredForWebAdminWrites.auditTab?.observed===true &&
  liveHeaders.requiredForWebAdminWrites.grantOperationColumn?.observedHeader==='Web操作ID':false;
 let classification='BLOCKED_REVIEW';
 if(doPost===1&&duplicateAny.length===0&&!unsafeDispatch&&!mismatched&&!partial){
  if(present.length===0)classification='NO_OPS_CANDIDATE_ONLY';
  else classification='ALL_OPS_IN_SOURCE_UNVERIFIED_DEPLOYMENT';
 }
 const blockingReasons=[];
 if(doPost!==1)blockingReasons.push('DO_POST_COUNT_NOT_ONE');
 if(duplicateAny.length)blockingReasons.push('DUPLICATE_FUNCTION_DECLARATIONS');
 if(partial)blockingReasons.push('PARTIAL_ADMIN_FUNCTIONS');
 if(mismatched)blockingReasons.push('DISPATCH_FUNCTION_MISMATCH');
 if(unsafeDispatch)blockingReasons.push('DISPATCH_WITHOUT_CONFIRMED_LOCK_OR_SECRET_ORDER');
 if(classification==='NO_OPS_CANDIDATE_ONLY')blockingReasons.push('LIVE_ADMIN_OPS_MISSING');
 if(!headersReady)blockingReasons.push('LIVE_WRITE_AUDIT_SCHEMA_NOT_VERIFIED');
 // Deliberately never report READY: actual deployed version and backup cannot
 // be inferred from exported files, even when every function already exists.
 blockingReasons.push('DEPLOYED_GAS_VERSION_AND_BACKUP_NOT_VERIFIED');
 return {
  classification,readOnly:true,sourceCount:sourceTexts.length,
  adminFunctionsPresent:present.length,adminFunctionsMissing:missing.length,
  duplicateFunctionDeclarationCount:duplicateAny.length,
  doPostCount:doPost,dispatchersFound:foundDispatcher.length,
  auditedDispatcher:foundDispatcher.length===1&&!unsafeDispatch,
  webAdminWriteAllowed:false,requiresHumanLiveDeploymentVerification:true,
  blockingReasons
 };
}

function main(){
 const paths=process.argv.slice(2);
 if(!paths.length){
  process.stderr.write('Usage: node scripts/mio-gas-source-preflight.mjs Code.gs [Other.gs ...]\n');
  process.exitCode=2;return;
 }
 try{
  const sources=paths.map(path=>readFileSync(resolve(path),'utf8'));
  const result=inspectSources(sources);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  // A known-safe static source layout is NOT proof of live deploy; always stop
  // callers from interpreting this CLI as a deployment/release authorization.
  process.exitCode=result.classification==='BLOCKED_REVIEW'?2:1;
 }catch(e){
  // Do not print potentially sensitive exception detail or source paths.
  process.stderr.write('READ_FAILED_OR_INVALID_GAS_SOURCE\n');
  process.exitCode=2;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main();
