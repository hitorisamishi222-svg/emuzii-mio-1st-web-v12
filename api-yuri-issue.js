// Owner-issued, short-lived code. Not authorized by a name or browser ID.
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {bridge} from './bridge.js';
import {authorizedCode} from './api-gacha-web-gate.js';
import {sessionOK} from './gacha-passkey-auth.js';
import {TARGET,credentialsFromCode,assertVerifiedStatus} from './mio-yuri-recovery-core.mjs';
import {approvedYuriGASHash} from './mio-yuri-recovery-session.mjs';
const HOST='emuzii-mio-1st-web-v12.vercel.app';
let pool;
function db(){
 if(!process.env.MIO_REGISTRATION_DATABASE_URL)throw Error('RECOVERY_DB_UNAVAILABLE');
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000});
 return pool;
}
const deny=(res,status,message)=>res.status(status).json({ok:false,error:message});
export async function issueYuriCode({database=db(),callGAS=bridge,newCode='MIO-REC-'+randomBytes(16).toString('hex')}={}){
 const gasHash=await approvedYuriGASHash(database);
 const real=await callGAS('status',{participantId:TARGET.webId,tokenHash:gasHash});
 const rights=assertVerifiedStatus(real);
 const {codeHash,tokenHash}=credentialsFromCode(newCode);
 // Serialize reissues across serverless instances. The existing unique index
 // still guarantees at most one unredeemed recovery code for this browser.
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[TARGET.webId]);
  // Older unredeemed IDs are retired, never claimed: revoked_at records why.
  // redeemed_at is also set solely to release the legacy partial unique index.
  // If INSERT fails, ROLLBACK restores the previously valid code.
  const retired=await client.query(
   'UPDATE mio_yuri_recovery_v1 SET redeemed_at=now(),revoked_at=now(),session_expires_at=NULL '+
   'WHERE browser_id=$1 AND master_id=$2 AND redeemed_at IS NULL AND revoked_at IS NULL '+
   'RETURNING recovery_hash',[TARGET.webId,TARGET.mioId]);
  const result=await client.query('INSERT INTO mio_yuri_recovery_v1 '+
   '(recovery_hash,browser_id,master_id,token_hash,expires_at) '+
   "VALUES($1,$2,$3,$4,now()+interval '48 hours') RETURNING expires_at",
   [codeHash,TARGET.webId,TARGET.mioId,tokenHash]);
  if(result.rows.length!==1)throw Error('RECOVERY_CODE_ISSUE_FAILED');
  await client.query('COMMIT');
  return {code:newCode,expiresAt:result.rows[0].expires_at,
   drawsRemaining:rights.remaining,replacedCount:retired.rows.length};
 }catch(e){
  await client.query('ROLLBACK');
  throw e;
 }finally{client.release()}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Robots-Tag','noindex, nofollow');
 res.setHeader('Referrer-Policy','no-referrer');
 if(process.env.VERCEL_ENV!=='production')return deny(res,503,'本番環境で操作してください');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return deny(res,405,'POST required')}
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST)
  return deny(res,403,'本番管理画面から操作してください');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||
    Number(req.headers['content-length']||0)>2048)return deny(res,400,'操作形式を確認してください');
 const d=typeof req.body==='object'&&req.body&&!Array.isArray(req.body)?req.body:{};
 if(d.action!=='issue')return deny(res,400,'操作を確認してください');
 const ok=authorizedCode(d.adminCode,process.env.MIO_GACHA_WEB_KEY_SHA256)||await sessionOK(req);
 if(!ok)return deny(res,403,'みおの管理者認証が必要です');
 try{
  const r=await issueYuriCode();
  return res.status(200).json({ok:true,target:'ユーリ / MIO-0017',
   recoveryCode:r.code,expiresAt:r.expiresAt,drawsRemaining:r.drawsRemaining,replacedCount:r.replacedCount});
 }catch(e){
  console.warn('MIO scoped owner recovery unavailable',e?.code||e?.message||'error');
  return deny(res,409,'復旧コードを発行できません。認証連携の状態を管理者が確認してください');
 }
}
