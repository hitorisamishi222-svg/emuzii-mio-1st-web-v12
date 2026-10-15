// DEV ONLY: transactional account creation. Must be called by a trusted server after
// identity verification and abuse protection; never from a public browser bundle.
import {randomUUID} from 'node:crypto';
import {validateLoginId,normalizeLoginId} from '../mio-auth-rules-v21.js';
import {hashPassword} from './mio-auth-crypto.mjs';
export async function registerAccountTransaction(pool,{mioId,loginId,password}){
 if(typeof mioId!=='string'||!mioId.trim()||mioId.length>100)throw Error('invalid MIO-ID');
 const invalid=validateLoginId(loginId);if(invalid)throw Error(invalid);
 if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('invalid password');
 const mioKey=normalizeLoginId(mioId),loginKey=normalizeLoginId(loginId);
 if(mioKey===loginKey)throw Error('MIO-ID and login ID must differ');
 const passwordHash=await hashPassword(password),accountId=randomUUID(),client=await pool.connect();
 let begun=false;
 try{
  await client.query('BEGIN');begun=true;
  // Identifier uniqueness is enforced by mio_identifiers_v21.identifier_key PRIMARY KEY.
  // Reserve both identifiers before writing the account row. This requires a
  // DEFERRABLE foreign key or inserting the account first; we insert account first.
  await client.query('INSERT INTO mio_accounts_v21(account_id,mio_id,login_id,password_hash) VALUES($1,$2,$3,$4)',[accountId,mioId,loginId,passwordHash]);
  const keys=[[mioKey,'mio_id'],[loginKey,'login_id']];
  for(const [key,kind] of keys){
   const r=await client.query('INSERT INTO mio_identifiers_v21(identifier_key,account_id,kind) VALUES($1,$2,$3) ON CONFLICT(identifier_key) DO NOTHING RETURNING identifier_key',[key,accountId,kind]);
   if(r.rowCount!==1)throw Error('identifier already registered');
  }
  await client.query('INSERT INTO mio_gacha_balances_v21(account_id,remaining) VALUES($1,0)',[accountId]);
  await client.query('COMMIT');begun=false;
  return {accountId,mioId,loginId};
 }catch(e){if(begun)await client.query('ROLLBACK');throw e}finally{client.release()}
}
