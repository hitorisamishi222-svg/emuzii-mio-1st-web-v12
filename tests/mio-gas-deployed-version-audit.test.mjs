import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {checkDeploymentEvidence,auditDeployedVersion,HISTORICAL_SCRIPT_ID_SHA256,OWNER_OBSERVED_DEPLOYED_VERSION} from '../tools/mio-gas-deployed-version-audit.mjs';

const scriptId='synthetic-script-ID-no-real-participant-or-project',id='synthetic-deployment-ID';
const deployment={deploymentId:id,deploymentConfig:{scriptId,versionNumber:15,manifestFileName:'appsscript'}};
const files=(body='function test(){}')=>({scriptId,files:[
 {name:'Code',type:'SERVER_JS',source:body},
 {name:'appsscript',type:'JSON',source:'{"timeZone":"Asia/Tokyo"}'}
]});
const check=options=>checkDeploymentEvidence({scriptId,deployment,published:files(),publishedVersionNumber:15,head:files(),...options},id);

test('historical project pin is fixed length, no raw production project ID is embedded',()=>{
 assert.match(HISTORICAL_SCRIPT_ID_SHA256,/^[a-f0-9]{64}$/);
 assert.equal(HISTORICAL_SCRIPT_ID_SHA256.length,64);
});
test('synthetic exact deployment version and both source snapshots are verified without publication',()=>{
 const r=check({});
 assert.equal(r.ok,true);
 assert.equal(r.status,'DEPLOYMENT_AND_SOURCE_READ_ONLY_VERIFIED');
 assert.equal(r.deployedVersion,15);
 assert.equal(r.headMatchesPublished,true);
 assert.equal(r.publicationAllowed,false);
 assert.equal(r.publishedFileCount,2);
});
test('metadata-only cannot claim HEAD, source, or published content verification',()=>{
 const empty=checkDeploymentEvidence({scriptId},id);
 assert.equal(empty.status,'DEPLOYMENT_METADATA_PENDING');
 const m=checkDeploymentEvidence({scriptId,deployment},id);
 assert.equal(m.status,'PUBLISHED_CONTENT_PENDING');
 assert.equal(m.publicationAllowed,false);
 assert.equal(m.sourceVerified,undefined);
});
test('published version must explicitly match the deployed version, not the editor HEAD',()=>{
 assert.equal(check({publishedVersionNumber:14}).reason,'PUBLISHED_VERSION_REQUEST_MISMATCH');
 assert.equal(check({deployment:{deploymentId:id,deploymentConfig:{scriptId,versionNumber:16}}}).reason,'PUBLISHED_VERSION_REQUEST_MISMATCH');
});
test('project ID and deployed ID cannot be mixed or substituted',()=>{
 assert.equal(checkDeploymentEvidence({scriptId,deployment},'different-id').reason,'PROJECT_DEPLOYMENT_OR_VERSION_MISMATCH');
 assert.equal(check({deployment:{deploymentId:id,deploymentConfig:{scriptId:'wrong-script',versionNumber:15}}}).reason,'PROJECT_DEPLOYMENT_OR_VERSION_MISMATCH');
 assert.equal(check({deployment:{deploymentId:id,deploymentConfig:{scriptId,versionNumber:0}}}).reason,'PROJECT_DEPLOYMENT_OR_VERSION_MISMATCH');
 assert.equal(check({deployment:{deploymentId:id,deploymentConfig:{scriptId,versionNumber:'15'}}}).reason,'PROJECT_DEPLOYMENT_OR_VERSION_MISMATCH');
});
test('HEAD may differ from immutable published version, but a difference never authorizes publishing',()=>{
 const x=check({head:files('function test(){return 1;}')});
 assert.equal(x.ok,true);
 assert.equal(x.headMatchesPublished,false);
 assert.equal(x.publicationAllowed,false);
});
test('rejects duplicate, missing, invalid or foreign-project code files',()=>{
 assert.equal(check({published:{scriptId,files:[{name:'Code',type:'SERVER_JS',source:'x'}]}}).reason,'PUBLISHED_CONTENT_INVALID');
 assert.equal(check({published:{scriptId,files:[{name:'Code',type:'SERVER_JS',source:'x'},{name:'Code',type:'SERVER_JS',source:'y'},{name:'appsscript',type:'JSON',source:'{}'}]}}).reason,'PUBLISHED_CONTENT_INVALID');
 assert.equal(check({head:{scriptId:'other',files:files().files}}).reason,'HEAD_CONTENT_INVALID');
 assert.equal(check({published:{scriptId,files:[{name:'Code',type:'SERVER_JS',source:'x'},{name:'appsscript',type:'JSON',source:null}]}}).reason,'PUBLISHED_CONTENT_INVALID');
});
test('diagnostics never echo raw source, project ID, deployment ID, or credentials',()=>{
 const value='secret-token-not-to-be-shown';
 const response=check({head:files('function test(){return "'+value+'";}')});
 const out=JSON.stringify(response);
 for(const sensitive of [scriptId,id,value])assert.equal(out.includes(sensitive),false);
 assert.match(out,/"publicationAllowed":false/);
});
test('real pinned wrapper fails closed for a synthetic project and invented deployment',()=>{
 const bad=auditDeployedVersion({appsScriptUrl:'https://script.google.com/macros/s/synthetic-deployment-ID/exec',scriptId,deployment,published:files(),publishedVersionNumber:15});
 assert.equal(bad.status,'STOP');
 assert.equal(bad.publicationAllowed,false);
});
test('CLI with malformed evidence exits nonzero without leaking input',()=>{
 const credential='some-secret-should-not-print';
 const res=spawnSync(process.execPath,['tools/mio-gas-deployed-version-audit.mjs'],{
  cwd:new URL('..',import.meta.url),input:credential,encoding:'utf8'
 });
 assert.equal(res.status,1);
 assert.equal(res.stdout.includes(credential),false);
 assert.match(res.stdout,/"status":"STOP"/);
});


