import pg from 'pg';
import {reviewFingerprint} from './review-link-core.mjs';
let pool;
const reviewQuery=`SELECT r.browser_id,r.name,r.name_key,r.token_hash,r.reason,
 EXISTS(SELECT 1 FROM mio_registration_v2 n WHERE n.browser_id=r.browser_id) AS normal_exists
 FROM mio_name_review_v201 r WHERE r.browser_id=$1`;
const toApproval=r=>r?({webId:r.browser_id,mioId:r.master_id,name:r.name,operationId:r.operation_id,
 actor:r.actor,fingerprint:r.review_fingerprint,expiresAt:r.expires_at,state:r.completed_at?'complete':'staged'}):null;
const same=(a,b)=>a&&['webId','mioId','name','operationId','actor','fingerprint'].every(k=>a[k]===b[k]);
export function reviewLinkStore(db){
 if(!db){
  if(!process.env.MIO_REGISTRATION_DATABASE_URL)throw Error('registration-db-unavailable');
  if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000});
  db=pool;
 }
 const get=async(c,id,lock=false)=>toApproval((await c.query('SELECT * FROM mio_review_link_approvals_v1 WHERE browser_id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0]);
 const read=async(c,id,lock=false)=>(await c.query(reviewQuery+(lock?' FOR UPDATE OF r':''),[id])).rows[0]||null;
 const tx=async run=>{const c=await db.connect();try{await c.query('BEGIN');const v=await run(c);await c.query('COMMIT');return v}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}};
 return {
  readReview:id=>read(db,id),getApproval:id=>get(db,id),
  getHistorical:async id=>{const r=(await db.query('SELECT browser_id,master_id,name,operation_id,actor,review_fingerprint,approved_at FROM mio_historical_approvals_v1 WHERE browser_id=$1',[id])).rows[0];return r?{webId:r.browser_id,mioId:r.master_id,name:r.name,operationId:r.operation_id,actor:r.actor,fingerprint:r.review_fingerprint,approvedAt:r.approved_at}:null},
  recordHistorical:a=>tx(async c=>{
   const review=await read(c,a.webId,true);
   if(!review||review.normal_exists||reviewFingerprint(review)!==a.fingerprint)throw Error('review-changed');
   const staged=await get(c,a.webId,true);
   if(staged&&!same(staged,a))throw Error('approval-conflict');
   const old=(await c.query('SELECT browser_id,master_id,name,operation_id,actor,review_fingerprint FROM mio_historical_approvals_v1 WHERE browser_id=$1 FOR UPDATE',[a.webId])).rows[0];
   if(old){const b={webId:old.browser_id,mioId:old.master_id,name:old.name,operationId:old.operation_id,actor:old.actor,fingerprint:old.review_fingerprint};if(!same(a,b))throw Error('historical-conflict');return b;}
   await c.query('INSERT INTO mio_historical_approvals_v1(browser_id,master_id,name,operation_id,actor,review_fingerprint,member_confirmed) VALUES($1,$2,$3,$4,$5,$6,true)',[a.webId,a.mioId,a.name,a.operationId,a.actor,a.fingerprint]);return a;
  }),
  stage:a=>tx(async c=>{
   const review=await read(c,a.webId,true);
   if(!review||review.normal_exists||reviewFingerprint(review)!==a.fingerprint)throw Error('review-changed');
   const decision=(await c.query('SELECT browser_id,master_id,name,operation_id,actor,review_fingerprint FROM mio_historical_approvals_v1 WHERE browser_id=$1 FOR UPDATE',[a.webId])).rows[0];
   if(decision&&!same(a,{webId:decision.browser_id,mioId:decision.master_id,name:decision.name,operationId:decision.operation_id,actor:decision.actor,fingerprint:decision.review_fingerprint}))throw Error('historical-conflict');
   const previous=await get(c,a.webId,true);
   if(previous){if(!same(previous,a))throw Error('approval-conflict');return previous;}
   // Unique master and operation constraints fail closed on concurrent requests.
   const q=await c.query(`INSERT INTO mio_review_link_approvals_v1(browser_id,master_id,name,operation_id,actor,review_fingerprint,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[a.webId,a.mioId,a.name,a.operationId,a.actor,a.fingerprint,a.expiresAt]);
   return toApproval(q.rows[0]);
  }),
  complete:a=>tx(async c=>{
   const review=await read(c,a.webId,true),old=await get(c,a.webId,true);
   if(!review||review.normal_exists||reviewFingerprint(review)!==a.fingerprint||!same(old,a))throw Error('approval-changed');
   if(old.state==='complete')return old;
   const q=await c.query(`UPDATE mio_review_link_approvals_v1 SET completed_at=now()
    WHERE browser_id=$1 AND operation_id=$2 AND completed_at IS NULL RETURNING *`,[a.webId,a.operationId]);
   if(q.rowCount!==1)throw Error('completion-conflict');
   return toApproval(q.rows[0]);
  })
 };
}
