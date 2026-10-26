/**
 * NEW ONLY: Test legacy GitHub main -> staged gacha FUNCTION-ONLY
 * offline compatibility candidate. This tests the migration planner,
 * NOT the live GAS project, real Sheets or release readiness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const main=readFileSync(process.env.MIO_MAIN_CODE_PATH,'utf8');
const stage=readFileSync(process.env.MIO_GACHA_CORE_PATH,'utf8');
const script=resolve('gacha-ui/tools/gacha-legacy-main-candidate.mjs');
const patch=resolve('gacha-ui/patches/gacha-won-duplicate-keys-replacement-v216.gs');
const base=resolve(process.env.MIO_MAIN_CODE_PATH),modern=resolve(process.env.MIO_GACHA_CORE_PATH);
function run(input,opts={}){
 const dir=mkdtempSync(join(tmpdir(),'mio-gacha-candidate-'));
 try{
  const source=join(dir,'source.gs'),out=join(dir,'candidate.gs'),report=join(dir,'report.json');
  writeFileSync(source,input);
  if(opts.occupied)writeFileSync(out,'PRESERVE_EXISTING');
  const child=spawnSync(process.execPath,[script,
   '--source',source,'--baseline',base,'--stage',modern,
   '--patch',patch,'--out',out,'--report',report],
   {encoding:'utf8',timeout:8000});
  return {code:child.status,stderr:child.stderr,stdout:child.stdout,
   sourceAfter:readFileSync(source,'utf8'),
   candidate:existsSync(out)?readFileSync(out,'utf8'):null,
   report:existsSync(report)?JSON.parse(readFileSync(report,'utf8')):null};
 }finally{rmSync(dir,{recursive:true,force:true})}
}
const prefix=(str,name)=>{
 const idx=str.indexOf('function '+name+'(');
 assert.ok(idx>=0,'missing '+name);
 return str.slice(0,idx);
};

test('main legacy source creates separate review-only candidate, no source write',()=>{
 const r=run(main);
 assert.equal(r.code,0,r.stderr+' '+r.stdout);
 assert.equal(r.report.status,'CANDIDATE_READY_REVIEW_ONLY');
 assert.equal(r.report.deployable,false);
 assert.equal(r.report.liveGASVerified,false);
 assert.equal(r.report.requiresSheetSchemaReview,true);
 assert.deepEqual(r.report.changedFunctions,['catalog_','gachaAction_']);
 assert.deepEqual(r.report.appendedFunctions,
  ['normalizeDuplicateKey_','prizeDuplicateKeyFromRow_','participantCatalog_','wonDuplicateKeys_']);
 assert.equal(r.sourceAfter,main);
 assert.ok(r.candidate.includes('function wonDuplicateKeys_('));
 assert.ok(r.candidate.includes('history.length>=festAvailableFrom-1'));
 assert.ok(r.candidate.includes('available=c.prizes.filter('));
 assert.equal((r.candidate.match(/function wonDuplicateKeys_\(/g)||[]).length,1);
 assert.ok(r.candidate.includes('function setupGachaGate('),'preserve main admin controls');
 assert.ok(r.candidate.includes('function gachaOpenState_('),'preserve main gate logic');
});
test('unrelated authentication change is preserved verbatim',()=>{
 const changed=main.replace('function doPost(e) {','/* USER_AUTH_CHANGE_NEVER_LOSE */\nfunction doPost(e) {');
 assert.notEqual(changed,main);
 const r=run(changed);
 assert.equal(r.code,0,r.stdout);
 assert.equal(r.sourceAfter,changed);
 assert.ok(r.candidate.includes('/* USER_AUTH_CHANGE_NEVER_LOSE */'));
 assert.ok(r.candidate.includes('function gachaOpenState_('));
});
test('unknown changes to legacy gachaAction fail closed',()=>{
 const changed=main.replace("if(remaining<1)return {ok:false,error:'残り回数がありません'};",
 "if(remaining<2)return {ok:false,error:'残り回数がありません'};");
 assert.notEqual(changed,main);
 const r=run(changed);
 assert.equal(r.code,1,r.stdout);
 assert.equal(r.report.status,'BLOCKED');
 assert.match(r.report.reason,/gachaAction_ differs/);
 assert.equal(r.candidate,null);
});
test('unknown changes to legacy catalog fail closed',()=>{
 const changed=main.replace("if(total!==10000)valid=false;","if(total!==9900)valid=false;");
 assert.notEqual(changed,main);
 const r=run(changed);
 assert.equal(r.code,1,r.stdout);
 assert.match(r.report.reason,/catalog_ differs/);
 assert.equal(r.candidate,null);
});
test('input already containing a dedup helper blocks duplicate declaration',()=>{
 const changed=main+'\nfunction wonDuplicateKeys_(ss,id){return {};}\n';
 const r=run(changed);
 assert.equal(r.code,1,r.stdout);
 assert.match(r.report.reason,/already has wonDuplicateKeys_/);
 assert.equal(r.candidate,null);
});
test('output exists: never overwrite draft',()=>{
 const r=run(main,{occupied:true});
 assert.equal(r.code,1,r.stdout);
 assert.match(r.report.reason,/already exists/);
 assert.equal(r.candidate,'PRESERVE_EXISTING');
});
test('reference source cannot be replaced wholesale by stage',()=>{
 const r=run(main);
 assert.equal(r.code,0,r.stdout);
 assert.ok(r.candidate.length<main.length+stage.length/2);
 assert.equal(prefix(r.candidate,'catalog_'),prefix(main,'catalog_'));
 // No staged auto-approval or register() functions were transplanted.
 assert.ok(!r.candidate.includes('function autoLinkWebParticipant_('));
 assert.ok(!r.candidate.includes('function webIntegrityOk_('));
});
