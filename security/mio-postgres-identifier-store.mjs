// Development-only PostgreSQL adapter; never accepts account IDs from untrusted browser input.
import {validateLoginId,normalizeLoginId} from '../mio-auth-rules-v21.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createPostgresIdentifierStore(pool){
 if(!pool||typeof pool.connect!=='function'||typeof pool.query!=='function')throw Error('pg-compatible pool required');
 async function resolve(identifier){
  if(typeof identifier!=='string'||!identifier.trim())return null;
  const r=await pool.query("SELECT account_id FROM mio_identifiers_v21 WHERE identifier_key=$1 AND kind IN ('mio_id','login_id')",[normalizeLoginId(identifier)]);
  return r.rowCount===1?r.rows[0].account_id:null;
 }
 async function changeLoginId(accountId,newId){
  if(typeof accountId!=='string'||!UUID.test(accountId))throw Error('invalid account');
  const validation=validateLoginId(newId);if(validation)throw Error(validation);
  const key=normalizeLoginId(newId),client=await pool.connect();let begun=false;
  try{
   await client.query('BEGIN');begun=true;
   const account=await client.query('SELECT login_id FROM mio_accounts_v21 WHERE account_id=$1 FOR UPDATE',[accountId]);
   if(account.rowCount!==1)throw Error('account not found');
   const oldKey=normalizeLoginId(account.rows[0].login_id);
   if(key!==oldKey){
    const claim=await client.query("INSERT INTO mio_identifiers_v21(identifier_key,account_id,kind) VALUES($1,$2,'login_id') ON CONFLICT(identifier_key) DO NOTHING RETURNING identifier_key",[key,accountId]);
    if(claim.rowCount!==1)throw Error('identifier already used or retired');
    const retired=await client.query("UPDATE mio_identifiers_v21 SET kind='retired_login_id' WHERE identifier_key=$1 AND account_id=$2 AND kind='login_id' RETURNING identifier_key",[oldKey,accountId]);
    if(retired.rowCount!==1)throw Error('old identifier mapping missing');
   }
   await client.query('UPDATE mio_accounts_v21 SET login_id=$2,updated_at=now() WHERE account_id=$1',[accountId,newId]);
   await client.query('COMMIT');begun=false;
   return {changed:key!==oldKey,loginId:newId};
  }catch(e){if(begun)await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 return {resolve,changeLoginId};
}
