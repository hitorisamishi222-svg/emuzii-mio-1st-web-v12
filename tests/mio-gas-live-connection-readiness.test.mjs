import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkDeploymentEvidence} from '../tools/mio-gas-deployed-version-audit.mjs';
import {assessVerifiedPublishedSource,offlineLiveConnectionReadiness}
  from '../tools/mio-gas-live-connection-readiness.mjs';

const code=readFileSync(new URL('../GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs',import.meta.url),'utf8');
const scriptId='synthetic-script-not-a-real-apps-script-id';
const deploymentId='synthetic-deployment';
const payload=source=>({scriptId,files:[
 {type:'SERVER_JS',name:'Code',source},
 {type:'JSON',name:'appsscript',source:'{"timeZone":"Asia/Tokyo"}'}
]});
const metadata={deploymentId,deploymentConfig:{scriptId,versionNumber:18}};
const evidence=(published,head=null)=>checkDeploymentEvidence({
 scriptId,deployment:metadata,published,publishedVersionNumber:18,head
},deploymentId);
const dispatch="    if(/^webAdminOps(?:Read|Member|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));";

test('no live Script API evidence must fail closed',()=>{
 const status=offlineLiveConnectionReadiness({});
 assert.equal(status.status,'BLOCKED');
 assert.equal(status.reason,'DEPLOYED_GAS_VERSION_OR_SOURCE_UNVERIFIED');
 assert.equal(status.writeAllowed,false);
 assert.equal(status.publicationAllowed,false);
 assert.equal(status.liveReadConfirmed,false);
});

test('synthetic published routing passes only static checks, never authorizes production',()=>{
 const published=payload(code);
 const report=assessVerifiedPublishedSource(evidence(published),published);
 assert.equal(report.status,'PUBLISHED_SOURCE_STATICALLY_COMPATIBLE');
 assert.equal(report.deployedVersion,18);
 assert.equal(report.liveReadConfirmed,false);
 assert.equal(report.writeAllowed,false);
 assert.equal(report.patchAllowed,false);
 assert.equal(report.publicationAllowed,false);
 assert.equal(report.nextStep,'read_only_admin_login_and_webAdminOpsRead');
});

test('published v18 without dispatch blocks even when editor HEAD includes it',()=>{
 assert.ok(code.includes(dispatch));
 const published=payload(code.replace(dispatch,''));
 const head=payload(code);
 const publishedEvidence=evidence(published,head);
 assert.equal(publishedEvidence.ok,true);
 assert.equal(publishedEvidence.headMatchesPublished,false);
 const report=assessVerifiedPublishedSource(publishedEvidence,published);
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.diagnosis,'DISPATCHER_NOT_DETECTED_REQUIRES_MANUAL_REVIEW');
 assert.equal(report.writeAllowed,false);
});

test('published source with missing shared helper blocks administration',()=>{
 const published=payload(code.replace('function json_(', 'function renamedShared_('));
 const report=assessVerifiedPublishedSource(evidence(published),published);
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.diagnosis,'SHARED_HELPERS_MISSING_NO_AUTOPATCH');
 assert.deepEqual(report.missingSharedFunctions,['json_']);
});

test('published source with duplicated admin handler blocks administration',()=>{
 const published=payload(code+'\nfunction mioAdminOps_(){}');
 const report=assessVerifiedPublishedSource(evidence(published),published);
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.diagnosis,'DUPLICATE_CRITICAL_FUNCTIONS');
});

test('editor differs from deployed public source: warn but never upgrade automatically',()=>{
 const published=payload(code);
 const head=payload(code+'\n// a local unpublished editor note');
 const report=assessVerifiedPublishedSource(evidence(published,head),published);
 assert.equal(report.editorDiffersFromPublished,true);
 assert.equal(report.sourceRequiresManualReview,true);
 assert.equal(report.publicationAllowed,false);
});

test('unverified source or misleading evidence cannot pass',()=>{
 const published=payload(code);
 for(const bad of [
  null,
  {ok:true,sourceVerified:true},
  {ok:true,deployedVersion:18,sourceVerified:true,deploymentVerified:false,projectVerified:true}
 ]){
  const report=assessVerifiedPublishedSource(bad,published);
  assert.equal(report.status,'BLOCKED');
 }
 assert.equal(assessVerifiedPublishedSource(evidence(published),null).reason,'PUBLISHED_SOURCE_MISSING');
 assert.equal(checkDeploymentEvidence({
   scriptId,deployment:metadata,published:payload(code),publishedVersionNumber:17
 },deploymentId).ok,false);
});

test('never output real GAS source or credentials',()=>{
 const fake='SYNTHETIC-SECRET-MUST-NOT-BE-PRINTED-123';
 const published=payload(code+'\n// '+fake);
 const report=assessVerifiedPublishedSource(evidence(published),published);
 assert.equal(JSON.stringify(report).includes(fake),false);
 assert.equal(JSON.stringify(report).includes('SpreadsheetApp'),false);
 assert.equal(report.writeAllowed,false);
});
