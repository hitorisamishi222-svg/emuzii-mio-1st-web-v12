/**
 * NEW ONLY: verify that a local one-function preflight never overwrites its
 * inputs, refuses unknown current GAS shapes, preserves concurrent edits and
 * does not create a candidate after a failed compatibility check.
 *
 * The input fixture is the NON-PRODUCTION released development Code.gs.
 * No external network, no Google API, no real identity, no deployment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const baselinePath=resolve(process.env.MIO_GACHA_CORE_PATH);
const tool=resolve('gacha-ui/tools/gacha-gas-dedup-preflight.mjs');
const replacementPath=resolve('gacha-ui/patches/gacha-won-duplicate-keys-replacement-v216.gs');
const original=readFileSync(baselinePath,'utf8');
const replacement=readFileSync(replacementPath,'utf8');
const regex=/^function wonDuplicateKeys_\(ss,id\)\{[\s\S]*?^\}/gm;
assert.equal([...original.matchAll(regex)].length,1);
assert.equal([...replacement.matchAll(regex)].length,1);
const replaceFn=(src)=>src.replace(regex,[...replacement.matchAll(regex)][0][0]);

function attempt(sourceContent,options={}){
 const dir=mkdtempSync(join(tmpdir(),'gacha-preflight-'));
 const source=join(dir,'source.gs'),out=join(dir,'result.gs'),reportPath=join(dir,'report.json');
 writeFileSync(source,sourceContent,'utf8');
 if(options.occupied)writeFileSync(out,'DO_NOT_OVERWRITE','utf8');
 const flags=[
  '--source',options.sourceIsOutput?out:source,
  '--baseline',baselinePath,
  '--replacement',replacementPath,
  '--out',out,'--report',reportPath
 ];
 if(options.sourceIsOutput)writeFileSync(out,sourceContent,'utf8');
 const child=spawnSync(process.execPath,[tool,...flags],{encoding:'utf8',timeout:8000});
 const parsed=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):null;
 const result={
  status:child.status,stderr:child.stderr,stdout:child.stdout,
  report:parsed,output:existsSync(out)?readFileSync(out,'utf8'):null,
  sourceAfter:readFileSync(source,'utf8')
 };
 rmSync(dir,{recursive:true,force:true});
 return result;
}

test('known stage: candidate replaces precisely the dedup function, not other code',()=>{
 const r=attempt(original);
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.equal(r.report.status,'candidate_ready');
 assert.equal(r.report.candidateWritten,true);
 assert.equal(r.output,replaceFn(original));
 assert.equal(r.sourceAfter,original);
});
test('unrelated concurrently edited registration function is byte-for-byte preserved',()=>{
 const modified=original.replace('function doGet(){', '/* PRESERVE ANOTHER TEAM CHANGE */\nfunction doGet(){');
 assert.notEqual(modified,original);
 const r=attempt(modified);
 assert.equal(r.status,0,r.stdout);
 assert.equal(r.output,replaceFn(modified));
 assert.ok(r.output.includes('/* PRESERVE ANOTHER TEAM CHANGE */'));
});
test('unknown live dedup implementation blocks without candidate',()=>{
 const unknown=original.replace('var won={};','var won={}; /* LOCAL-UNKNOWN-VARIANT */');
 assert.notEqual(unknown,original);
 const r=attempt(unknown);
 assert.equal(r.status,1);
 assert.equal(r.report.status,'blocked');
 assert.match(r.report.reason,/differs from the known staged version/);
 assert.equal(r.output,null);
 assert.equal(r.sourceAfter,unknown);
});
test('already applied patch is idempotent and emits no duplicate function or draft',()=>{
 const r=attempt(replaceFn(original));
 assert.equal(r.status,0,r.stdout);
 assert.equal(r.report.status,'already_applied');
 assert.equal(r.report.candidateWritten,false);
 assert.equal(r.output,null);
});
test('missing locking boundary rejects unknown source',()=>{
 const unsafe=original.replace('LockService.getScriptLock()', 'null /* SCRIPT LOCK IS NOT PRESENT */');
 const r=attempt(unsafe);
 assert.equal(r.status,1);
 assert.match(r.report.reason,/Required guard not recognized/);
 assert.equal(r.output,null);
});
test('missing dependency or duplicate function refuses generation',()=>{
 const unsafe=original.replace('function normalizeDuplicateKey_(', 'function renamedNormalize_(');
 const r=attempt(unsafe);
 assert.equal(r.status,1);
 assert.match(r.report.reason,/Missing or duplicate dependency/);
 assert.equal(r.output,null);
});
test('existing candidate file is never overwritten',()=>{
 const r=attempt(original,{occupied:true});
 assert.equal(r.status,1);
 assert.match(r.report.reason,/already exists/);
 assert.equal(r.output,'DO_NOT_OVERWRITE');
});
test('source and output same path is rejected before any file edit',()=>{
 const r=attempt(original,{sourceIsOutput:true});
 assert.equal(r.status,2);
 assert.equal(r.output,original);
 assert.equal(r.report,null);
});
test('source with an extra duplicate definition is rejected',()=>{
 const dup=original+'\n'+[...original.matchAll(regex)][0][0]+'\n';
 const r=attempt(dup);
 assert.equal(r.status,1);
 assert.match(r.report.reason,/exactly one/);
 assert.equal(r.output,null);
});
