// v2.0.2: privacy-preserving network signal for light enrollment only.
// This is an advisory signal; it never grants or merges identity.
import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import pg from 'pg';
const {Pool}=pg;
let pool;
function db(){if(!pool)pool=new Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:4000});return pool}
function requestIP(req){
 // Vercel's platform-provided header; do not trust arbitrary X-Forwarded-For.
 const raw=req.headers['x-vercel-forwarded-for'];
 const ip=Array.isArray(raw)?raw[0]:String(raw||'').split(',')[0].trim();
 return isIP(ip)?ip:null;
}
export {requestIP};
export async function auditEnrollmentIP(req,browserId,eventType){
 if(!/^MIO-W-[a-f0-9]{24}$/.test(browserId)||!['registration','status'].includes(eventType))return false;
 const ip=requestIP(req),key=process.env.MIO_IP_AUDIT_SECRET;
 if(!ip||!key||key.length<48)return false;
 const ipHash=createHmac('sha256',key).update('mio-ip-v202:'+ip).digest('hex');
 await db().query(`INSERT INTO mio_ip_audit_v202(browser_id,ip_hash,ip_family,event_type)
 SELECT $1,$2,$3,$4 WHERE NOT EXISTS (
 SELECT 1 FROM mio_ip_audit_v202 WHERE browser_id=$1 AND ip_hash=$2 AND event_type=$4
 AND created_at > now() - interval '24 hours')`,[browserId,ipHash,isIP(ip),eventType]);
 return true;
}
