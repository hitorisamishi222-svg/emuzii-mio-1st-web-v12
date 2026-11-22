import {reviewFingerprint} from './review-link-core.mjs';
const fail=m=>{throw Error(m)};
export function historicalApprovalRelease(env){return env.VERCEL_ENV==='production'&&env.MIO_HISTORICAL_APPROVAL_RELEASE==='verified-historical-approval-v1'}
// An independent record of the operator's business decision; no GAS/user cookie.
export async function recordHistoricalApproval(input,{store,actor}){
 if(!/^passkey:[a-f0-9]{64}$/.test(actor||''))fail('admin-required');
 const {webId,mioId,name,operationId}=input||{};
 if(!/^MIO-W-[a-f0-9]{24}$/.test(webId||'')||!/^MIO-\d{4}$/.test(mioId||'')||! /^[a-f0-9]{32}$/.test(operationId||'')||
 typeof name!=='string'||!name.trim()||name.length>40||/[\x00-\x1f]/.test(name)||input.onSiteVerified!==true||input.memberConfirmed!==true)fail('invalid-request');
 const r=await store.readReview(webId);
 if(!r||r.browser_id!==webId||r.name!==name||r.normal_exists||r.reason!=='同名登録あり・本人確認待ち'||! /^[a-f0-9]{64}$/.test(r.token_hash||''))fail('review-conflict');
 const saved=await store.recordHistorical({webId,mioId,name,operationId,actor,fingerprint:reviewFingerprint(r)});
 return {ok:true,state:'historical-approved',webId:saved.webId,mioId:saved.mioId,deviceLinked:false};
}
