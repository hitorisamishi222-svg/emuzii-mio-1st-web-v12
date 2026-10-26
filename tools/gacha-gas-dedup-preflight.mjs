/**
 * GAS no-duplicate ONE-FUNCTION preflight.
 * Never connects to Google, never deploys, never edits the input.
 * Converts an independently exported current GAS source into a LOCAL draft
 * only when its existing dedup function is exactly the known staged version.
 *
 * Usage:
 * node tools/gacha-gas-dedup-preflight.mjs \
 *   --source /safe/read-only/current-Code.gs \
 *   --baseline /project/release-Code.gs \
 *   --replacement patches/gacha-won-duplicate-keys-replacement-v216.gs \
 *   --out /safe/draft/gacha-Code.candidate.gs \
 *   --report /safe/draft/gacha-preflight.json
 *
 * "baseline" means the read-only reference for an expected function signature;
 * no other function is copied from it. This command deliberately fails closed
 * on a divergent production version and asks for review, not an auto-merge.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const signature=/^function wonDuplicateKeys_\(ss,id\)\{[\s\S]*?^\}/gm;
const digest=s=>createHash('sha256').update(s).digest('hex');
const flags={};
for(let i=2;i<process.argv.length;i+=2){
 const key=process.argv[i],value=process.argv[i+1];
 if(!/^--(source|baseline|replacement|out|report)$/.test(key)||!value||value.startsWith('--')){
  console.error('Usage: node gacha-gas-dedup-preflight.mjs --source FILE --baseline FILE --replacement FILE --out FILE --report FILE');
  process.exit(2);
 }
 if(flags[key]){console.error('Duplicate flag '+key);process.exit(2);}
 flags[key]=value;
}
for(const key of ['--source','--baseline','--replacement','--out','--report']){
 if(!flags[key]){console.error('Missing required argument '+key);process.exit(2);}
}
const paths=Object.fromEntries(Object.entries(flags).map(([k,v])=>[k,resolve(v)]));
if(paths['--source']===paths['--out']||paths['--baseline']===paths['--out']||
   paths['--replacement']===paths['--out']||paths['--out']===paths['--report']||
   paths['--source']===paths['--report']||paths['--baseline']===paths['--report']){
 console.error('Inputs and outputs must be distinct files; refusing overwrite');
 process.exit(2);
}

const report={tool:'gacha-gas-dedup-preflight',version:1,
 status:'blocked',sourceSha256:null,baselineSha256:null,
 originalFunctionSha256:null,replacementFunctionSha256:null,
 candidateSha256:null,candidateWritten:false,reason:'not checked'};
const out=x=>{mkdirSync(dirname(paths['--report']),{recursive:true});writeFileSync(paths['--report'],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exit(x);};
let source,baseline,replacement;
try{
 source=readFileSync(paths['--source'],'utf8');
 baseline=readFileSync(paths['--baseline'],'utf8');
 replacement=readFileSync(paths['--replacement'],'utf8');
}catch(e){report.reason='A required input source is unreadable';out(1);}
report.sourceSha256=digest(source);
report.baselineSha256=digest(baseline);

function onlyOne(s,label){
 const functions=[...s.matchAll(signature)];
 if(functions.length!==1)throw Error(label+' must contain exactly one wonDuplicateKeys_(ss,id) function, found '+functions.length);
 return functions[0][0];
}
let original,known,desired;
try{original=onlyOne(source,'current source');known=onlyOne(baseline,'staged baseline');desired=onlyOne(replacement,'target replacement');}
catch(e){report.reason=e.message;out(1);}
report.originalFunctionSha256=digest(original);
report.replacementFunctionSha256=digest(desired);
const count=(s,needle)=>[...s.matchAll(new RegExp('^function '+needle+'\\(', 'gm'))].length;

// Structural contract: we're preserving all non-dedup code, but reject
// sources whose dependencies or lock/boundary checks cannot be recognized.
const necessary=['normalizeDuplicateKey_','prizeDuplicateKeyFromRow_','draws_','participantCatalog_','gachaAction_','doPost'];
for(const fn of necessary)if(count(source,fn)!==1){report.reason='Missing or duplicate dependency: '+fn;out(1);}
for(const needle of ['LockService.getScriptLock()','tryLock(10000)','lock.releaseLock()',
                     "r[7]","d.drawId","d.mode","DRAW_TAB","PRIZE_TAB"]){
 if(!source.includes(needle)){report.reason='Required guard not recognized: '+needle;out(1);}
}
if(original===desired){
 report.status='already_applied';
 report.reason='Candidate dedup function is already present; no replacement necessary';
 out(0);
}
if(original!==known){
 report.reason='Current dedup function differs from the known staged version. Manual review required. NO candidate was produced.';
 out(1);
}
if(existsSync(paths['--out'])){
 report.reason='Output candidate path already exists; refusing overwrite';
 out(1);
}
const candidate=source.replace(original,desired);
if(candidate===source||[...candidate.matchAll(signature)].length!==1){
 report.reason='Replacement safety check failed';out(1);
}
report.status='candidate_ready';
report.reason='Only the existing dedup function was replaced in a LOCAL draft; review required before any deployment';
report.candidateSha256=digest(candidate);
mkdirSync(dirname(paths['--out']),{recursive:true});
writeFileSync(paths['--out'],candidate);
report.candidateWritten=true;
out(0);
