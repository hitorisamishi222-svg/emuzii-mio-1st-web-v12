import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {setLightSessionCookie} from '../registration-light-session.js';
import {stageReviewLink,finalizeReviewLink,releaseOK} from '../review-link-core.mjs';
const webId='MIO-W-'+'a'.repeat(24),mioId='MIO-9999',name='TEST-ONLY';
const token='b'.repeat(64),secret='synthetic-secret-'.repeat(4),actor='passkey:'+'c'.repeat(64),operationId='d'.repeat(32);
const hash=t=>createHash('sha256').update(t).digest('hex');
const cookie=setLightSessionCookie(webId,token,secret),now=Date.now();
const input={webId,mioId,name,operationId,onSiteVerified:true,memberConfirmed:true};
const testEnv={VERCEL_ENV:'production',MIO_REVIEW_LINK_RELEASE:'verified-review-link-v1',MIO_AUTO_RECOVER_VERIFIED_TWO:'enabled',MIO_GACHA_ADMIN_OPS_RELEASE:'verified-existing-gas-ops-20261030'};
function fixture(){
 const s={review:{browser_id:webId,name,name_key:name,token_hash:hash(token),reason:'同名登録あり・本人確認待ち',normal_exists:false},approval:null,pendingRows:[],
  roster:[{mioId,name,gacha:{checked:true,total:2,remaining:2}}],approved:[],pending:false,calls:[],history:[],schemaReady:true,auditReady:true,releaseReady:true,audit:[],failReadback:false};
 const store={readReview:async id=>id===webId?s.review:null,getApproval:async id=>id===webId?s.approval:null,
  stage:async a=>{if(s.approval){if(a.operationId!==s.approval.operationId)throw Error('approval-conflict');return s.approval;}return s.approval={...a,state:'staged'};},
  complete:async a=>{assert.equal(a.operationId,s.approval.operationId);s.approval.state='complete';return s.approval;}};
 const callGAS=async(action,d)=>{s.calls.push(action);
  if(action.startsWith('mioReviewLink')){assert.equal(d.webId,webId);assert.equal(d.mioId,mioId);assert.equal(d.name,name)}
  if(action==='mioReviewLinkRead')return {ok:true,schemaReady:s.schemaReady,auditReady:s.auditReady,releaseReady:s.releaseReady,roster:s.roster,approvedBrowsers:s.approved,pending:s.pendingRows};
  if(action==='mioReviewLinkPrepare'){assert.equal(d.tokenHash,hash(token));assert.equal(d.operationId,operationId);s.pending=true;return {ok:true,verified:true,participantId:webId,status:'承認待ち',integratedParticipantId:mioId};}
  if(action==='mioReviewLinkApprove'){assert.equal(d.tokenHash,hash(token));assert.equal(d.operationId,operationId);assert.equal(d.memberConfirmed,true);
   if(s.audit.includes(d.operationId))return {ok:true,replayed:true};assert.ok(s.pending);s.audit.push(d.operationId);s.approved.push({webId,mioId,name,verified:true,member:'確認済み'});return {ok:true,mioId,status:'承認済み'};}
  if(action==='status'){assert.equal(d.tokenHash,hash(token));if(s.failReadback)throw Error('network');return {ok:true,participantId:webId,name,status:'承認済み',progress:{attendanceConfirmedDays:[],attendanceLockedDays:[],gacha:{confirmed:true,total:2,remaining:2}}};}
  throw Error('unexpected action');};
 const stage=(x=input,a=actor)=>stageReviewLink(x,{store,callGAS,actor:a,now});
 const finish=(c=cookie,t=now)=>finalizeReviewLink({cookie:c,lightSecret:secret,store,callGAS,now:t});
 return {s,stage,finish};
}
test('production + existing write release + additive release all required',()=>{assert.equal(releaseOK(testEnv),true);for(const k of Object.keys(testEnv))assert.equal(releaseOK({...testEnv,[k]:''}),false)});
test('admin stage is read-only in GAS and preserves original request',async()=>{const {s,stage}=fixture();const before=structuredClone(s.review);assert.equal((await stage()).state,'staged');assert.deepEqual(s.calls,['mioReviewLinkRead']);assert.deepEqual(s.review,before)});
test('admin authentication required',async()=>{const {s,stage}=fixture();await assert.rejects(stage(input,'claimed-admin'),/admin-required/);assert.equal(s.calls.length,0)});
test('explicit confirmation required',async()=>{await assert.rejects(fixture().stage({...input,onSiteVerified:false}),/invalid-request/)});
test('missing member confirmation rejected',async()=>{await assert.rejects(fixture().stage({...input,memberConfirmed:false}),/invalid-request/)});
test('exact review name required',async()=>{await assert.rejects(fixture().stage({...input,name:'wrong'}),/review-conflict/)});
test('normal record conflict rejected',async()=>{const f=fixture();f.s.review.normal_exists=true;await assert.rejects(f.stage(),/review-conflict/)});
test('existing GAS release/schema lock preserved',async()=>{const f=fixture();f.s.schemaReady=false;await assert.rejects(f.stage(),/gas-schema-locked/);assert.equal(f.s.approval,null)});
test('audit schema must be ready',async()=>{const f=fixture();f.s.auditReady=false;await assert.rejects(f.stage(),/gas-schema-locked/)});
test('GAS-specific release also mandatory',async()=>{const f=fixture();f.s.releaseReady=false;await assert.rejects(f.stage(),/gas-schema-locked/)});
test('duplicate roster name rejected',async()=>{const f=fixture();f.s.roster.push({mioId:'MIO-9998',name});await assert.rejects(f.stage(),/roster-conflict/)});
test('different approved browser protected',async()=>{const f=fixture();f.s.approved.push({webId:'MIO-W-'+'e'.repeat(24),mioId,name,verified:true,member:'確認済み'});await assert.rejects(f.stage(),/existing-browser-conflict/)});
test('different pending browser protected',async()=>{const f=fixture();f.s.pendingRows.push({webId:'MIO-W-'+'e'.repeat(24),mioId,name,status:'承認待ち'});await assert.rejects(f.stage(),/pending-browser-conflict/)});
test('unverified gacha rejected',async()=>{const f=fixture();f.s.roster[0].gacha.checked=false;await assert.rejects(f.stage(),/gacha-integrity/)});
test('no cookie, no write',async()=>{const f=fixture();await f.stage();assert.equal((await f.finish('')).status,'no-light-cookie');assert.deepEqual(f.s.calls,['mioReviewLinkRead'])});
test('tampered cookie, no write',async()=>{const f=fixture();await f.stage();const bad=cookie.replace(/^[^=]+=[^.]+\./,'mio_light_session=bad.');assert.equal((await f.finish(bad)).status,'no-light-cookie');assert.deepEqual(f.s.calls,['mioReviewLinkRead'])});
test('wrong browser, no write',async()=>{const f=fixture();await f.stage();assert.equal((await f.finish(setLightSessionCookie('MIO-W-'+'f'.repeat(24),token,secret))).status,'no-approval')});
test('wrong token, no write',async()=>{const f=fixture();await f.stage();await assert.rejects(f.finish(setLightSessionCookie(webId,'f'.repeat(64),secret)),/review-proof-failed/);assert.deepEqual(f.s.calls,['mioReviewLinkRead'])});
test('expired approval stopped',async()=>{const f=fixture();await f.stage();await assert.rejects(f.finish(cookie,now+8*86400000),/expired/)});
test('review changed after approval stopped',async()=>{const f=fixture();await f.stage();f.s.review.name_key='changed';await assert.rejects(f.finish(),/review-proof-failed/)});
test('gate locked after approval, no writes',async()=>{const f=fixture();await f.stage();f.s.auditReady=false;await assert.rejects(f.finish(),/gas-schema-locked/);assert.equal(f.s.pending,false)});
test('normal visit links exact request without altering rights or history',async()=>{const f=fixture();const before=structuredClone([f.s.roster,f.s.history,f.s.review]);await f.stage();const r=await f.finish();assert.equal(r.status,'recovered');assert.equal(r.data.progress.gacha.remaining,2);assert.equal(f.s.approval.state,'complete');assert.deepEqual([f.s.roster,f.s.history,f.s.review],before);assert.equal(f.s.audit.length,1)});
test('lost network after GAS approval, same operation resumes without duplicate',async()=>{const f=fixture();await f.stage();f.s.failReadback=true;await assert.rejects(f.finish(),/network/);assert.equal(f.s.approval.state,'staged');f.s.failReadback=false;assert.equal((await f.finish()).status,'recovered');assert.equal(f.s.audit.length,1);assert.equal(f.s.approved.length,1)});
test('completed retry does not register or approve again',async()=>{const f=fixture();await f.stage();await f.finish();const n=f.s.calls.length;await f.finish();assert.deepEqual(f.s.calls.slice(n),['mioReviewLinkRead','mioReviewLinkRead','status'])});
test('lost independent GAS mapping fails closed after completion',async()=>{const f=fixture();await f.stage();await f.finish();f.s.approved=[];await assert.rejects(f.finish(),/gas-link-lost/)});
test('gas balance mismatch denies completion',async()=>{const f=fixture();await f.stage();f.s.roster[0].gacha.remaining=1;await assert.rejects(f.finish(),/gas-status-unverified/);assert.equal(f.s.approval.state,'staged')});
test('same stage is idempotent',async()=>{const f=fixture();await f.stage();const a=f.s.approval;await f.stage();assert.equal(f.s.approval,a);await assert.rejects(f.stage({...input,operationId:'1'.repeat(32)}),/approval-conflict/)});
