import pg from 'pg';
import {createHash} from 'node:crypto';

const {Pool}=pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const THEMES=new Set(['princess','devil']);
const fail=(res,status,code)=>res.status(status).json({ok:false,code});
const hash=value=>createHash('sha256').update(value).digest('hex');
const getCookie=(req,key)=>{
  const pair=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(key+'='));
  try{return pair?decodeURIComponent(pair.slice(key.length+1)):''}catch{return ''}
};
const defaults=()=>({ok:true,theme:'princess',revision:0});

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Vary','Cookie');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method)){
    res.setHeader('Allow','GET, POST');
    return fail(res,405,'METHOD_NOT_ALLOWED');
  }
  if(req.headers.host!==HOST||!process.env.GALLERY_DATABASE_URL){
    return fail(res,503,'BACKGROUND_UNAVAILABLE');
  }
  if(req.method==='POST'){
    if(req.headers.origin!=='https://'+HOST||
       !/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||
       Number(req.headers['content-length']||0)>1024){
      return fail(res,403,'REQUEST_REJECTED');
    }
    if(!THEMES.has(req.body?.theme)||
       !Number.isSafeInteger(req.body?.revision)||req.body.revision<0){
      return fail(res,400,'FIELDS_INVALID');
    }
  }
  const pool=new Pool({
    connectionString:process.env.GALLERY_DATABASE_URL,
    max:1,connectionTimeoutMillis:4000
  });
  let c;
  try{
    c=await pool.connect();
    if(req.method==='GET'){
      let q;
      try{
        q=await c.query('SELECT theme,revision FROM anniversary_background_settings WHERE id=1');
      }catch(e){
        if(e.code==='42P01')return res.status(200).json(defaults());
        throw e;
      }
      const current=q.rows[0];
      if(!current)return res.status(200).json(defaults());
      if(!THEMES.has(current.theme))return fail(res,503,'INVALID_SAVED_BACKGROUND');
      return res.status(200).json({ok:true,theme:current.theme,revision:current.revision});
    }
    const token=getCookie(req,'mio_gallery_session');
    const device=getCookie(req,'mio_gallery_device');
    if(!/^[A-Za-z0-9_-]{40,64}$/.test(token)||
       !/^[A-Za-z0-9_-]{40,64}$/.test(device)){
      return fail(res,401,'ADMIN_LOGIN_REQUIRED');
    }
    const auth=await c.query(
      "SELECT u.id FROM gallery_admin_sessions s JOIN gallery_admin_users u ON u.id=s.user_id JOIN gallery_admin_devices d ON d.id=s.device_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND u.status='active' AND u.role IN ('owner','admin') AND d.user_id=u.id AND d.device_public_id=$2 AND d.status='approved' LIMIT 1",
      [hash(token),hash(device)]
    );
    if(!auth.rows[0])return fail(res,401,'ADMIN_LOGIN_REQUIRED');
    const {theme,revision}=req.body;
    await c.query('BEGIN');
    try{
      // Schema must be provisioned separately; requests never create tables.
      let updated;
      if(revision===0){
        updated=await c.query(
          'INSERT INTO anniversary_background_settings(id,theme,revision,updated_by) VALUES(1,$1,1,$2) ON CONFLICT(id) DO NOTHING RETURNING theme,revision',
          [theme,String(auth.rows[0].id)]
        );
      }else{
        updated=await c.query(
          'UPDATE anniversary_background_settings SET theme=$1,revision=revision+1,updated_at=now(),updated_by=$2 WHERE id=1 AND revision=$3 RETURNING theme,revision',
          [theme,String(auth.rows[0].id),revision]
        );
      }
      if(!updated.rowCount){
        await c.query('ROLLBACK');
        return fail(res,409,'SETTING_CHANGED_RELOAD');
      }
      await c.query(
        "INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,'background_update','anniversary_background','success')",
        [auth.rows[0].id]
      );
      await c.query('COMMIT');
      return res.status(200).json({ok:true,theme:updated.rows[0].theme,revision:updated.rows[0].revision});
    }catch(e){
      await c.query('ROLLBACK');
      throw e;
    }
  }catch(e){
    console.error('background settings:',e?.code||'error');
    return fail(res,503,'BACKGROUND_SERVICE_ERROR');
  }finally{
    c?.release();
    await pool.end();
  }
}
