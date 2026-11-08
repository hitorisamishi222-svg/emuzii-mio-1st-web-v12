// Read-only Apps Script source triage. No API calls or writes, no source output.
// Operator provides authenticated published source privately; never commit it.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const REQUIRED_ACTIONS=['Read','Member','Approve','Grant','Review','Create','Intake'];
const HANDLER='mioAdminOps_';
const stop=(reason,details={})=>({ok:false,status:'STOP',reason,readOnly:true,
 publicationAllowed:false,patchAllowed:false,...details});
const sourceNames=(text)=>[...text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);

/**
 * Source strings must be taken from the actual Apps Script project, not a
 * guessed GitHub backup. This never emits source or personal data.
 * Static triage only; a successful classification is NOT a deployment approval.
 */
export function preflightOperatorDispatch(files){
 if(!Array.isArray(files)||files.length<1||files.length>150)return stop('SOURCE_FILES_MISSING');
 const scripts=files.filter(f=>f&&f.type==='SERVER_JS');
 if(!scripts.length)return stop('NO_SERVER_JS');
 if(scripts.some(f=>typeof f.name!=='string'||typeof f.source!=='string'||
     f.source.length>1500000))return stop('INVALID_SERVER_SOURCE');
 const all=scripts.map(f=>f.source).join('\n');
 const functions=sourceNames(all),counts=new Map();
 for(const name of functions)counts.set(name,(counts.get(name)||0)+1);
 const critical=['doPost',HANDLER,...REQUIRED_ACTIONS.map(a=>'mioAdminOps'+a+'_')];
 const duplicate=critical.filter(n=>(counts.get(n)||0)>1);
 if(duplicate.length)return stop('DUPLICATE_CRITICAL_FUNCTIONS',{duplicateCount:duplicate.length});
 if((counts.get('doPost')||0)!==1)return stop('DOPOST_MISSING_OR_MULTIPLE');
 const required=critical.filter(n=>n!=='doPost');
 const missing=required.filter(n=>!counts.has(n));
 const start=all.search(/\bfunction\s+doPost\s*\(/);
 // Scope to doPost only, not the next named function. This is a conservative
 // static check, not a parser or security proof.
 const tail=all.slice(start);
 const next=tail.slice(1).search(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(/);
 const body=next<0?tail:tail.slice(0,next+1);
 const secret=body.search(/\bBRIDGE_SECRET\b/);
 const participant=body.search(/invalid identity/);
 const route=body.search(/webAdminOps\(\?:Read\|Member\|Approve\|Grant\|Review\|Create\|Intake\)/);
 const routeAlternate=body.search(/webAdminOps(?:Read|Member|Approve|Grant|Review|Create|Intake)/);
 const actionNames=REQUIRED_ACTIONS.filter(a=>body.includes('webAdminOps'+a));
 const routePresent=route>=0||actionNames.length===REQUIRED_ACTIONS.length;
 const beforeParticipant=route>=0?route<participant:routeAlternate>=0&&routeAlternate<participant;
 const evidence={requiredFunctionCount:required.length,missingFunctionCount:missing.length,
  missingFunctions:missing,dispatcherDetected:routePresent,secretGuardDetected:secret>=0,
  participantGuardDetected:participant>=0,dispatcherBeforeParticipant:beforeParticipant};
 if(secret<0||participant<0)return stop('UNRECOGNIZED_AUTH_OR_PARTICIPANT_GUARD',evidence);
 if(missing.length)return stop('ADMIN_HANDLERS_INCOMPLETE_NO_AUTOPATCH',evidence);
 if(!routePresent)return stop('DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW',evidence);
 if(!beforeParticipant)return stop('DISPATCHER_AFTER_PARTICIPANT_GUARD',evidence);
 if(route>=0&&route<secret)return stop('DISPATCHER_BEFORE_SECRET_GUARD',evidence);
 return {ok:true,status:'STATIC_DISPATCH_PRESENT_REQUIRES_PUBLISHED_VERSION_PROOF',
  readOnly:true,publicationAllowed:false,patchAllowed:false,...evidence};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 let result;
 try{
  if(process.argv.length!==2)throw Error('args forbidden');
  const raw=readFileSync(0,'utf8');
  if(raw.length>3500000)throw Error('oversized');
  result=preflightOperatorDispatch(JSON.parse(raw).files);
 }catch{result=stop('INPUT_INVALID')}
 process.stdout.write(JSON.stringify(result)+'\n');
 if(!result.ok)process.exitCode=1;
}
