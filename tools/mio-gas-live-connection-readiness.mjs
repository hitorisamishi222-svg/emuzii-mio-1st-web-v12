// OFFLINE ONLY. Verify production URL -> Apps Script deployment -> published
// code identity before inspecting admin dispatch. No network calls or writes.
// Never output source text, identifiers, credentials, participant records.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {auditDeployedVersion} from './mio-gas-deployed-version-audit.mjs';
import {preflightOperatorDispatch} from './mio-gas-operator-dispatch-preflight.mjs';

const result=(status,reason,extra={})=>({
  status,reason,readOnly:true,liveReadConfirmed:false,
  writeAllowed:false,publicationAllowed:false,patchAllowed:false,...extra
});

/** Inputs for this function MUST be evidence verified by a trusted caller.
 * Only offlineLiveConnectionReadiness links them to the real WebApp target.
 */
export function assessVerifiedPublishedSource(evidence,published){
  if(!evidence?.ok||evidence.sourceVerified!==true||
     !Number.isSafeInteger(evidence.deployedVersion)||
     evidence.deploymentVerified!==true||evidence.projectVerified!==true)
    return result('BLOCKED','PUBLISHED_VERSION_UNVERIFIED');
  if(!published||!Array.isArray(published.files))
    return result('BLOCKED','PUBLISHED_SOURCE_MISSING');
  const source=preflightOperatorDispatch(published.files);
  if(!source.ok){
    return result('BLOCKED','PUBLISHED_ROUTING_OR_HELPERS_INVALID',{
      deployedVersion:evidence.deployedVersion,
      diagnosis:source.reason,
      missingFunctions:source.missingFunctions||[],
      missingSharedFunctions:source.missingSharedFunctions||[],
      sourceRequiresManualReview:true
    });
  }
  const changed=evidence.headMatchesPublished===false;
  return result('PUBLISHED_SOURCE_STATICALLY_COMPATIBLE','AUTHENTICATED_MANAGEMENT_READ_STILL_REQUIRED',{
    deployedVersion:evidence.deployedVersion,
    editorDiffersFromPublished:changed,
    nextStep:'read_only_admin_login_and_webAdminOpsRead',
    sourceRequiresManualReview:changed
  });
}

/** This public path refuses unverified/guessed script IDs, missing deployment
 * responses and absent published source. In particular, an old editor HEAD
 * cannot substitute for the exact running version.
 */
export function offlineLiveConnectionReadiness(input={}){
  const evidence=auditDeployedVersion(input);
  if(!evidence.ok || evidence.sourceVerified!==true)
    return result('BLOCKED','DEPLOYED_GAS_VERSION_OR_SOURCE_UNVERIFIED',{
      evidenceStatus:evidence.status,
      evidenceReason:evidence.reason||''
    });
  return assessVerifiedPublishedSource(evidence,input.published);
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  let out;
  try{
    if(process.argv.length!==2)throw Error('arguments forbidden');
    const raw=readFileSync(0,'utf8');
    if(raw.length>3500000)throw Error('oversized');
    out=offlineLiveConnectionReadiness(JSON.parse(raw));
  }catch{out=result('BLOCKED','INPUT_INVALID');}
  process.stdout.write(JSON.stringify(out)+'\n');
  if(out.status==='BLOCKED')process.exitCode=1;
}
