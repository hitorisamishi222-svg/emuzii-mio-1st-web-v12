/**
 * Staged privacy-limited IP signal history. NOT an authentication factor.
 * Never infer ownership of a participant MIO-ID from an address or its hash.
 * No production caller imports this module until storage and consent are reviewed.
 */
import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';

const ID=/^MIO-W-[a-f0-9]{24}$/;
export const MAX_RECENT_IPS=5;

export function trustedEdgeIP(req){
  // Only use behind an edge which overwrites X-Forwarded-For (Vercel).
  const value=req?.headers?.['x-forwarded-for'];
  const raw=Array.isArray(value)?value[0]:String(value||'').split(',')[0].trim();
  return isIP(raw)?raw:null;
}

/**
 * db must be a dedicated PostgreSQL Pool with a connect() method.
 * browserId is read from an already validated browser session, not user input.
 * Uses a transaction/advisory lock to keep at most five distinct IP hashes per browser.
 */
export async function recordRecentIP(req,browserId,{db,secret}={}){
  if(!ID.test(String(browserId||'')))return {recorded:false,reason:'invalid_browser'};
  if(typeof secret!=='string'||secret.length<48)return {recorded:false,reason:'not_configured'};
  const ip=trustedEdgeIP(req);
  if(!ip)return {recorded:false,reason:'no_trusted_ip'};
  if(!db||typeof db.connect!=='function')throw Error('IP history store unavailable');
  const fingerprint=createHmac('sha256',secret).update('mio-ip-v203:').update(ip).digest('hex');
  const family=isIP(ip);
  const client=await db.connect();
  let inTransaction=false;
  try{
    await client.query('BEGIN');
    inTransaction=true;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 1003))',[browserId]);
    // Passive cleanup; a separate scheduled sweep is also needed if traffic stops.
    await client.query("DELETE FROM mio_ip_recent_v203 WHERE last_seen < now() - interval '30 days'");
    await client.query(`INSERT INTO mio_ip_recent_v203(browser_id,ip_hash,ip_family)
      VALUES($1,$2,$3) ON CONFLICT(browser_id,ip_hash)
      DO UPDATE SET last_seen=now(), ip_family=EXCLUDED.ip_family`,[browserId,fingerprint,family]);
    // Preserve the current IP and the four freshest *other* IPs.
    await client.query(`DELETE FROM mio_ip_recent_v203 WHERE browser_id=$1 AND ip_hash IN (
      SELECT ip_hash FROM mio_ip_recent_v203
      WHERE browser_id=$1 AND ip_hash<>$2
      ORDER BY last_seen DESC, ip_hash DESC OFFSET 4
    )`,[browserId,fingerprint]);
    await client.query('COMMIT');
    inTransaction=false;
    return {recorded:true};
  }catch(e){
    if(inTransaction)await client.query('ROLLBACK').catch(()=>{});
    throw e;
  }finally{client.release()}
}
