import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessMuseumPreviewEnvScopeStage as check} from '../museum-vercel-preview-env-scope-stage.mjs';

const TARGET='feature/mio-v2-integration-mainbaseline-20261102';
const KEY='GALLERY_DATABASE_URL';
const sha='a'.repeat(40);
const candidate=()=>({
 variables:[
  {id:'branch-override',key:KEY,target:['preview'],gitBranch:TARGET,type:'encrypted'},
  {id:'production-only',key:KEY,target:['production'],type:'encrypted'}
 ],
 deployment:{projectId:'prj_MuseumDemo',target:'preview',gitBranch:TARGET,gitSha:sha},
 expected:{vercelProjectId:'prj_MuseumDemo',candidateSha:sha}
});
test('an exactly scoped metadata candidate is not permission to connect or deploy',()=>{
 const x=candidate();
 const result=check(x);
 assert.equal(result.metadataConsistent,true);
 assert.deepEqual(result.failed,[]);
 assert.equal(result.bindingVerified,false);
 assert.equal(result.canWrite,false);
 assert.equal(result.canDeploy,false);
 assert.equal(result.didFetchSecrets,false);
 assert.equal(result.didConnectDatabase,false);
 assert.equal(result.didModifyEnvironment,false);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(JSON.stringify(result).includes('branch-override'),false);
});
test('current Vercel pattern: unscoped Preview with another branch override fails closed',()=>{
 const x=candidate();
 x.variables=[
  {id:'prod',key:KEY,target:['production'],type:'encrypted'},
  {id:'broad',key:KEY,target:['preview'],type:'encrypted'},
  {id:'unrelated',key:KEY,target:['preview'],gitBranch:'fix/announcements-passkey-auth-review',type:'encrypted'}
 ];
 const result=check(x);
 assert.equal(result.checks.one_branch_override,false);
 assert.equal(result.checks.no_inherited_preview,false);
 assert.equal(result.metadataConsistent,false);
 assert.deepEqual(result.failed.filter(k=>k==='one_branch_override'||k==='no_inherited_preview'),
  ['one_branch_override','no_inherited_preview']);
});
test('unscoped Preview always blocks readiness, even when a correct override exists',()=>{
 const x=candidate();
 x.variables.push({id:'fallback',key:KEY,target:['preview'],type:'encrypted'});
 assert.equal(check(x).checks.one_branch_override,true);
 assert.equal(check(x).checks.no_inherited_preview,false);
 assert.equal(check(x).metadataConsistent,false);
});
test('ambiguous, cross-target, or unencrypted Preview values cannot pass',()=>{
 for(const modify of [
  x=>{x.variables.push({...x.variables[0],id:'duplicate'})},
  x=>{x.variables[0].target=['preview','production']},
  x=>{x.variables[0].type='plain'},
  x=>{x.variables[0].gitBranch='main'},
  x=>{x.variables[0].gitBranch=undefined},
  x=>{x.variables[0].id=''},
  x=>{x.variables=[]},
  x=>{x.variables='not an inventory'}
 ]){
  const x=candidate();modify(x);
  assert.equal(check(x).metadataConsistent,false);
 }
});
test('deployment project, branch and SHA cannot be inferred from an env key',()=>{
 for(const modify of [
  x=>{x.deployment.projectId='prj_Different'},
  x=>{x.deployment.target='production'},
  x=>{x.deployment.gitBranch='main'},
  x=>{x.deployment.gitSha='b'.repeat(40)},
  x=>{x.expected.candidateSha='b'.repeat(40)}
 ]){
  const x=candidate();modify(x);
  assert.equal(check(x).metadataConsistent,false);
 }
 assert.equal(check().metadataConsistent,false);
});
test('metadata helper is inert, independent of Vercel and Neon clients',()=>{
 const source=readFileSync(new URL('../museum-vercel-preview-env-scope-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.builds.some(x=>x.src==='museum-vercel-preview-env-scope-stage.mjs'),false);
 assert.equal(config.routes.some(x=>x.dest==='/museum-vercel-preview-env-scope-stage.mjs'),false);
 assert.doesNotMatch(source,/process\.env|export default|\.query\s*\(|\.connect\s*\(|\bfetch\s*\(|INSERT INTO|DELETE FROM|\.value\b/);
});
