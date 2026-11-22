// Admin-approved linking of an existing name-review request. No production I/O in this module.
import {createHash} from 'node:crypto';
import {readLightSession} from './registration-light-session.js';

const browser=/^MIO-W-[a-f0-9]{24}$/;
const master=/^MIO-\d{4}$/;
const op=/^[a-f0-9]{32}$/;
const digest=s=>createHash('sha256').update(s).digest('hex');
const normalize=s=>String(s||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const fail=code=>{throw new Error(code)};
const count=n=>Number.isSafeInteger(n)&&n>=0;
export const reviewFingerprint=r=>digest(JSON.stringify([r.browser_id,r.name,r.name_key,r.token_hash]));

// Existing write authorization remains mandatory; the new release is additive.
export function releaseOK(env){
 return env.VERCEL_ENV==='production' && env.MIO_REVIEW_LINK_RELEASE==='verified-review-link-v1' &&
 env.MIO_AUTO_RECOVER_VERIFIED_TWO==='enabled' &&
 (env.MIO_GACHA_ADMIN_OPS_RELEASE==='verified-existing-gas-ops-20261030'||
  env.MIO_GACHA_ONSITE_RELEASE==='operator-verified-onsite-20261105');
}
// A single pre-existing, audited owner decision may be released separately
// without enabling general gacha administration. Never accept a client ID.
export function ownerReleaseOperation(env){
 return env.VERCEL_ENV==='production'&&env.MIO_REVIEW_LINK_RELEASE==='verified-review-link-v1'&&
 env.MIO_HISTORICAL_APPROVAL_RELEASE==='verified-historical-approval-v1'&&
 env.MIO_AUTO_RECOVER_VERIFIED_TWO==='enabled'&&op.test(env.MIO_OWNER_REVIEW_LINK_OPERATION||'')?
 env.MIO_OWNER_REVIEW_LINK_OPERATION:null;
}
function validateInput(x){
 if(!x||!browser.test(x.webId)||!master.test(x.mioId)||!op.test(x.operationId)||
 typeof x.name!=='string'||!x.name.trim()||x.name.length>40||/[\x00-\x1f]/.test(x.name)||
 x.onSiteVerified!==true||x.memberConfirmed!==true)fail('invalid-request');
 return {webId:x.webId,mioId:x.mioId,name:x.name,operationId:x.operationId};
}
function rosterProof(gas,a){
 if(gas?.ok!==true||gas.schemaReady!==true||gas.auditReady!==true||gas.releaseReady!==true||
 !Array.isArray(gas.roster)||!Array.isArray(gas.approvedBrowsers)||!Array.isArray(gas.pending))fail('gas-schema-locked');
 const matches=gas.roster.filter(r=>r.mioId===a.mioId);
 if(matches.length!==1||matches[0].name!==a.name||
 gas.roster.filter(r=>normalize(r.name)===normalize(a.name)).length!==1)fail('roster-conflict');
 const g=matches[0].gacha;
 if(matches[0].needsReview===true||!g||g.checked!==true||!count(g.total)||!count(g.remaining)||g.remaining>g.total)fail('gacha-integrity');
 const related=gas.approvedBrowsers.filter(r=>r.webId===a.webId||r.mioId===a.mioId||normalize(r.name)===normalize(a.name));
 if(related.length>1||related.some(r=>r.webId!==a.webId||r.mioId!==a.mioId||r.name!==a.name||r.verified!==true||r.member!=='確認済み'))fail('existing-browser-conflict');
 const pending=gas.pending.filter(r=>r.webId===a.webId||r.mioId===a.mioId||normalize(r.name)===normalize(a.name));
 if(pending.length>1||pending.some(r=>r.webId!==a.webId||r.mioId!==a.mioId||r.name!==a.name||r.status!=='承認待ち'))fail('pending-browser-conflict');
 return {g,alreadyApproved:related.length===1};
}
const target=a=>({webId:a.webId,mioId:a.mioId,name:a.name,operationId:a.operationId});
const ownerDecision=a=>/^owner-instruction:[a-f0-9]{64}$/.test(a||'');
const passkeyDecision=a=>/^passkey:[a-f0-9]{64}$/.test(a||'');
const sameDecision=(a,b)=>a&&b&&['webId','mioId','name','operationId','actor','fingerprint'].every(k=>a[k]===b[k]);
export async function stageReviewLink(input,{store,callGAS,actor,now=Date.now()}){
 const a=validateInput(input);
 if(typeof actor!=='string'||!/^passkey:[a-f0-9]{64}$/.test(actor))fail('admin-required');
 const r=await store.readReview(a.webId);
 if(!r||r.browser_id!==a.webId||r.name!==a.name||r.normal_exists||!r.token_hash||r.reason!=='同名登録あり・本人確認待ち')fail('review-conflict');
 const proof=rosterProof(await callGAS('mioReviewLinkRead',target(a)),a);
 // An already approved GAS row must not acquire a new approval operation.
 const existing=await store.getApproval(a.webId);
 if(proof.alreadyApproved&&!existing)fail('existing-browser-conflict');
 const saved=await store.stage({...a,actor,fingerprint:reviewFingerprint(r),expiresAt:new Date(now+7*86400000)});
 return {ok:true,state:saved.state,webId:a.webId,mioId:a.mioId};
}

// Invoked only from the original browser's ordinary status request. No public
// body parameters select a person, token, MIO-ID, or approval.
export async function finalizeReviewLink({cookie,lightSecret,store,callGAS,now=Date.now(),ownerOperation=null}){
 if(ownerOperation!==null&&!op.test(ownerOperation))fail('owner-release-invalid');
 const session=readLightSession(cookie,lightSecret);
 if(!session)return {status:'no-light-cookie'};
 let a=await store.getApproval(session.id);
 // A historical decision can be recorded without user contact. Convert it to
 // a time-limited device-link operation only after the ORIGINAL signed cookie
 // and all live GAS checks succeed. No new admin approval is required.
 if(!a&&typeof store.getHistorical==='function'){
  const h=await store.getHistorical(session.id);
  if(h){
   if(ownerOperation!==null&&(!ownerDecision(h.actor)||h.operationId!==ownerOperation))return {status:'no-approval'};
   const r=await store.readReview(session.id);
   if(!r||r.normal_exists||r.browser_id!==h.webId||r.name!==h.name||r.reason!=='同名登録あり・本人確認待ち'||r.token_hash!==digest(session.token)||reviewFingerprint(r)!==h.fingerprint)fail('review-proof-failed');
   if(ownerDecision(h.actor)){
    // Only a stored, separately audited owner decision can reach here. It
    // cannot be supplied to the public admin API or used to forge a cookie.
    const approved=validateInput({...h,onSiteVerified:true,memberConfirmed:true});
    const proof=rosterProof(await callGAS('mioReviewLinkRead',target(approved)),approved);
    if(proof.alreadyApproved)fail('existing-browser-conflict');
    await store.stage({...approved,actor:h.actor,fingerprint:h.fingerprint,expiresAt:new Date(now+7*86400000)});
   }else await stageReviewLink({...h,onSiteVerified:true,memberConfirmed:true},{store,callGAS,actor:h.actor,now});
   a=await store.getApproval(session.id);
  }
 }
 if(!a)return {status:'no-approval'};
 if(ownerOperation!==null&&(!ownerDecision(a.actor)||a.operationId!==ownerOperation))return {status:'no-approval'};
 if(a.webId!==session.id||!master.test(a.mioId)||!op.test(a.operationId)||
 !['staged','complete'].includes(a.state)||(!passkeyDecision(a.actor)&&!ownerDecision(a.actor)))fail('approval-conflict');
 if(ownerDecision(a.actor)&&(!store.getHistorical||!sameDecision(a,await store.getHistorical(session.id))))fail('owner-decision-missing');
 if(a.state==='staged'&&!(new Date(a.expiresAt).getTime()>now))fail('expired');
 const r=await store.readReview(session.id);
 const tokenHash=digest(session.token);
 if(!r||r.normal_exists||r.browser_id!==a.webId||r.name!==a.name||r.reason!=='同名登録あり・本人確認待ち'||
 r.token_hash!==tokenHash||reviewFingerprint(r)!==a.fingerprint)fail('review-proof-failed');
 const identity={participantId:session.id,tokenHash};
 const p=rosterProof(await callGAS('mioReviewLinkRead',target(a)),a);
 if(a.state==='complete'&&!p.alreadyApproved)fail('gas-link-lost');
 if(a.state==='staged'){
  if(!p.alreadyApproved){
   // Scope preparation to the exact existing roster ID and original browser.
   const pending=await callGAS('mioReviewLinkPrepare',{...target(a),tokenHash,operationId:a.operationId});
   if(pending?.ok!==true||pending.verified!==true||pending.participantId!==a.webId||
      pending.status!=='承認待ち'||pending.integratedParticipantId!==a.mioId)fail('gas-pending-mismatch');
  }
  // Existing authenticated-admin approval semantics, including audit and
  // duplicate guards; same operation ID on retry. No grant/draw action.
  const result=await callGAS('mioReviewLinkApprove',{...target(a),tokenHash,
   expectedStatus:'承認待ち',memberConfirmed:true,operationId:a.operationId});
  if(result?.ok!==true||(!result.replayed&&(result.mioId!==a.mioId||result.status!=='承認済み')))fail('gas-approval-unverified');
 }
 const verified=rosterProof(await callGAS('mioReviewLinkRead',target(a)),a);
 if(!verified.alreadyApproved)fail('gas-link-unverified');
 const status=await callGAS('status',identity);
 const g=status?.progress?.gacha;
 if(status?.ok!==true||status.participantId!==a.webId||status.name!==a.name||status.status!=='承認済み'||
 !Array.isArray(status.progress?.attendanceConfirmedDays)||!Array.isArray(status.progress?.attendanceLockedDays)||
 g?.confirmed!==true||g.total!==verified.g.total||g.remaining!==verified.g.remaining)fail('gas-status-unverified');
 await store.complete(a);
 // Only the caller holding this original signed request may issue the cookie.
 return {status:'recovered',data:status,session};
}
