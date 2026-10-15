import {verifyPassword} from './mio-auth-crypto.mjs';
import {createPostgresSessionStore} from './mio-postgres-session-store.mjs';
import {normalizeLoginId} from '../mio-auth-rules-v21.js';
// DEV ONLY. Server routes must add rate limiting, CSRF, HttpOnly cookies and audit logs.
export function createPostgresLoginService(pool,{sessions=createPostgresSessionStore(pool)}={}){
 async function login({identifier,password,deviceLabel='端末'}={}){
  if(typeof identifier!=='string'||!identifier||identifier.length>100||typeof password!=='string'||password.length>1024)throw Error('invalid credentials');
  const r=await pool.query("SELECT a.account_id,a.password_hash FROM mio_identifiers_v21 i JOIN mio_accounts_v21 a ON a.account_id=i.account_id WHERE i.identifier_key=$1 AND i.kind IN ('mio_id','login_id')",[normalizeLoginId(identifier)]);
  if(r.rowCount!==1||!r.rows[0].password_hash||!(await verifyPassword(password,r.rows[0].password_hash)))throw Error('invalid credentials');
  const accountId=r.rows[0].account_id;
  return {accountId,...await sessions.create(accountId,deviceLabel)};
 }
 return {login};
}
