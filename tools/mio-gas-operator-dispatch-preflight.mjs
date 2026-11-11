// Read-only Apps Script source triage. No API calls or writes, no source output.
// Operator provides authenticated published source privately; never commit it.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const REQUIRED_ACTIONS=['Read','Member','Approve','Grant','Review','Create','Intake'];
// Full 21-function operator module from the reviewed candidate. A partial
// implementation must never pass just because its 7 action handlers exist.
const REQUIRED_HELPERS=['Str','Name','Sheet','Schema','Values','One','People','Summary',
 'Request','Log','Existing','WriteLog','RecordGrant'];
const REQUIRED_FUNCTIONS=['mioAdminOps_',...REQUIRED_ACTIONS.map(x=>'mioAdminOps'+x+'_'),
 ...REQUIRED_HELPERS.map(x=>'mioAdminOps'+x+'_')];
// Helpers shared with the existing October GAS. Missing definitions cause
// runtime failure even when all admin handlers themselves are present.
const REQUIRED_SHARED=['json_','equal_','safeText_','webIntegrityOk_','ensureWebDerivedRow_'];
const stop=(reason,details={})=>({ok:false,status:'STOP',reason,readOnly:true,
 publicationAllowed:false,patchAllowed:false,...details});
// Ignore commented declarations: a removed handler must not be 'restored' by
// a line or block comment. This remains a conservative static preflight, not
// a JavaScript parser or proof of deployed code.
const stripComments=text=>text.replace(/\/\*[\s\S]*?\*\//g,'\n')
 .replace(/^[ \t]*\/\/[^\r\n]*/gm,'');
const declaration=/^[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(/gm;
const sourceNames=text=>[...stripComments(text).matchAll(declaration)].map(m=>m[1]);

// A route appearing only inside a quoted string or inline // comment is not
// an executable dispatcher. Keep regex literals intact for the real route.
// This is deliberately conservative: syntax we cannot prove may STOP.
const maskNonExecutable = source => {
 let out='', quote='', lineComment=false;
 for(let i=0;i<source.length;i++){
  const ch=source[i],next=source[i+1];
  if(lineComment){
   if(ch==='\n'||ch==='\r'){lineComment=false;out+=ch}
   else out+=' ';
   continue;
  }
  if(quote){
   if(ch==='\\'){
    out+=' ';
    if(i+1<source.length){
     i++;
     const escaped=source[i];
     out+=(escaped==='\n'||escaped==='\r')?escaped:' ';
    }
   }else if(ch===quote){quote='';out+=' '}
   else out+=(ch==='\n'||ch==='\r')?ch:' ';
   continue;
  }
  if(ch==='/'&&next==='/'){lineComment=true;out+='  ';i++;continue;}
  if(ch==='\''||ch==='"'||ch==='\x60'){quote=ch;out+=' ';continue;}
  out+=ch;
 }
 return out;
};

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
 const all=stripComments(scripts.map(f=>f.source).join('\n'));
 const functions=sourceNames(all),counts=new Map();
 for(const name of functions)counts.set(name,(counts.get(name)||0)+1);
 const critical=['doPost',...REQUIRED_FUNCTIONS,...REQUIRED_SHARED];
 const duplicate=critical.filter(n=>(counts.get(n)||0)>1);
 if(duplicate.length)return stop('DUPLICATE_CRITICAL_FUNCTIONS',{duplicateCount:duplicate.length});
 if((counts.get('doPost')||0)!==1)return stop('DOPOST_MISSING_OR_MULTIPLE');
 const required=REQUIRED_FUNCTIONS;
 const missing=required.filter(n=>!counts.has(n));
 const missingShared=REQUIRED_SHARED.filter(n=>!counts.has(n));
 const start=all.search(/^[ \t]*function[ \t]+doPost[ \t]*\(/m);
 // Scope to doPost only, not the next named function. This is a conservative
 // static check, not a parser or security proof.
 const tail=all.slice(start);
 const next=tail.slice(1).search(/^[ \t]*(?:async[ \t]+)?function[ \t]+[A-Za-z_$][\w$]*[ \t]*\(/m);
 const body=next<0?tail:tail.slice(0,next+1);
 const secret=body.search(/\bBRIDGE_SECRET\b/);
 const participant=body.search(/invalid identity/);
 // Do not count names in comments as executable routes. A regex dispatcher
 // must call the operator handler, not merely mention action strings.
 const executable=maskNonExecutable(body);
 const routeMatch=executable.match(/if\s*\(\s*\/\^webAdminOps\(\?:Read\|(?:Member\|Approve|Approve\|Member)\|Grant\|Review\|Create\|Intake\)\$\/\.test\(d\.action\)\s*\)\s*return\s+json_\(mioAdminOps_\(/);
 const dispatchAt=routeMatch?executable.indexOf(routeMatch[0]):-1;
 const authAt=executable.search(/if\s*\(\s*!secret\s*\|\|\s*!equal_\(d\.secret,secret\)\s*\)/);
 const participantAt=executable.search(/if\s*\(\s*!\/\^MIO-W-/);
 // A valid admin route still needs serialization: the production October
 // script protects GAS writes with ScriptLock before secret/dispatch and
 // releases it in finally. No runtime test and no deployment permission here.
 const lockAt=executable.search(/\b(?:var|let|const)\s+lock\s*=\s*LockService\.getScriptLock\s*\(\s*\)/);
 const acquiredAt=executable.search(/if\s*\(\s*!\s*lock\.tryLock\s*\(\s*\d+\s*\)\s*\)\s*return\b/);
 const tryAt=executable.search(/\btry\s*\{/);
 const finallyAt=executable.search(/\bfinally\s*\{\s*lock\.releaseLock\s*\(\s*\)\s*;/);
 const lockGuardValid=lockAt>=0&&acquiredAt>lockAt&&tryAt>acquiredAt&&
   authAt>tryAt&&dispatchAt>authAt&&finallyAt>participantAt&&finallyAt>dispatchAt;
 const routePresent=dispatchAt>=0;
 const beforeParticipant=dispatchAt>=0&&participantAt>=0&&dispatchAt<participantAt;
 const evidence={requiredFunctionCount:required.length,missingFunctionCount:missing.length,
  missingFunctions:missing,requiredSharedCount:REQUIRED_SHARED.length,
  missingSharedCount:missingShared.length,missingSharedFunctions:missingShared,
  dispatcherDetected:routePresent,secretGuardDetected:secret>=0,
  participantGuardDetected:participant>=0,dispatcherBeforeParticipant:beforeParticipant,
  scriptLockGuardDetected:lockGuardValid};
 if(secret<0||participant<0||authAt<0||participantAt<0)return stop('UNRECOGNIZED_AUTH_OR_PARTICIPANT_GUARD',evidence);
 if(missing.length)return stop('ADMIN_HANDLERS_INCOMPLETE_NO_AUTOPATCH',evidence);
 if(missingShared.length)return stop('SHARED_HELPERS_MISSING_NO_AUTOPATCH',evidence);
 if(!routePresent)return stop('DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW',evidence);
 if(!beforeParticipant)return stop('DISPATCHER_AFTER_PARTICIPANT_GUARD',evidence);
 if(dispatchAt<authAt)return stop('DISPATCHER_BEFORE_SECRET_GUARD',evidence);
 if(!lockGuardValid)return stop('SCRIPT_LOCK_GUARD_MISSING_OR_MISPLACED',evidence);
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
