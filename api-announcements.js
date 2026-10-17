import pg from 'pg';
import { createHash } from 'node:crypto';
const {Pool}=pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(res,status,code)=>res.status(status).json({ok:false,code});
const cookie=(req,name)=>{const p=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));try{return p?decodeURIComponent(p.slice(name.length+1)):''}catch{return''}};
const row=r=>({id:String(r.id),title:r.title,body:r.body,published:r.published,revision:r.revision,updatedAt:r.updated_at});
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return fail(res,405,'METHOD_NOT_ALLOWED')}
 if(req.headers.host!==HOST||!process.env.GALLERY_DATABASE_URL)return fail(res,503,'SERVICE_UNAVAILABLE');
 if(req.method==='POST'&&(req.headers.origin!=='https://'+HOST||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||Number(req.headers['content-length']||0)>14000))return fail(res,403,'REQUEST_REJECTED');
 const pool=new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:4000});let c;
 try{
  c=await pool.connect();
  // This isolated content table is initialized idempotently on the gallery-admin database.
  // It never modifies attendance, gacha, or registration tables.
  await c.query(`CREATE TABLE IF NOT EXISTS anniversary_announcements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120),
    body TEXT NOT NULL CHECK(char_length(body) BETWEEN 1 AND 5000),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
  )`);
  let admin=null;
  const token=cookie(req,'mio_gallery_session'),device=cookie(req,'mio_gallery_device');
  if(/^[A-Za-z0-9_-]{40,64}$/.test(token)&&/^[A-Za-z0-9_-]{40,64}$/.test(device)){
   const auth=await c.query(`SELECT u.id,u.role FROM gallery_admin_sessions s JOIN gallery_admin_users u ON u.id=s.user_id JOIN gallery_admin_devices d ON d.id=s.device_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND u.status='active' AND u.role IN ('owner','admin') AND d.user_id=u.id AND d.device_public_id=$2 AND d.status='approved' LIMIT 1`,[hash(token),hash(device)]);
   admin=auth.rows[0]||null;
  }
  if(req.method==='GET'){
   const publicOnly=req.query?.scope!=='admin';
   if(!publicOnly&&!admin)return res.status(200).json({ok:true,authorized:false,items:[]});
   const q=await c.query('SELECT id,title,body,published,revision,updated_at FROM anniversary_announcements '+(publicOnly?'WHERE published=true ':'')+'ORDER BY updated_at DESC,id DESC LIMIT 100');
   return res.status(200).json({ok:true,authorized:!!admin,items:q.rows.map(row)});
  }
  if(!admin)return fail(res,401,'ADMIN_LOGIN_REQUIRED');
  const b=req.body||{},action=b.action;
  if(!['create','update','publish','unpublish','delete'].includes(action))return fail(res,400,'ACTION_INVALID');
  if(action==='create'||action==='update'){
   if(typeof b.title!=='string'||typeof b.body!=='string'||!b.title.trim()||!b.body.trim()||b.title.trim().length>120||b.body.trim().length>5000)return fail(res,400,'FIELDS_INVALID');
  }
  if(action!=='create'&&(!/^[1-9][0-9]{0,17}$/.test(String(b.id||''))||!Number.isSafeInteger(b.revision)||b.revision<1))return fail(res,400,'REVISION_INVALID');
  let q;
  if(action==='create')q=await c.query('INSERT INTO anniversary_announcements(title,body,updated_by) VALUES($1,$2,$3) RETURNING id,title,body,published,revision,updated_at',[b.title.trim(),b.body.trim(),String(admin.id)]);
  else if(action==='update')q=await c.query('UPDATE anniversary_announcements SET title=$1,body=$2,revision=revision+1,updated_at=now(),updated_by=$3 WHERE id=$4 AND revision=$5 RETURNING id,title,body,published,revision,updated_at',[b.title.trim(),b.body.trim(),String(admin.id),b.id,b.revision]);
  else if(action==='publish'||action==='unpublish')q=await c.query('UPDATE anniversary_announcements SET published=$1,revision=revision+1,updated_at=now(),updated_by=$2 WHERE id=$3 AND revision=$4 RETURNING id,title,body,published,revision,updated_at',[action==='publish',String(admin.id),b.id,b.revision]);
  else q=await c.query('DELETE FROM anniversary_announcements WHERE id=$1 AND revision=$2 RETURNING id,title,body,published,revision,updated_at',[b.id,b.revision]);
  if(!q.rowCount)return fail(res,409,'ITEM_CHANGED_RELOAD');
  return res.status(200).json({ok:true,item:row(q.rows[0])});
 }catch(e){console.error('announcements:',e?.code||e?.message||'error');return fail(res,503,'ANNOUNCEMENTS_UNAVAILABLE')}finally{c?.release();await pool.end()}
}