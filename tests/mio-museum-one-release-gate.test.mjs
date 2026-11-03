import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateMioMuseumReleaseGate} from '../museum-one-release-gate.mjs';

const head='1'.repeat(40),prod='2'.repeat(40);
const digest=name=>[...name].reduce((v,ch)=>v+ch.charCodeAt(0),0).toString(16).padStart(64,'0');
const fingerprints=()=>Object.fromEntries(['participants','attendance','gacha','prizes','history']
 .map(name=>[name,{count:name.length*10,sha256:digest(name)}]));
const all=()=>{
 const keys=evaluateMioMuseumReleaseGate().checks.map(x=>x.key);
 return {
  candidateSha:head,productionSha:prod,
  galleryAuditReport:{auditCountsConsistent:true,checkedWorks:2,mismatchCount:0},
  checks:Object.fromEntries(keys.map(k=>[k,true]).concat([['ciCandidateSha',head]])),
  protectedBaseline:fingerprints(),
  rehearsalSnapshot:fingerprints()
 };
};
test('empty evidence never authorizes any production release',()=>{
 const result=evaluateMioMuseumReleaseGate();
 assert.equal(result.readiness,'staging_only');
 assert.equal(result.readyForOwnerReview,false);
 assert.equal(result.canDeploy,false);
 assert.equal(result.didModifyProduction,false);
 assert.equal(result.blockers.length,26);
 assert.equal(result.preservedFingerprints.every(x=>x.matched===false),true);
});
test('even complete claimed evidence is only a staging review report, not a deploy token',()=>{
 const result=evaluateMioMuseumReleaseGate(all());
 assert.equal(result.readyForOwnerReview,true);
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.canDeploy,false);
 assert.equal(result.didModifyProduction,false);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.checks));
});
test('gallery audit mismatch or absence blocks release readiness independently of a green CI',()=>{
 for(const galleryAuditReport of [
  null,undefined,{}, {auditCountsConsistent:false,checkedWorks:2,mismatchCount:1},
  {auditCountsConsistent:true,checkedWorks:2,mismatchCount:1},
  {auditCountsConsistent:true,checkedWorks:0,mismatchCount:0}
 ]){
  const input=all();input.galleryAuditReport=galleryAuditReport;
  const report=evaluateMioMuseumReleaseGate(input);
  assert.ok(report.blockers.includes('legacy_gallery_audit_consistent'));
  assert.equal(report.readyForOwnerReview,false);
  assert.equal(report.canDeploy,false);
 }
});
test('production SHA must be a distinct verified SHA, not a branch or fabricated string',()=>{
 const input=all();input.productionSha='main';
 const result=evaluateMioMuseumReleaseGate(input);
 assert.equal(result.readyForOwnerReview,false);
 assert.ok(result.blockers.includes('production_sha_known'));
 assert.ok(result.blockers.includes('draft_branch_isolated'));
 const same=all();same.productionSha=same.candidateSha;
 assert.ok(evaluateMioMuseumReleaseGate(same).blockers.includes('draft_branch_isolated'));
});
test('CI success from another commit is rejected',()=>{
 const input=all();input.checks.ciCandidateSha=prod;
 const report=evaluateMioMuseumReleaseGate(input);
 assert.ok(report.blockers.includes('all_ci_pass'));
});
test('each historical data family is required independently',()=>{
 for(const name of ['participants','attendance','gacha','prizes','history']){
  const input=all();input.rehearsalSnapshot[name].count++;
  const result=evaluateMioMuseumReleaseGate(input);
  assert.equal(result.readyForOwnerReview,false);
  assert.ok(result.blockers.includes('legacy_'+name+'_preserved'));
  assert.equal(result.preservedFingerprints.find(x=>x.name===name).matched,false);
 }
});
test('counts alone cannot conceal edited or deleted old attendance/gacha entries',()=>{
 for(const name of ['attendance','gacha','prizes','history']){
  const input=all();input.rehearsalSnapshot[name].sha256='f'.repeat(64);
  const result=evaluateMioMuseumReleaseGate(input);
  assert.ok(result.blockers.includes('legacy_'+name+'_preserved'));
 }
});
test('missing fingerprint, invalid hash, or negative count fails closed',()=>{
 for(const damaged of [null,{count:1,sha256:'bad'},
  {count:-1,sha256:'f'.repeat(64)},{count:1.5,sha256:'f'.repeat(64)}]){
  const input=all();input.rehearsalSnapshot.attendance=damaged;
  assert.ok(evaluateMioMuseumReleaseGate(input).blockers.includes('legacy_attendance_preserved'));
 }
});
test('owner approval, backup restore, DB identity and Preview protection are separate mandatory gates',()=>{
 for(const key of ['correct_db_identity','real_schema_verified','backup_restored',
  'current_gas_backed_up','preview_protected','owner_signoff',
  'rollback_rehearsed','single_release_route_reviewed','attendance_page_hidden','chat_deferred']){
  const input=all();input.checks[key]=false;
  const report=evaluateMioMuseumReleaseGate(input);
  assert.equal(report.readyForOwnerReview,false,key);
  assert.ok(report.blockers.includes(key),key);
 }
});
test('truthy strings and loose status reports are never treated as verified evidence',()=>{
 const input=all();input.checks.owner_signoff='true';
 const report=evaluateMioMuseumReleaseGate(input);
 assert.ok(report.blockers.includes('owner_signoff'));
 input.checks.owner_signoff=1;
 assert.ok(evaluateMioMuseumReleaseGate(input).blockers.includes('owner_signoff'));
});
test('snapshot comparisons are pure and cannot mutate originals or expose raw records',()=>{
 const input=all(),before=structuredClone(input);
 const report=evaluateMioMuseumReleaseGate(input);
 assert.deepEqual(input,before);
 assert.equal(Object.isFrozen(report.preservedFingerprints),true);
 assert.equal(JSON.stringify(report).includes('mio-id'),false);
});
test('release gate cannot be promoted to API, Vercel build, or permanent production switch',()=>{
 const module=readFileSync(new URL('../museum-one-release-gate.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(module,/export default|process\.env|fetch\s*\(|INSERT INTO|UPDATE\s|DELETE FROM|DROP TABLE|GALLERY_DATABASE_URL/);
 assert.match(module,/canDeploy:false/);
 assert.equal(config.builds.some(x=>x.src==='museum-one-release-gate.mjs'),false);
 assert.equal(config.routes.some(x=>x.dest==='/museum-one-release-gate.mjs'),false);
});
