/**
 * PR #44 candidate source-integrity gate, read-only.
 *
 * Check the exact pinned production ancestor + selective candidate HEAD.
 * The 8 candidate source bytes must equal the already-reviewed gacha feature,
 * and no non-gacha source file may differ from protected main. The branch may
 * stay Draft even when this gate passes: live GAS HEAD is still unverified.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const [main,candidate,feature]=process.argv.slice(2);
if(!main||!candidate||!feature||new Set([main,candidate,feature]).size!==3)
 throw Error('Usage: node audit.mjs MAIN_CHECKOUT CANDIDATE_CHECKOUT FEATURE_CHECKOUT');
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const expectedBase='a701935c72c8f2fd37dd798c269c28376081494e';
const expectedCandidate='703720294ad7588c2f5fe887e2dd2bab7e0fcfee';
const filenames=[
 'api-gacha.js','assets/mio-undersea-palace-stage.svg','gacha-contract.js',
 'gacha-deluxe-v21.css','gacha-deluxe-v21.js',
 'gacha-page.js','gacha.html','vercel.json'
].sort();
const headMain=git(main,'rev-parse','HEAD');
const headCandidate=git(candidate,'rev-parse','HEAD');
assert.equal(headMain,expectedBase,'STOP: main was changed; refresh protected baseline and re-review');
assert.equal(headCandidate,expectedCandidate,'STOP: PR #44 candidate changed since review; re-review');
assert.equal(git(candidate,'merge-base','HEAD',expectedBase),expectedBase,
 'candidate ancestry does not preserve production baseline');
assert.equal(git(candidate,'rev-list','--count',expectedBase+'..HEAD'),'10',
 'eight files, ten selective commits; no unexpected candidate commits');
const changed=git(candidate,'diff','--name-only',expectedBase+'..HEAD').split('\n').filter(Boolean).sort();
assert.deepEqual(changed,filenames,'candidate changed an unrelated source file');
const hashes=filenames.map(path=>{
 const c=readFileSync(join(candidate,path)),f=readFileSync(join(feature,path));
 assert.ok(c.equals(f),'candidate differs from already-tested feature: '+path);
 return {path,sha256:sha(c)};
});
const production=JSON.parse(readFileSync(join(main,'vercel.json'),'utf8'));
const prepared=JSON.parse(readFileSync(join(candidate,'vercel.json'),'utf8'));
const bySource=new Map(prepared.builds.map(x=>[x.src,x]));
for(const rule of production.builds){
 assert.deepEqual(bySource.get(rule.src),rule,'Vercel build overwritten: '+rule.src);
}
assert.deepEqual(prepared.routes,production.routes,'Vercel routes changed');
assert.equal(prepared.builds.length,production.builds.length+4);
const blockerNames=['Code.gs','DeviceRecoveryV187.gs','GachaAdminV188.gs','BrowserAddV189Patch.gs'];
const changedSet=new Set(changed);
for(const name of blockerNames)assert.ok(!changedSet.has(name),'unexpected GAS file in candidate');
const result={
  verdict:'PASS_PR44_SELECTIVE_CODE_INTEGRITY_ONLY',
  sourceImmutable:true,
  mainSha:headMain,
  candidateSha:headCandidate,
  featureSha:git(feature,'rev-parse','HEAD'),
  totalChangedFiles:changed.length,
  files:hashes,
  preservedBuildRules:production.builds.length,
  preservedRoutes:production.routes.length,
  newStaticAssets:4,
  gachaDrawsPerformed:0,
  productionModified:false,
  readyToMerge:false,
  remainsBlockedBy:'Current deployed GAS all-file HEAD read-only verification and final live-safe acceptance'
};
console.log(JSON.stringify(result,null,2));
