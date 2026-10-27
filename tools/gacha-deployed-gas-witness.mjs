/**
 * MIO GACHA: OFFLINE, READ-ONLY deployed Apps Script version witness.
 *
 * Inputs are PRIVATE JSON responses from:
 * - GET projects.deployments.get (actual production deployment ID)
 * - GET projects.getContent?versionNumber=published-version
 * - GET projects.getContent (HEAD, without versionNumber).
 *
 * NEVER upload API source JSON, access tokens or credentials to GitHub.
 * All inputs remain local. No API calls, no writes, no running GAS.
 * Usage: node tools/gacha-deployed-gas-witness.mjs --deployment dep.json
 *          --published version.json --head head.json --deployment-id ID
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
function fail(s){console.error('BLOCKED: '+s);process.exit(1);}
const a={};
for(let i=2;i<process.argv.length;i+=2){
 const k=process.argv[i],v=process.argv[i+1];
 if(!['--deployment','--published','--head','--deployment-id'].includes(k)||!v||v.startsWith('--')||a[k])fail('Require four distinct named arguments');
 a[k]=v;
}
for(const k of ['--deployment','--published','--head','--deployment-id'])if(!a[k])fail('Missing '+k);
let dep,pub,head;
try{
 dep=JSON.parse(readFileSync(a['--deployment'],'utf8'));
 pub=JSON.parse(readFileSync(a['--published'],'utf8'));
 head=JSON.parse(readFileSync(a['--head'],'utf8'));
}catch{fail('Invalid or unreadable response JSON');}
const conf=dep?.deploymentConfig;
if(!conf||dep.deploymentId!==a['--deployment-id']||
 typeof conf.scriptId!=='string'||!conf.scriptId||
 !Number.isSafeInteger(conf.versionNumber)||conf.versionNumber<=0)
 fail('Deployment evidence does not match selected production deployment ID');
if(pub?.scriptId!==conf.scriptId||head?.scriptId!==conf.scriptId)
 fail('HEAD and deployed-version source must share the actual deployment script ID');
if(!Array.isArray(pub.files)||!Array.isArray(head.files)||!pub.files.length||!head.files.length)
 fail('Source file list missing');
const sha=s=>createHash('sha256').update(s).digest('hex');
function inspect(v,label){
 const seen=new Set(),out=[];
 for(const f of v.files){
  if(typeof f?.name!=='string'||!f.name||typeof f.source!=='string'||typeof f.type!=='string')
   fail(label+': malformed source file');
  const k=f.name+'::'+f.type;
  if(seen.has(k))fail(label+': duplicate filename '+f.name);
  seen.add(k);
  out.push({name:f.name,type:f.type,source:f.source,sha256:sha(f.source)});
 }
 if(!out.some(x=>x.name==='appsscript'&&x.type==='JSON'))fail(label+': missing appsscript.json');
 return out;
}
const published=inspect(pub,'published'),editing=inspect(head,'HEAD');
const script=published.filter(x=>x.type==='SERVER_JS');
if(!script.length)fail('Deployed version has no SERVER_JS files');
const defs=new Map();
for(const file of script)for(const match of file.source.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)){
 const arr=defs.get(match[1])||[];arr.push(file.name);defs.set(match[1],arr);
}
const required=['doPost','gachaAction_','catalog_','draws_','wonDuplicateKeys_',
 'participantCatalog_','normalizeDuplicateKey_','prizeDuplicateKeyFromRow_','gachaOpenState_'];
const missing=required.filter(n=>(defs.get(n)||[]).length!==1);
if(missing.length)fail('Deployed safety functions absent/duplicated: '+missing.join(', '));
const src=script.map(f=>f.source).join('\n');
const markers=[
 'LockService.getScriptLock()','tryLock(10000)','lock.releaseLock()',
 "if(d.mode==='ラキフェス'&&history.length<festAvailableFrom-1)",
 'wonDuplicateKeys_(ss,id)',
 'available=c.prizes.filter(function(p){return !wonKeys[p.duplicateKey]})',
 'webDrawsUsed:history.length','festUnlocked:festUnlocked'
];
const absent=markers.filter(m=>!src.includes(m));
if(absent.length)fail('Known deployed safety guards not found: '+absent.map(x=>x.slice(0,60)).join('; '));
const hm=new Map(editing.map(x=>[x.name+'::'+x.type,x]));
const different=published.filter(x=>hm.get(x.name+'::'+x.type)?.sha256!==x.sha256).map(x=>x.name);
const added=editing.filter(x=>!published.some(y=>y.name===x.name&&y.type===x.type)).map(x=>x.name);
const witness={
 verdict:'PUBLISHED_GAS_STATIC_WITNESS_PASS_REVIEW_ONLY',
 approvedToDeploy:false,versionNumber:conf.versionNumber,
 actualDeploymentIdWasChecked:true,publishedFileCount:published.length,
 headFileCount:editing.length,criticalFunctionsFound:required.length,
 safetyMarkersFound:markers.length,
 differentFromCurrentHead:different,onlyInHead:added,
 sourceContentsNotPrinted:true,
 stillRequired:[
 'Match production Vercel APPS_SCRIPT_URL deployment ID, not default repository URL',
 'Review current auth, participant recovery, and registered Web ID compatibility',
 'Perform authorization-safe read-only integration and administrator review',
 'Do not merge draft PR #44 or change gacha switches before final signoff'
 ]
};
console.log(JSON.stringify(witness,null,2));
