import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {processOwnerOperation} from '../api-mio-level-admin.js';
import {verifiedRosterTarget,verifiedMembershipEvidence,
 ownerOperationInput,restrictedRosterView} from '../mio-level-admin-gate-vnext.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>readFileSync(join(root,f),'utf8');
const owner={source:'server-session',role:'owner',userId:'mio-owner'};
const pepper='test-admin-recovery-pepper-value-with-at-least-48-characters-long-123';
const roster=[{mioId:'MIO-0017',name:'ユーリ',gacha:{remaining:2,checked:true}},
 {mioId:'MIO-0018',name:'まーくん',needsReview:true},
 {mioId:'MIO-0019',name:'別の人'}];
const live={ok:true,roster,approvedBrowsers:[{webId:'MIO-W-'+'a'.repeat(24),
 name:'ユーリ',mioId:'MIO-0017',verified:true,member:'確認済み'}]};
const d={action:'issue',masterId:'MIO-0017',displayName:'ユーリ',level:2,
 operatorConfirmed:true,operationId:'12345678-1234-4123-8123-123456789011'};
const db={query:async()=>({rows:[]})};
const server=async(action,payload)=>{assert.equal(action,'webAdminOpsRead');assert.deepEqual(payload,{});return live};
const now=new Date('2026-11-25T00:00:00Z');

test('owner can select exact roster-backed person and preserve canonical ID',async()=>{
 let issued=0;
 const issue=async args=>{
  issued++;assert.deepEqual(args.rosterProof,{source:'gas-verified',unique:true,
   masterId:'MIO-0017',displayName:'ユーリ'});
  assert.equal(args.actor,owner);assert.equal(args.issuerId,'mio');
  assert.equal(args.level,2);assert.equal(args.memberUntil,null);
  return {masterId:args.masterId,displayName:args.displayName,level:2,
   code:'MIO-ACCESS-'+'a'.repeat(40),expiresAt:'2026-11-27T00:00:00Z',
   replacedCount:1,generation:3};
 };
 const r=await processOwnerOperation({d,db,callGAS:server,actor:owner,pepper,now,issue});
 assert.equal(issued,1);assert.equal(r.replacedCount,1);
 assert.equal(r.recoveryId,'MIO-ACCESS-'+'a'.repeat(40));
 assert.equal(r.masterId,'MIO-0017');
});
test('owner can read a roster but review-marked people are not selectable',async()=>{
 const data=await processOwnerOperation({d:{action:'read'},db,actor:owner,pepper,callGAS:server,now});
 assert.equal(data.ok,true);
 assert.equal(data.roster.length,2);
 assert.ok(data.roster.every(x=>!Object.hasOwn(x,'gacha')));
 assert.deepEqual(data.roster[0],{mioId:'MIO-0017',name:'ユーリ'});
});
test('single named target is required: duplicate roster ID or false display name fails',async()=>{
 const req={...d,rosterProof:{source:'gas-verified',unique:true,masterId:'MIO-0017'}};
 await assert.rejects(processOwnerOperation({d:req,db,actor:owner,pepper,
  callGAS:async()=>({...live,roster:[{mioId:'MIO-0017',name:'別人'}]}),issue:async()=>assert.fail('must not issue')}),/ROSTER_IDENTITY/);
 await assert.rejects(processOwnerOperation({d:req,db,actor:owner,pepper,
  callGAS:async()=>({...live,roster:[roster[0],roster[0]]}),issue:async()=>assert.fail('must not issue')}),/ROSTER_IDENTITY/);
});
test('owner confirmation, valid level, and unique id mandatory before live roster check',async()=>{
 for(const bad of [{...d,operatorConfirmed:false},{...d,level:4},
  {...d,operationId:'not-valid'}, {...d,masterId:'MIO-W-fake'}]){
  await assert.rejects(processOwnerOperation({d:bad,db,actor:owner,pepper,
   callGAS:async()=>assert.fail('must not call GAS'),
   issue:async()=>assert.fail('must not issue')}));
 }
});
test('Lv3 only for verified, currently confirmed member with future expiry',async()=>{
 const data={...d,level:3,memberConfirmed:true,memberUntil:'2026-12-31T23:59:59+09:00'};
 const out=await processOwnerOperation({d:data,db,callGAS:server,actor:owner,pepper,now,
  issue:async args=>{
   assert.equal(args.memberEvidence.source,'server-owner-verified');
   assert.equal(args.memberUntil,'2026-12-31T14:59:59.000Z');
   return {masterId:args.masterId,displayName:args.displayName,level:3,
    code:'MIO-ACCESS-'+'f'.repeat(40),expiresAt:'2026-11-27T00:00:00Z',
    replacedCount:0,generation:1};
  }});
 assert.equal(out.level,3);
 for(const broken of [
  {...data,memberConfirmed:false},
  {...data,memberUntil:'2026-10-20T00:00:00Z'}
 ]){
  await assert.rejects(processOwnerOperation({d:broken,db,callGAS:server,actor:owner,pepper,now,
   issue:async()=>assert.fail('must not issue')}),/MEMBERSHIP/);
 }
 await assert.rejects(processOwnerOperation({d:data,db,actor:owner,pepper,now,
  callGAS:async()=>({...live,approvedBrowsers:[]}),
  issue:async()=>assert.fail('must not issue')}),/MEMBERSHIP_RECORD_UNVERIFIED/);
});
test('normal reader cannot become owner by adding claimed server proof or level',()=>{
 assert.deepEqual(ownerOperationInput(d),{masterId:'MIO-0017',
  displayName:'ユーリ',level:2,operationId:d.operationId});
 assert.throws(()=>verifiedRosterTarget([],d.masterId,d.displayName),/ROSTER_IDENTITY/);
 assert.equal(restrictedRosterView([{mioId:'MIO-0017',name:'ユーリ',secret:'hidden'}])[0].secret,undefined);
 assert.deepEqual(verifiedMembershipEvidence({level:2,masterId:d.masterId}),{memberEvidence:null,memberUntil:null});
});
test('existing Web management page hosts accessible recovery controls and safe route',()=>{
 const html=read('gacha-web-gate.html'),script=read('mio-level-admin-panel.js');
 const routes=JSON.parse(read('vercel.json'));
 for(const id of ['mioRecoveryMasterId','mioRecoveryName','mioRecoveryLevel',
  'mioRecoveryConfirmed','mioRecoveryAdminCode','mioRecoveryRead',
  'mioRecoveryIssue','mioRecoveryCopy','mioRecoveryStatus'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.ok(html.includes('<script src="/mio-level-admin-panel.js" defer>'));
 assert.ok(script.includes("window.addEventListener('mio:admin-person-selected'"));
 assert.match(script,/confirm\(/);
 assert.match(script,/\/api\/mio-level-admin/);
 assert.match(script,/cleanResult\(\)/);
 assert.ok(routes.routes.find(x=>x.src==='/api/mio-level-admin'));
 assert.ok(routes.builds.find(x=>x.src==='api-mio-level-admin.js'));
 const api=read('api-mio-level-admin.js');
 assert.match(api,/MIO_LEVEL_ADMIN_RELEASE===RELEASE&&process\.env\.VERCEL_ENV==='production'/);
 assert.match(api,/if\(!productionRelease&&!previewSynthetic\)/);
 assert.match(api,/sessionOK\(req\)/);
 assert.match(api,/authorizedCode\(d.adminCode/);
 assert.doesNotMatch(api,/function.*grantGacha/i);
});
