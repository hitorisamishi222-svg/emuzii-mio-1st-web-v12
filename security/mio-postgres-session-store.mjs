// Server-side PostgreSQL session adapter. Dependency-injected pg-compatible pool.
// Do not import into browser bundles. No live DB connection is made by this module.
import { createSessionSecret, sessionTokenDigest } from './mio-auth-crypto.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function assertAccount(id){if(typeof id!=='string'||!UUID.test(id))throw Error('invalid account id')}
function assertDigest(d){if(typeof d!=='string'||!/^[0-9a-f]{64}$/.test(d))throw Error('invalid session id')}
export function createPostgresSessionStore(pool,{ttlMs=2592000000,now=()=>Date.now()}={}){
 if(!pool||typeof pool.query!=='function')throw Error('pg-compatible pool required');
 if(!Number.isSafeInteger(ttlMs)||ttlMs<60000)throw Error('invalid TTL');
 async function create(accountId,deviceLabel='端末'){
  assertAccount(accountId);
  const token=createSessionSecret(),sessionId=sessionTokenDigest(token);
  const label=String(deviceLabel).slice(0,80),expiresAt=new Date(now()+ttlMs);
  await pool.query('INSERT INTO mio_sessions_v21(token_digest,account_id,device_label,expires_at) VALUES($1,$2,$3,$4)',[sessionId,accountId,label,expiresAt]);
  return {token,sessionId,expiresAt:expiresAt.toISOString()};
 }
 async function lookup(token){
  let digest;try{digest=sessionTokenDigest(token)}catch{return null}
  const r=await pool.query('SELECT account_id,device_label,expires_at FROM mio_sessions_v21 WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>now()',[digest]);
  return r.rowCount===1?{accountId:r.rows[0].account_id,deviceLabel:r.rows[0].device_label,expiresAt:r.rows[0].expires_at}:null;
 }
 async function list(accountId){
  assertAccount(accountId);
  const r=await pool.query('SELECT token_digest,device_label,created_at,expires_at FROM mio_sessions_v21 WHERE account_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC',[accountId]);
  return r.rows.map(x=>({sessionId:x.token_digest,deviceLabel:x.device_label,createdAt:x.created_at,expiresAt:x.expires_at}));
 }
 async function revoke(accountId,sessionId){
  assertAccount(accountId);assertDigest(sessionId);
  const r=await pool.query('UPDATE mio_sessions_v21 SET revoked_at=now() WHERE account_id=$1 AND token_digest=$2 AND revoked_at IS NULL RETURNING token_digest',[accountId,sessionId]);
  return r.rowCount===1;
 }
 async function revokeAll(accountId){
  assertAccount(accountId);
  const r=await pool.query('UPDATE mio_sessions_v21 SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL RETURNING token_digest',[accountId]);
  return r.rowCount;
 }
 return {create,lookup,list,revoke,revokeAll};
}
