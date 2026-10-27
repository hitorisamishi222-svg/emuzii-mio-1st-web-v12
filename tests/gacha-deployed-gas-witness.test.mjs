/**
 * NEW ONLY: tests of the read-only Apps Script deployment-version verifier.
 * All examples contain SYNTHETIC code and IDs, never customer data/tokens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const tool=resolve('tools/gacha-deployed-gas-witness.mjs');
const id='fake-script-private-fixture', deploymentId='fake-production-deployment';
const version=34;
const required=['doPost','gachaAction_','catalog_','draws_','wonDuplicateKeys_','participantCatalog_','normalizeDuplicateKey_','prizeDuplicateKeyFromRow_','gachaOpenState_'];
const baseSource=[
 ...required.map(n=>'function '+n+'(){\n  return true;\n}'),
 // The verifier checks textual static markers; nothing here executes.
 "var lock=LockService.getScriptLock();",
 "lock.tryLock(10000);",
 "lock.releaseLock();",
 "if(d.mode==='ラキフェス'&&history.length<festAvailableFrom-1){ return false; }",
 "var won=wonDuplicateKeys_(ss,id);",
 "var available=c.prizes.filter(function(p){return !wonKeys[p.duplicateKey]});",
 "var snapshot={webDrawsUsed:history.length,festUnlocked:festUnlocked};"
].join('\n');
const file=(name,source,type='SERVER_JS')=>({name,type,source});
const manifest=file('appsscript','{"timeZone":"Asia/Tokyo"}','JSON');
const exportFile=(source=baseSource)=>({scriptId:id,files:[file('Code',source),manifest]});
const deployment={deploymentId,deploymentConfig:{scriptId:id,versionNumber:version,manifestFileName:'appsscript'}};

function audit({dep=deployment,published=exportFile(),head=exportFile(),expectedId=deploymentId}={}){
 const dir=mkdtempSync(join(tmpdir(),'gacha-private-evidence-mock-'));
 try{
  const paths=['dep.json','version.json','head.json'].map(x=>join(dir,x));
  for(let i=0;i<paths.length;i++)writeFileSync(paths[i],JSON.stringify([dep,published,head][i]));
  const before=paths.map(p=>readFileSync(p,'utf8'));
  const r=spawnSync(process.execPath,[tool,
    '--deployment',paths[0],'--published',paths[1],'--head',paths[2],
    '--deployment-id',expectedId],{encoding:'utf8',timeout:6000});
  assert.deepEqual(paths.map(p=>readFileSync(p,'utf8')),before,'read-only never mutates source JSON');
  return {status:r.status,stdout:r.stdout,stderr:r.stderr,report:r.status===0?JSON.parse(r.stdout):null};
 }finally{rmSync(dir,{recursive:true,force:true})}
}

test('accepted synthetic published version records exact immutable version witness, not approval',()=>{
 const a=audit();
 assert.equal(a.status,0,a.stderr);
 assert.equal(a.report.versionNumber,34);
 assert.equal(a.report.verdict,'PUBLISHED_GAS_STATIC_WITNESS_PASS_REVIEW_ONLY');
 assert.equal(a.report.approvedToDeploy,false);
 assert.equal(a.report.publishedFileCount,2);
 assert.equal(a.report.criticalFunctionsFound,required.length);
 assert.ok(!a.stdout.includes(baseSource),'source is not printed');
 assert.ok(!a.stdout.includes(deploymentId),'deployment ID is not printed');
});
test('HEAD can differ from deployed version; report must disclose changed source file',()=>{
 const a=audit({head:exportFile(baseSource+'\nfunction newlyEditedInHEAD(){}')});
 assert.equal(a.status,0,a.stderr);
 assert.deepEqual(a.report.differentFromCurrentHead,['Code']);
});
test('wrong or stale deployment ID is rejected',()=>{
 const a=audit({expectedId:'some-other-webapp'});
 assert.notEqual(a.status,0);
 assert.match(a.stderr,/deployment ID/);
});
test('different script ID in source is rejected',()=>{
 const bad=exportFile();bad.scriptId='wrong-script';
 const a=audit({published:bad});
 assert.notEqual(a.status,0);
 assert.match(a.stderr,/script ID/);
});
test('missing a deployed dedup function stops the release witness',()=>{
 const bad=exportFile(baseSource.replace('function wonDuplicateKeys_','function missingDedup'));
 const a=audit({published:bad});
 assert.notEqual(a.status,0);
 assert.match(a.stderr,/wonDuplicateKeys_/);
});
test('missing ScriptLock marker or four-Web-draw condition is blocked',()=>{
 for(const absent of ['LockService.getScriptLock()',"history.length<festAvailableFrom-1"]){
  const a=audit({published:exportFile(baseSource.replace(absent,'NOT_IMPLEMENTED'))});
  assert.notEqual(a.status,0);
  assert.match(a.stderr,/safety guards/);
 }
});
test('duplicate deployed function declarations are blocked',()=>{
 const a=audit({published:exportFile(baseSource+'\nfunction wonDuplicateKeys_(){}')});
 assert.notEqual(a.status,0);
 assert.match(a.stderr,/duplicated/);
});
test('missing manifest is blocked; unknown/partial API export cannot certify release',()=>{
 const bad=exportFile();bad.files=[bad.files[0]];
 const a=audit({published:bad});
 assert.notEqual(a.status,0);
 assert.match(a.stderr,/appsscript.json/);
});
