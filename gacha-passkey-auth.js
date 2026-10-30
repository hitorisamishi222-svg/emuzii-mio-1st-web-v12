import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import pg from 'pg';
export const {Pool}=pg;
export const HOST='emuzii-mio-1st-web-v12.vercel.app';
export const READY='verified-gacha-passkey-20261030';
export const COOKIE='mio_gacha_admin_passkey';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const random=()=>randomBytes(32).toString('base64url');
export const hostOK=req=>req.headers.host===HOST&&req.headers.origin==='https://'+HOST;
export function cookie(req,name=COOKIE){
 const x=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
 try{return x?decodeURIComponent(x.slice(name.length+1)):''}catch{return ''}
}
export const pool=()=>new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:3500,idleTimeoutMillis:500});
export async function sessionOK(req){
 if(process.env.MIO_GACHA_PASSKEY_RELEASE!==READY||!process.env.GALLERY_DATABASE_URL)return false;
 const t=cookie(req);if(!/^[\w-]{40,60}$/.test(t))return false;
 const p=pool();
 try{
  const r=await p.query('SELECT 1 FROM mio_gacha_admin_sessions s JOIN mio_gacha_admin_credentials k ON k.credential_id=s.credential_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND k.revoked_at IS NULL LIMIT 1',[hash(t)]);
  return r.rowCount===1;
 }catch{return false}finally{await p.end()}
}
