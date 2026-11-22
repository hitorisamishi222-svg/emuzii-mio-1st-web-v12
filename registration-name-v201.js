// v2.0.1: concurrency-safe name reservation, separated from legacy MIO entitlements.
import pg from 'pg';
const {Pool}=pg;
import {normalizeName,validateEnrollment} from './registration-light-store.js';
import {releaseOK,reviewFingerprint} from './review-link-core.mjs';
import {reviewLinkStore} from './review-link-store.js';
let pool;
function database(){
 if(!process.env.MIO_REGISTRATION_DATABASE_URL)throw Error('db not configured');
 if(!pool)pool=new Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,ssl:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:5000});
 return pool;
}
export async function registerV201(input,{db=database()}={}){
 const x=validateEnrollment(input);
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT browser_id,token_hash,name,status FROM mio_registration_v2 WHERE browser_id=$1 FOR UPDATE',[x.browserId]);
  const review=await client.query('SELECT browser_id,token_hash,name FROM mio_name_review_v201 WHERE browser_id=$1 FOR UPDATE',[x.browserId]);
  const prior=review.rows[0]||existing.rows[0];
  if(prior){
   if(prior.token_hash!==x.tokenHash||prior.name!==x.name)throw Error('identity mismatch');
   await client.query('COMMIT');
   return {ok:true,created:false,pendingReview:!!review.rows.length,participantId:x.browserId,name:prior.name,status:review.rows.length?'本人確認待ち':prior.status};
  }
  const reserved=await client.query(`
    INSERT INTO mio_name_registry_v201(name_key,original_name,origin,browser_id)
    VALUES($1,$2,'new',$3) ON CONFLICT (name_key) DO NOTHING RETURNING browser_id
  `,[x.nameNormalized,x.name,x.browserId]);
  if(reserved.rowCount===0){
   await client.query(`
    INSERT INTO mio_name_review_v201(browser_id,token_hash,name_key,name,reason)
    VALUES($1,$2,$3,$4,'同名登録あり・本人確認待ち')
   `,[x.browserId,x.tokenHash,x.nameNormalized,x.name]);
   await client.query('COMMIT');
   return {ok:true,created:false,pendingReview:true,participantId:x.browserId,name:x.name,status:'本人確認待ち'};
  }
  await client.query(`
    INSERT INTO mio_registration_v2(browser_id,token_hash,name,name_normalized,login_id_claim)
    VALUES($1,$2,$3,$4,$5)
  `,[x.browserId,x.tokenHash,x.name,x.nameNormalized,x.loginId]);
  await client.query('COMMIT');
  return {ok:true,created:true,pendingReview:false,participantId:x.browserId,name:x.name,status:'承認待ち'};
 }catch(err){await client.query('ROLLBACK');throw err}
 finally{client.release()}
}
export async function statusV201(browserId,tokenHash,{db=database()}={}){
 validateEnrollment({browserId,tokenHash,name:'-',loginId:''});
 const normal=await db.query('SELECT browser_id,token_hash,name,status,integrated_participant_id,approved_by,approved_at FROM mio_registration_v2 WHERE browser_id=$1',[browserId]);
 const review=await db.query('SELECT browser_id,token_hash,name FROM mio_name_review_v201 WHERE browser_id=$1',[browserId]);
 const row=review.rows[0]||normal.rows[0];
 if(!row||row.token_hash!==tokenHash)throw Error('unauthorized');
 // Keep the original review record intact. Only completed, exact, audited
 // link records can project an approved view. Missing migration fails closed.
 if(review.rows.length===1&&!normal.rows.length&&releaseOK(process.env)){
  try{
   const store=reviewLinkStore(db),exact=await store.readReview(browserId);
   const a=await store.getApproval(browserId);
   const h=/^owner-instruction:[a-f0-9]{64}$/.test(a?.actor||'')?await reviewLinkStore(db).getHistorical(browserId):null;
   const auditOK=/^passkey:[a-f0-9]{64}$/.test(a?.actor||'')||(h&&['webId','mioId','name','operationId','actor','fingerprint'].every(k=>a[k]===h[k]));
   if(exact&&!exact.normal_exists&&exact.browser_id===row.browser_id&&exact.token_hash===tokenHash&&exact.name===row.name&&a?.state==='complete'&&a.fingerprint===reviewFingerprint(exact)&&a.name===row.name&&
      /^MIO-\d{4}$/.test(a.mioId)&&auditOK)
    return {ok:true,participantId:row.browser_id,name:row.name,status:'承認済み',pendingReview:false,
     attendanceGrantVerified:true,integratedParticipantId:a.mioId};
  }catch{/* unchanged pending review */}
 }
 const pendingReview=!!review.rows.length;
 const approved=normal.rows[0];
 const grantVerified=!pendingReview&&row.status==='承認済み'&&
  /^MIO-[0-9]{4}$/.test(String(approved?.integrated_participant_id||''))&&
  typeof approved?.approved_by==='string'&&approved.approved_by.trim().length>0&&
  !!approved.approved_at;
 return {ok:true,participantId:row.browser_id,name:row.name,
  status:pendingReview?'本人確認待ち':row.status,pendingReview,
  // Internal server-side signals only: public light enrollment response does not expose them.
  attendanceGrantVerified:grantVerified,
  integratedParticipantId:grantVerified?approved.integrated_participant_id:null};
}

