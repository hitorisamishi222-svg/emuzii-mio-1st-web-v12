// Narrow owner-approved recovery delegation for Yuri only. No rights write.
import {hash} from './bridge.js';
import {TARGET} from './mio-yuri-recovery-core.mjs';
let pool;
async function database(){
 if(!process.env.MIO_REGISTRATION_DATABASE_URL)throw Error('REGISTRATION_DB_UNAVAILABLE');
 if(!pool){const {default:pg}=await import('pg');pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,ssl:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:5000});}
 return pool;
}
export async function approvedYuriGASHash(db=null){
 db ||= await database();
 const r=await db.query('SELECT n.token_hash AS gas_hash FROM mio_registration_v2 n '+
  'JOIN mio_name_review_v201 rv ON rv.browser_id=n.browser_id AND rv.token_hash=n.token_hash AND rv.name=n.name '+
  'WHERE n.browser_id=$1 AND n.integrated_participant_id=$2 AND n.name=$3 '+
  "AND n.status='承認済み' AND n.approved_by='owner-authorized-recovery-20261124' "+
  'AND n.approved_at IS NOT NULL LIMIT 2',[TARGET.webId,TARGET.mioId,TARGET.name]);
 if(r.rows.length!==1 || !/^[a-f0-9]{64}$/.test(r.rows[0]?.gas_hash||''))
  throw Error('YURI_OWNER_APPROVAL_NOT_VERIFIED');
 return r.rows[0].gas_hash;
}
export async function yuriRecoveryGASHash(session,{db=null}={}){
 if(session?.id!==TARGET.webId||!/^[a-f0-9]{64}$/.test(session.token||''))return null;
 db ||= await database();
 const r=await db.query('SELECT n.token_hash AS gas_hash FROM mio_yuri_recovery_v1 t '+
  'JOIN mio_registration_v2 n ON n.browser_id=t.browser_id '+
  'JOIN mio_name_review_v201 rv ON rv.browser_id=n.browser_id AND rv.token_hash=n.token_hash AND rv.name=n.name '+
  'WHERE t.browser_id=$1 AND t.master_id=$2 AND t.token_hash=$3 '+
  'AND t.redeemed_at IS NOT NULL AND t.session_expires_at>now() '+
  "AND n.name=$4 AND n.status='承認済み' AND n.integrated_participant_id=$2 "+
  "AND n.approved_by='owner-authorized-recovery-20261124' AND n.approved_at IS NOT NULL LIMIT 2",
  [TARGET.webId,TARGET.mioId,hash(session.token),TARGET.name]);
 const gasHash=r.rows.length===1?r.rows[0]?.gas_hash:null;
 return /^[a-f0-9]{64}$/.test(gasHash||'')?gasHash:null;
}
