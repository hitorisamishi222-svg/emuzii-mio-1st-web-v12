import pg from 'pg';
import {createHash,randomBytes} from 'node:crypto';
const {Pool}=pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const digest=s=>createHash('sha256').update(s).digest('hex');
const error=(res,status,code)=>res.status(status).json({ok:false,code});
const getCookie=(req,name)=>{
 const x=String(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(name+'='));
 try{return x?decodeURIComponent(x.slice(name.length+1)):null}catch{return null}
};
const setSessionCookie=(res,value,maxAge)=>{
 res.setHeader('Set-Cookie','mio_gallery_session='+encodeURIComponent(value)+'; Path=/api/gallery; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge);
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return error(res,405,'METHOD_NOT_ALLOWED')}
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return error(res,403,'ORIGIN_NOT_ALLOWED');
 if(!process.env.GALLERY_DATABASE_URL)return error(res,503,'ADMIN_NOT_CONFIGURED');
 const action=req.body?.action;
 if(!['remember','logout'].includes(action))return error(res,400,'ACTION_INVALID');
 const oldToken=getCookie(req,'mio_gallery_session'),device=getCookie(req,'mio_gallery_device');
 if(!oldToken||!device||!/^[A-Za-z0-9_-]{40,64}$/.test(oldToken)||!/^[A-Za-z0-9_-]{40,64}$/.test(device))return error(res,401,'ADMIN_LOGIN_REQUIRED');
 const pool=new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:4000});
 let c;
 try{
  c=await pool.connect();
  await c.query('BEGIN');
  const auth=await c.query(`SELECT s.id AS session_id,u.id AS user_id FROM gallery_admin_sessions s
 JOIN gallery_admin_users u ON u.id=s.user_id JOIN gallery_admin_devices d ON d.id=s.device_id
 WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND u.status='active'
 AND u.role IN ('owner','admin') AND d.user_id=u.id AND d.status='approved'
 AND d.device_public_id=$2 FOR UPDATE OF s`,[digest(oldToken),digest(device)]);
  if(!auth.rowCount){await c.query('ROLLBACK');return error(res,401,'ADMIN_LOGIN_REQUIRED')}
  const sid=auth.rows[0].session_id,uid=auth.rows[0].user_id;
  if(action==='logout'){
   await c.query('UPDATE gallery_admin_sessions SET revoked_at=now() WHERE id=$1',[sid]);
   await c.query("INSERT INTO gallery_admin_audit(actor_id,action,result) VALUES($1,'gallery_admin_logout','success')",[uid]);
   await c.query('COMMIT');
   setSessionCookie(res,'',0);
   return res.status(200).json({ok:true,loggedOut:true});
  }
  const token=randomBytes(32).toString('base64url');
  const up=await c.query("UPDATE gallery_admin_sessions SET token_hash=$1,expires_at=now()+interval '30 days' WHERE id=$2 AND revoked_at IS NULL RETURNING expires_at",[digest(token),sid]);
  if(!up.rowCount){await c.query('ROLLBACK');return error(res,409,'SESSION_CHANGED')}
  await c.query("INSERT INTO gallery_admin_audit(actor_id,action,result) VALUES($1,'gallery_admin_remember_device','success')",[uid]);
  await c.query('COMMIT');
  setSessionCookie(res,token,2592000);
  return res.status(200).json({ok:true,remembered:true,expiresAt:up.rows[0].expires_at});
 }catch(e){await c?.query('ROLLBACK').catch(()=>{});console.error('gallery remember:',e?.code||e?.message||'error');return error(res,503,'SESSION_SERVICE_UNAVAILABLE')}
 finally{c?.release();await pool.end()}
}