test("owner's confirmed v16 blocks self-consistent wrong deployed versions",()=>{
 assert.equal(OWNER_OBSERVED_DEPLOYED_VERSION,16);
 const wrong=check({ownerObservedVersionNumber:OWNER_OBSERVED_DEPLOYED_VERSION});
 assert.equal(wrong.status,'STOP');
 assert.equal(wrong.reason,'OWNER_OBSERVED_VERSION_MISMATCH');
 assert.equal(wrong.publicationAllowed,false);
 const rightDeployment={deploymentId:id,deploymentConfig:{
  scriptId,versionNumber:OWNER_OBSERVED_DEPLOYED_VERSION,manifestFileName:'appsscript'
 }};
 const right=checkDeploymentEvidence({scriptId,deployment:rightDeployment,
  published:files(),publishedVersionNumber:OWNER_OBSERVED_DEPLOYED_VERSION,
  ownerObservedVersionNumber:OWNER_OBSERVED_DEPLOYED_VERSION},id);
 assert.equal(right.ok,true);
 assert.equal(right.deployedVersion,16);
 assert.equal(right.publicationAllowed,false);
});

test('owner-observed version must be numeric and belongs to the identical deployment',()=>{
 for(const wrong of [null,'16',0,17,NaN]){
  const r=check({ownerObservedVersionNumber:wrong});
  assert.equal(r.reason,'OWNER_OBSERVED_VERSION_MISMATCH');
  assert.equal(r.publicationAllowed,false);
 }
 // Even a matching version from a DIFFERENT deployment cannot pass.
 const wrongId=checkDeploymentEvidence({scriptId,deployment,published:files(),
  publishedVersionNumber:15,ownerObservedVersionNumber:15},'another-deployment');
 assert.equal(wrongId.reason,'PROJECT_DEPLOYMENT_OR_VERSION_MISMATCH');
});
