// One-time owner-authorized device recovery; no public enrollment or grant.
import pg from 'pg';
import {bridge,sessionCookie} from './bridge.js';
import {approvedYuriGASHash} from './mio-yuri-recovery-session.mjs';
import {TARGET,credentialsFromCode,assertVerifiedStatus} from './mio-yuri-recovery-core.mjs';
let pool;
function dbPool(){
 if(!process.env.MIO_REGISTRATION_DATABASE_URL)throw Error('REGISTRATION_DB_UNAVAILABLE');
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,
  ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000});
 return pool;
}
export async function redeemYuriCode({code,db=dbPool(),callGAS=bridge}){
 const {codeHash,token,tokenHash}=credentialsFromCode(code);
 const first=await db.query('SELECT recovery_hash FROM mio_yuri_recovery_v1 '+
   'WHERE recovery_hash=$1 AND browser_id=$2 AND master_id=$3 '+
   'AND token_hash=$4 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>now()',
   [codeHash,TARGET.webId,TARGET.mioId,tokenHash]);
 if(first.rows.length!==1)throw Error('CODE_EXPIRED_OR_USED');
 const gasHash=await approvedYuriGASHash(db);
 const status=await callGAS('status',{participantId:TARGET.webId,tokenHash:gasHash});
 const entitlement=assertVerifiedStatus(status);
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[TARGET.webId]);
  const consumed=await client.query("UPDATE mio_yuri_recovery_v1 SET redeemed_at=now(),session_expires_at=now()+interval '90 days' "+
   'WHERE recovery_hash=$1 AND browser_id=$2 AND master_id=$3 '+
   'AND token_hash=$4 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING recovery_hash',
   [codeHash,TARGET.webId,TARGET.mioId,tokenHash]);
  if(consumed.rows.length!==1)throw Error('CODE_EXPIRED_OR_USED');
  const approved=await client.query('SELECT n.browser_id FROM mio_registration_v2 n '+
   'JOIN mio_name_review_v201 r ON r.browser_id=n.browser_id AND r.token_hash=n.token_hash AND r.name=n.name '+
   'WHERE n.browser_id=$1 AND n.token_hash=$2 AND n.name=$3 '+
   "AND n.status='承認済み' AND n.integrated_participant_id=$4 "+
   "AND n.approved_by='owner-authorized-recovery-20261124' "+
   'AND n.approved_at IS NOT NULL FOR UPDATE OF n',
   [TARGET.webId,gasHash,TARGET.name,TARGET.mioId]);
  if(approved.rows.length!==1)throw Error('NEON_APPROVAL_MISMATCH');
  // One recovery login device at a time. Keep a prior live session until
  // the new code is successfully redeemed, then retire the older sessions.
  await client.query('UPDATE mio_yuri_recovery_v1 '+
   'SET session_expires_at=now(),revoked_at=COALESCE(revoked_at,now()) '+
   'WHERE browser_id=$1 AND master_id=$2 AND recovery_hash<>$3 '+
   'AND redeemed_at IS NOT NULL AND session_expires_at>now()',
   [TARGET.webId,TARGET.mioId,codeHash]);
  await client.query('COMMIT');
  return {token,status,entitlement};
 }catch(e){await client.query('ROLLBACK');throw e}
 finally{client.release()}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(process.env.VERCEL_ENV!=='production')return res.status(503).json({ok:false,error:'本番専用です'});
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'POST required'})}
 const origin=req.headers.origin;
 if(origin){try{if(new URL(origin).host!==req.headers.host)throw Error()}catch{
  return res.status(403).json({ok:false,error:'別サイトから利用できません'})
 }}
 const code=req.body?.code;
 if(typeof code!=='string'||code.length>48)return res.status(400).json({ok:false,error:'復旧コードを確認してください'});
 if(typeof process.env.APPS_SCRIPT_SECRET!=='string'||process.env.APPS_SCRIPT_SECRET.length<32||
    typeof process.env.MIO_LIGHT_SESSION_SECRET!=='string'||process.env.MIO_LIGHT_SESSION_SECRET.length<48)
  return res.status(503).json({ok:false,error:'管理者による再確認が必要です'});
 try{
  const {token,entitlement}=await redeemYuriCode({code});
  res.setHeader('Set-Cookie',sessionCookie(TARGET.webId,token,process.env.APPS_SCRIPT_SECRET));
  return res.status(200).json({ok:true,restored:true,remaining:entitlement.remaining,next:'/'});
 }catch{
  return res.status(403).json({ok:false,error:'コードを確認できません。運営に再発行を依頼してください。'});
 }
}
