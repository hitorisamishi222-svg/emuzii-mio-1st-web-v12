/**
 * NEW ONLY: verify whether a small gacha-only selective release package can
 * be PREPARED, without modifying main, publishing to Vercel or touching GAS.
 * This is intentionally a "fail closed" release boundary, not a deployer.
 *
 * node tools/gacha-release-boundary-check.mjs MAIN_DIR GACHA_DIR
 *
 * The base main commit is pinned to protect the concurrent participant
 * recovery work. If main changes: STOP and review the updated main first.
 */
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const main=process.argv[2],feature=process.argv[3];
if(!main||!feature||main===feature)throw Error('Two different read-only checkout directories required');
const read=(dir,path)=>readFileSync(join(dir,path),'utf8');
const json=(dir,path)=>JSON.parse(read(dir,path));
const head=dir=>execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim();

const EXPECTED_PRODUCTION_MAIN='a701935c72c8f2fd37dd798c269c28376081494e';
const baseHead=head(main),featureHead=head(feature);
assert.equal(baseHead,EXPECTED_PRODUCTION_MAIN,
  'STOP: production main changed since concurrent auth/device recovery protection snapshot');

const m=json(main,'vercel.json'),f=json(feature,'vercel.json');
const whitelist=[
 'api-gacha.js','gacha-page.js','gacha.html','vercel.json',
 'gacha-contract.js','gacha-deluxe-v21.js','gacha-deluxe-v21.css',
 'assets/mio-undersea-palace-stage.svg'
];
const newBuildFiles=[
 'gacha-contract.js','gacha-deluxe-v21.js','gacha-deluxe-v21.css',
 'assets/mio-undersea-palace-stage.svg'
];
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const mBuild=m.builds||[],fBuild=f.builds||[];
for(const row of mBuild){
 const matches=fBuild.filter(x=>x.src===row.src);
 assert.equal(matches.length,1,'base build removed or duplicated: '+row.src);
 assert.ok(eq(matches[0],row),'base build mutated: '+row.src);
}
const additions=fBuild.filter(x=>!mBuild.some(y=>y.src===x.src));
assert.deepEqual(additions.map(x=>x.src).sort(),newBuildFiles.slice().sort(),
 'STOP: unexpected Vercel build additions');
for(const item of additions)assert.equal(item.use,'@vercel/static');
assert.ok(eq(m.routes,f.routes),'STOP: production routes changed');
for(const key of new Set([...Object.keys(m),...Object.keys(f)]))
 if(key!=='builds')assert.ok(eq(m[key],f[key]),'STOP: Vercel config changed: '+key);

const mainApi=read(main,'api-gacha.js'), featureApi=read(feature,'api-gacha.js');
const importGuard="import {hasSafeGachaContract} from './gacha-contract.js';\n";
const blockStart="  // Read-only safety preflight before any fresh or replayed draw.";
const blockEnd="  const data=await bridge(body.action,";
assert.ok(featureApi.includes(importGuard));
const start=featureApi.indexOf(blockStart),end=featureApi.indexOf(blockEnd,start);
assert.ok(start>0&&end>start,'STOP: cannot isolate new read-only preflight');
const apiRebuilt=featureApi.replace(importGuard,'').slice(0,start-importGuard.length)
 +featureApi.replace(importGuard,'').slice(end-importGuard.length);
assert.equal(apiRebuilt,mainApi,
 'STOP: API has unrelated changes; do not transplant over live auth');
assert.match(featureApi,/await bridge\('catalog',identity\)/);
assert.match(featureApi,/!hasSafeGachaContract\(current\)/);

const frontend=read(feature,'gacha-page.js');
assert.match(frontend,/const isPreview=location\.hostname!=='emuzii-mio-1st-web-v12\.vercel\.app'/);
assert.ok(!read(main,'gacha-page.js').includes('hasSafeGachaContract'));
assert.match(frontend,/import \{hasSafeGachaContract\} from '\.\/gacha-contract\.js'/);
const script=read(feature,'gacha-contract.js');
assert.match(script,/export function hasSafeGachaContract\(/);
assert.match(script,/c\.webDrawsUsed>=c\.festAvailableFrom-1/);
const html=read(feature,'gacha.html');
assert.ok(html.includes('src="/gacha-page.js"'));
assert.ok(html.includes('src="/gacha-deluxe-v21.js"'));
assert.ok(html.includes('href="/gacha-deluxe-v21.css"'));
for(const name of whitelist)assert.ok(existsSync(join(feature,name)),'missing feature source '+name);
for(const name of ['bridge.js','api-status.js','api-register.js','api-enroll-lite.js'])
 assert.ok(existsSync(join(main,name)), 'existing recovery/registration source missing '+name);
assert.equal(new Set(whitelist).size,whitelist.length);

const report={
 verdict:'GACHA_SELECTIVE_PACKAGE_READY_FOR_REVIEW_ONLY',
 deployable:false,
 deployedGASSourceVerified:false,
 mainUnchanged:true,
 exactProtectedBase:baseHead,
 featureCommit:featureHead,
 legacyVercelBuildsPreserved:mBuild.length,
 routeCountPreserved:(m.routes||[]).length,
 newStaticBuilds:newBuildFiles,
 selectiveFiles:whitelist,
 preservedFunctions:['other-project auth','device recovery','registration'],
 blockers:[
  'Current deployed Apps Script (all files/HEAD) has not been read or compared',
  'No authenticated real participant-safe live integration has been established',
  'Admin has not enabled normal or festival gacha reception',
  'Production and preview branches diverge; NEVER merge the entire feature branch'
 ]
};
console.log(JSON.stringify(report,null,2));
