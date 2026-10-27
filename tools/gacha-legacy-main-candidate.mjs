/**
 * MIO Gacha — OFFLINE LEGACY MAIN COMPATIBILITY CANDIDATE.
 * No Google API calls, no deployment, no edits to supplied input source.
 * Generates a separate review-only candidate if legacy gacha functions are
 * EXACT matches to the supplied pinned GitHub main baseline.
 * Production GAS is NOT verified to equal GitHub's main Code.gs.
 */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const args={};
for(let i=2;i<process.argv.length;i+=2){
 const key=process.argv[i],v=process.argv[i+1];
 if(!/^--(source|baseline|stage|patch|out|report)$/.test(key||'')||!v||v.startsWith('--')||args[key]){
  console.error('Usage: --source SOURCE --baseline PINNED_MAIN --stage PINNED_STAGE --patch PATCH --out CANDIDATE --report REPORT');
  process.exit(2);
 }
 args[key]=resolve(v);
}
const required=['--source','--baseline','--stage','--patch','--out','--report'];
if(required.some(k=>!args[k])||new Set(required.map(k=>args[k])).size!==required.length){
 console.error('Six distinct paths required. Output may never overwrite inputs.');process.exit(2);
}
const report={type:'MIO_GACHA_LEGACY_MAIN_CANDIDATE',status:'BLOCKED',
 liveGASVerified:false,deployable:false,changedFunctions:[],appendedFunctions:[],
 sourceSha256:'',candidateSha256:'',reason:'',requiresSheetSchemaReview:true};
function stop(reason,code=1){
 report.reason=reason;
 mkdirSync(dirname(args['--report']),{recursive:true});
 writeFileSync(args['--report'],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));process.exit(code);
}
let source,base,stage,patch;
try{
 source=readFileSync(args['--source'],'utf8');
 base=readFileSync(args['--baseline'],'utf8');
 stage=readFileSync(args['--stage'],'utf8');
 patch=readFileSync(args['--patch'],'utf8');
}catch(e){stop('Required input not accessible');}
report.sourceSha256=sha(source);
function countDef(src,name){
 const pattern=new RegExp('^function '+name+'\\(', 'gm');
 return [...src.matchAll(pattern)].length;
}
function getFn(src,name){
 const pattern=new RegExp('^function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?^\\}', 'gm');
 const matches=[...src.matchAll(pattern)];
 if(matches.length!==1)throw Error(name+' expected exactly one whole top-level definition, found '+matches.length);
 return matches[0][0];
}
const changed=['catalog_','gachaAction_'];
const added=['normalizeDuplicateKey_','prizeDuplicateKeyFromRow_','participantCatalog_','wonDuplicateKeys_'];
let candidate=source;
try{
 // Missing or double-defined core interfaces: STOP.
 for(const n of ['doPost','draws_','setupGacha_','gachaOpenState_',...changed]){
  if(countDef(source,n)!==1)stop('Unknown or duplicate interface '+n);
 }
 for(const n of changed){
  const original=getFn(source,n),expected=getFn(base,n),modern=getFn(stage,n);
  if(original!==expected)stop('Current '+n+' differs from known main: review by hand');
  if(original===modern)stop(n+' unexpectedly identical to new function');
  candidate=candidate.replace(original,modern);
  report.changedFunctions.push(n);
 }
 for(const n of added)if(countDef(source,n)!==0)stop('Source already has '+n+' — must not append blindly');
 const blocks=[
  getFn(stage,'normalizeDuplicateKey_'),
  getFn(stage,'prizeDuplicateKeyFromRow_'),
  getFn(stage,'participantCatalog_'),
  getFn(patch,'wonDuplicateKeys_')
 ];
 candidate+='\n\n'+blocks.join('\n\n');
 report.appendedFunctions=added.slice();
 for(const needle of ["LockService.getScriptLock()","tryLock(10000)","lock.releaseLock()",
   "var id=r[7]","function gachaOpenState_","function doPost"]){
  if(!candidate.includes(needle))stop('Cannot locate safety guard '+needle);
 }
 for(const n of [...changed,...added]){
  if(countDef(candidate,n)!==1)getFn(candidate,n);
  getFn(candidate,n);
 }
 const neutral=s=>changed.reduce((v,n)=>v.replace(getFn(v,n),'/* REPLACE_ONLY_'+n+' */'),s);
 if(neutral(candidate)!==neutral(source)+'\n\n'+blocks.join('\n\n'))stop('Unrelated source bytes would change');
 if(existsSync(args['--out']))stop('Candidate output already exists; refusing overwrite');
 report.status='CANDIDATE_READY_REVIEW_ONLY';
 report.candidateSha256=sha(candidate);
 mkdirSync(dirname(args['--out']),{recursive:true});
 writeFileSync(args['--out'],candidate);
 stop('Offline review-only candidate generated. Verify actual deployed GAS and sheet headers before any change.',0);
}catch(e){stop('Compatibility check stopped: '+e.message);}
