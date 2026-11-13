// PRIVATE INPUT, OFFLINE OUTPUT. Never upload live Apps Script code to GitHub.
// Read a JSON snapshot of Apps Script project files on stdin and emit only
// a fixed-shape diagnosis. Static source matching cannot prove that the
// submitted files belong to the ACTIVE deployment or to version 16.
// Does not call Google APIs, Sheets, Vercel, or write files.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {preflightOperatorDispatch} from '../tools/mio-gas-operator-dispatch-preflight.mjs';

const stop=reason=>({status:'STOP',reason,readOnly:true,
  submittedSourceCompleteVerified:false,liveDeploymentVerified:false,
  publishedVersionVerified:false,liveReadConfirmed:false,
  writeAllowed:false,publicationAllowed:false,patchAllowed:false});
const expectedAdminFunctions=21;

export function triageGasSourceSnapshot(snapshot){
 if(!snapshot||typeof snapshot!=='object'||!Array.isArray(snapshot.files)||
   snapshot.files.length<1||snapshot.files.length>150)
  return stop('INVALID_OR_MISSING_SOURCE_FILES');
 const files=snapshot.files,seen=new Set();
 let bytes=0,serverFileCount=0;
 for(const file of files){
  if(!file||typeof file.name!=='string'||
    !/^[A-Za-z0-9_.-]{1,120}$/.test(file.name)||
    !['SERVER_JS','HTML','JSON'].includes(file.type)||
    typeof file.source!=='string')return stop('INVALID_FILE_METADATA');
  const key=file.type+':'+file.name;
  if(seen.has(key))return stop('DUPLICATED_SOURCE_FILE');
  seen.add(key);
  bytes+=file.source.length;
  if(bytes>3000000)return stop('SOURCE_TOO_LARGE');
  if(file.type==='SERVER_JS')serverFileCount++;
 }
 if(serverFileCount===0)return stop('NO_SERVER_JS_SOURCE');
 const review=preflightOperatorDispatch(files);
 const missing=Number.isSafeInteger(review.missingFunctionCount)?
  review.missingFunctionCount:null;
 // A file copied from the editor HEAD, an October backup, or GitHub candidate
 // is never evidence of the exact running version, even if all checks pass.
 let diagnosis='PARTIAL_OR_UNRECOGNIZED_ADMIN_SOURCE';
 if(review.ok===true)diagnosis='STATIC_ADMIN_ROUTING_COMPATIBLE_NOT_DEPLOYED_PROOF';
 else if(review.reason==='DUPLICATE_CRITICAL_FUNCTIONS')diagnosis='DUPLICATE_ADMIN_FUNCTIONS_BLOCKED';
 else if(missing===expectedAdminFunctions&&review.dispatcherDetected===false)
  diagnosis='NO_ADMIN_FUNCTIONS_IN_SUBMITTED_SOURCE';
 else if(missing===0&&review.dispatcherDetected===false)
  diagnosis='ADMIN_ROUTING_MISSING';
 // The caller's reported version is a label, not an authenticated version check.
 return {...stop('PUBLISHED_VERSION_AND_DEPLOYMENT_NOT_VERIFIED'),
  status:diagnosis,
  expectedAdminFunctionCount:expectedAdminFunctions,
  missingAdminFunctionCount:missing,
  submittedServerFileCount:serverFileCount,
  staticDispatchDetected:review.dispatcherDetected===true,
  staticScriptLockGuardDetected:review.scriptLockGuardDetected===true,
  // No source, IDs, hashes, participant data, or secrets in results.
  nextAction:'VERIFY_ACTIVE_DEPLOYMENT_AND_VERSION_16_SOURCE_WITH_OWNER_AUTHENTICATION'};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 let result;
 try{
  if(process.argv.length!==2)throw Error();
  const raw=readFileSync(0,'utf8');
  if(raw.length>3200000)throw Error();
  result=triageGasSourceSnapshot(JSON.parse(raw));
 }catch{result=stop('INPUT_INVALID')}
 process.stdout.write(JSON.stringify(result)+'\n');
 // Always nonzero: this offline test can never authorize a live release.
 process.exitCode=1;
}
