import { createHash } from 'node:crypto';
import pg from 'pg';
const { Pool } = pg;

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const fail = (res, status, code) => res.status(status).json({ok:false,code});
export const cookie = (req, name) => {
 const pair=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
 if(!pair)return '';
 try{return decodeURIComponent(pair.slice(name.length+1));}catch{return '';}
};
export const db = () => new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:1500});
export const checkOrigin = req => req.headers.host === 'emuzii-mio-1st-web-v12.vercel.app' && req.headers.origin === 'https://emuzii-mio-1st-web-v12.vercel.app' && /^application\/json(?:;|$)/i.test(req.headers['content-type']||'');
export const verifyGalleryAdmin = async (client,req) => {
 const session=cookie(req,'mio_gallery_session'),device=cookie(req,'mio_gallery_device');
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(session)||!/^[A-Za-z0-9_-]{40,60}$/.test(device))return null;
 const result=await client.query(`
 SELECT u.id AS user_id,u.role,d.id AS device_id
 FROM gallery_admin_sessions s
 JOIN gallery_admin_users u ON u.id=s.user_id
 JOIN gallery_admin_devices d ON d.id=s.device_id
 WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
 AND d.device_public_id=$2 AND d.user_id=u.id AND d.status='approved'
 AND u.status='active' AND u.role IN ('owner','admin') LIMIT 1
 `,[sha256(session),sha256(device)]);
 return result.rows[0]||null;
};
