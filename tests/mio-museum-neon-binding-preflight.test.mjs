import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMuseumNeonBindingStage as check} from '../museum-neon-binding-preflight.mjs';
const host='ep-preview.c-13.us-east-1.aws.neon.tech';
const prod='ep-prod.c-13.us-east-1.aws.neon.tech';
const valid=()=>({
 connectionString:'postgresql://sample_user@'+host+'/neondb?sslmode=require',
 provider:{projectId:'dry-demo-12345678',branchId:'br-demo-12345678',branchName:'gallery-admin-isolated',isPrimary:false,endpointHost:host,databaseName:'neondb',roleName:'sample_user'},
 deployment:{projectId:'prj_Demo1234',target:'preview',gitBranch:'feature/mio-v2-integration-mainbaseline-20261102',gitSha:'a'.repeat(40)},
 expected:{vercelProjectId:'prj_Demo1234',neonProjectId:'dry-demo-12345678',neonBranchId:'br-demo-12345678',productionBranchId:'br-production-123',productionEndpointHost:prod,candidateSha:'a'.repeat(40)}
});
test('matching preview metadata is only a comparison, never permission to deploy or write',()=>{
 const result=check(valid());
 assert.equal(result.matchesMetadata,true);
 assert.deepEqual(result.failed,[]);
 assert.equal(result.canWrite,false);
 assert.equal(result.canDeploy,false);
 assert.equal(result.canConnectToProduction,false);
 assert.equal(JSON.stringify(result).includes(host),false);
 assert.equal(Object.isFrozen(result),true);
});
test('production branches and deployments fail closed',()=>{
 for(const mutate of [
  x=>{x.provider.isPrimary=true},
  x=>{x.provider.branchName='main'},
  x=>{x.provider.endpointHost=prod;x.connectionString=x.connectionString.replace(host,prod)},
  x=>{x.deployment.target='production'},
  x=>{x.deployment.gitBranch='main'}
 ]){
  const x=valid();mutate(x);
  assert.equal(check(x).matchesMetadata,false);
 }
});
test('mismatched branch, database, role, project, commit and endpoint are rejected',()=>{
 for(const mutate of [
  x=>{x.provider.projectId='dry-other-12345678'},
  x=>{x.provider.branchId='br-other-12345678'},
  x=>{x.connectionString=x.connectionString.replace(host,prod)},
  x=>{x.connectionString=x.connectionString.replace('/neondb','/otherdb')},
  x=>{x.connectionString=x.connectionString.replace('sample_user@','other_user@')},
  x=>{x.deployment.projectId='prj_Other123'},
  x=>{x.deployment.gitSha='b'.repeat(40)}
 ]){
  const x=valid();mutate(x);
  assert.equal(check(x).matchesMetadata,false);
 }
});
test('non-TLS and spoofable Postgres URL options are rejected',()=>{
 for(const input of [
  '', 'not-a-url',
  'postgresql://sample_user@'+host+'/neondb',
  'postgresql://sample_user@'+host+'/neondb?sslmode=disable',
  'postgresql://sample_user@'+host+'/neondb?sslmode=require&host=other.example',
  'https://sample_user@'+host+'/neondb?sslmode=require'
 ]){
  const x=valid();x.connectionString=input;
  assert.equal(check(x).matchesMetadata,false);
 }
 assert.equal(check().matchesMetadata,false);
});
