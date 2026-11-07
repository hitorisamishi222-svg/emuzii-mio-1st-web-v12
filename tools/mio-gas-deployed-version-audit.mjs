// OFFLINE ONLY: compare authenticated Apps Script read-only API evidence.
// Does not call an API, write a GAS project, create versions, or log source.
// For documentation: GET /v1/projects/{scriptId}/deployments/{deploymentId}
// and GET /v1/projects/{scriptId}/content?versionNumber={n}; optional HEAD.
// Never store production content, OAuth tokens or JSON responses in Git.
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {auditGasTarget} from './mio-gas-connection-target-audit.mjs';

// Historical Oct-23 project URL: candidate until deployment API proves linkage.
export const HISTORICAL_SCRIPT_ID_SHA256='6117bde73c4e4bdebc2e63ed4341513b41da48081bc78f8def8bbb9ff37fa6b1';

const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&
  /^[0-9a-f]{64}$/.test(a)&&/^[0-9a-f]{64}$/.test(b)&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const stop=(reason,extra={})=>({ok:false,status:'STOP',reason,publicationAllowed:false,...extra});

function inspectContent(content,scriptId){
 if(!content||content.scriptId!==scriptId||!Array.isArray(content.files)||
    content.files.length<2||content.files.length>150)return null;
 const files=content.files;
 const seen=new Set(),mapped=[];
 for(const file of files){
  if(!file||typeof file.name!=='string'||!/^[A-Za-z0-9_.-]{1,120}$/.test(file.name)||
     !['SERVER_JS','HTML','JSON'].includes(file.type)||typeof file.source!=='string')
    return null;
  const key=file.type+':'+file.name;
  if(seen.has(key))return null;
  seen.add(key);
  mapped.push({type:file.type,name:file.name,source:file.source});
 }
 if(!seen.has('JSON:appsscript'))return null;
 mapped.sort((a,b)=>(a.type+':'+a.name).localeCompare(b.type+':'+b.name));
 const digest=sha(JSON.stringify(mapped));
 return {digest,fileCount:mapped.length};
}

/** Returns only fixed diagnostic labels, counts, and digests. Never source or IDs. */
export function auditDeployedVersion({appsScriptUrl,scriptId,deployment,published,publishedVersionNumber,head}={}){
 const target=auditGasTarget(appsScriptUrl);
 if(!target.ok)return stop('LIVE_WEB_APP_TARGET_MISMATCH');
 // Historical project ID is a clue, NOT proof of a currently deployed script.
 if(typeof scriptId!=='string'||!safeEqual(sha(scriptId),HISTORICAL_SCRIPT_ID_SHA256))
   return stop('UNKNOWN_SCRIPT_PROJECT_ID');
 if(!deployment)return {ok:false,status:'DEPLOYMENT_METADATA_PENDING',reason:'NOT_READ',publicationAllowed:false};
 const id=/^https:\/\/script\.google\.com\/macros\/s\/([^/]+)\/exec$/.exec(appsScriptUrl)?.[1];
 const config=deployment.deploymentConfig;
 if(!id||deployment.deploymentId!==id||!config||
    config.scriptId!==scriptId||!Number.isSafeInteger(config.versionNumber)||
    config.versionNumber<1||config.versionNumber>1000000)
   return stop('PROJECT_DEPLOYMENT_OR_VERSION_MISMATCH');
 const version=config.versionNumber;
 const evidence={deployedVersion:version,projectVerified:true,deploymentVerified:true,publicationAllowed:false};
 if(!published)return {ok:false,status:'PUBLISHED_CONTENT_PENDING',reason:'NOT_READ',...evidence};
 if(publishedVersionNumber!==version)return stop('PUBLISHED_VERSION_REQUEST_MISMATCH',evidence);
 const publishedSnapshot=inspectContent(published,scriptId);
 if(!publishedSnapshot)return stop('PUBLISHED_CONTENT_INVALID',evidence);
 if(!head)return {ok:true,status:'PUBLISHED_CONTENT_VERIFIED_HEAD_PENDING',
   publishedDigest:publishedSnapshot.digest,publishedFileCount:publishedSnapshot.fileCount,
   sourceVerified:true,...evidence};
 const headSnapshot=inspectContent(head,scriptId);
 if(!headSnapshot)return stop('HEAD_CONTENT_INVALID',evidence);
 return {ok:true,status:'DEPLOYMENT_AND_SOURCE_READ_ONLY_VERIFIED',sourceVerified:true,
  publishedDigest:publishedSnapshot.digest,headDigest:headSnapshot.digest,
  publishedFileCount:publishedSnapshot.fileCount,headFileCount:headSnapshot.fileCount,
  headMatchesPublished:headSnapshot.digest===publishedSnapshot.digest,...evidence};
}

// Local operator may pipe a private JSON input; do not output it or its source.
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 let result;
 try{
  if(process.argv.length!==2)throw Error('args forbidden');
  const input=readFileSync(0,'utf8');
  if(input.length>2000000)throw Error('oversized');
  result=auditDeployedVersion(JSON.parse(input));
 }catch{result=stop('INPUT_INVALID')}
 process.stdout.write(JSON.stringify(result)+'\n');
 if(!result.ok)process.exitCode=1;
}
