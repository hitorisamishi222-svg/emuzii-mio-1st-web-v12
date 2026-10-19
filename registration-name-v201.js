// v2.0.1: concurrency-safe name reservation, separated from legacy MIO entitlements.
import pg from 'pg';
const {Pool}=pg;
import {normalizeName,validateEnrollment} from './registration-light-store.js';
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
  const prior=existing.rows[0]||review.rows[0];
  if(prior){
   if(prior.token_hash!==x.tokenHash||prior.name!==x.name)throw Error('identity mismatch');
   await client.query('COMMIT');
   return {ok:true,created:false,pendingReview:!existing.rows.length,participantId:x.browserId,name:prior.name,status:'承認待ち'};
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
 const normal=await db.query('SELECT browser_id,token_hash,name,status FROM mio_registration_v2 WHERE browser_id=$1',[browserId]);
 const review=normal.rows.length?{rows:[]}:await db.query('SELECT browser_id,token_hash,name FROM mio_name_review_v201 WHERE browser_id=$1',[browserId]);
 const row=normal.rows[0]||review.rows[0];
 if(!row||row.token_hash!==tokenHash)throw Error('unauthorized');
 return {ok:true,participantId:row.browser_id,name:row.name,status:normal.rows.length?row.status:'本人確認待ち',pendingReview:!normal.rows.length};
}
