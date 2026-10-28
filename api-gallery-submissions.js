// vNext: independently gated fan-art intake and approval.
// No schema creation, no GAS/participant writes, and no direct file uploads.
import pg from 'pg';
import {createHash,createHmac} from 'node:crypto';
import {approvedGalleryItems} from './gallery-items.js';
import {secureWorkUrl,validateGallerySubmission,validateMediaAdminItem,reviewTransition} from './gallery-submissions-core.js';
const {Pool}=pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const reply=(res,code,data)=>res.status(code).json(data);
const fail=(res,code,label)=>reply(res,code,{ok:false,code:label});
const sha=value=>createHash('sha256').update(value).digest('hex');
const cookie=(req,key)=>{
 const p=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='));
 try{return p?decodeURIComponent(p.slice(key.length+1)):''}catch{return ''}
};
const adminIdentity=async(c,req)=>{
 const token=cookie(req,'mio_gallery_session'),device=cookie(req,'mio_gallery_device');
 if(!/^[A-Za-z0-9_-]{40,64}$/.test(token)||!/^[A-Za-z0-9_-]{40,64}$/.test(device))return null;
 const q=await c.query(`SELECT u.id FROM gallery_admin_sessions s
 JOIN gallery_admin_users u ON u.id=s.user_id
 JOIN gallery_admin_devices d ON d.id=s.device_id
 WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL
 AND u.status='active' AND u.role IN ('owner','admin')
 AND d.user_id=u.id AND d.device_public_id=$2 AND d.status='approved'
 LIMIT 1`,[sha(token),sha(device)]);
 return q.rows[0]||null;
};
const enabled=()=>process.env.MIO_GALLERY_SUBMISSIONS_ENABLED==='true'&&
 typeof process.env.GALLERY_DATABASE_URL==='string'&&
 String(process.env.GALLERY_SUBMISSION_RATE_SECRET||'').length>=32;
const sourceHash=req=>{
 const raw=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim().slice(0,128);
 return createHmac('sha256',process.env.GALLERY_SUBMISSION_RATE_SECRET).update(raw).digest('hex');
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Vary','Cookie');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return fail(res,405,'METHOD_NOT_ALLOWED');}
 if(req.headers.host!==HOST)return fail(res,503,'SUBMISSION_UNAVAILABLE');
 const scope=req.query?.scope;
 if(req.method==='GET'&&scope!=='admin'&&!enabled())return reply(res,200,{ok:true,open:false});
 if(!process.env.GALLERY_DATABASE_URL)return fail(res,503,'SUBMISSION_NOT_CONFIGURED');
 if(req.method==='POST'){
  if(req.headers.origin!=='https://'+HOST||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
   return fail(res,403,'ORIGIN_NOT_ALLOWED');
  const size=JSON.stringify(req.body??{}).length;
  if(size>6000||Number(req.headers['content-length']||0)>9000)return fail(res,413,'BODY_TOO_LARGE');
 }
 const pool=new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:4000});
 let c;
 try{
  c=await pool.connect();
  if(req.method==='GET'&&scope!=='admin'){
   try{
    await c.query('SELECT id FROM gallery_submissions LIMIT 0');
    return reply(res,200,{ok:true,open:enabled()});
   }catch{return reply(res,200,{ok:true,open:false});}
  }
  if(req.method==='GET'){
   const admin=await adminIdentity(c,req);
   if(!admin)return fail(res,401,'ADMIN_LOGIN_REQUIRED');
   const q=await c.query(`SELECT id,title,creator,description,category,external_url,thumbnail_url,status,revision,created_at,reviewed_at
    FROM gallery_submissions ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 100`);
   return reply(res,200,{ok:true,items:q.rows,authorized:true,authorizedDevice:true});
  }
  const action=req.body?.action;
  if(action==='apply'){
   if(!enabled())return fail(res,503,'SUBMISSION_INTAKE_CLOSED');
   const fields=validateGallerySubmission(req.body);
   if(!fields)return fail(res,400,'SUBMISSION_INVALID');
   // Existing published items are canonical and cannot be re-submitted.
   if(approvedGalleryItems.some(x=>secureWorkUrl(x.url)===fields.url))return fail(res,409,'ALREADY_PUBLISHED');
   const ipHash=sourceHash(req);
   await c.query('BEGIN');
   try{
    // Serialize per pseudonymous source to prevent simultaneous rate-limit bypass.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ipHash]);
    const q=await c.query("SELECT count(*)::int AS count FROM gallery_submissions WHERE source_hash=$1 AND created_at>now()-interval '24 hours'",[ipHash]);
    if(Number(q.rows[0].count)>=3){await c.query('ROLLBACK');return fail(res,429,'SUBMISSION_RATE_LIMIT');}
    const dup=await c.query('SELECT 1 FROM gallery_submissions WHERE lower(external_url)=lower($1) LIMIT 1',[fields.url]);
    if(dup.rowCount){await c.query('ROLLBACK');return fail(res,409,'SUBMISSION_ALREADY_RECEIVED');}
    await c.query(`INSERT INTO gallery_submissions(title,creator,description,category,external_url,consent,source_hash)
     VALUES($1,$2,$3,$4,$5,true,$6)`,[fields.title,fields.creator,fields.description,fields.category,fields.url,ipHash]);
    await c.query('COMMIT');
    return reply(res,201,{ok:true,received:true,message:'応募を受け付けました。掲載には運営の確認が必要です。'});
   }catch(e){
    await c.query('ROLLBACK').catch(()=>{});
    if(e.code==='23505')return fail(res,409,'SUBMISSION_ALREADY_RECEIVED');
    throw e;
   }
  }
  // Media curation reuses the same moderated queue, not a second gallery database.
  if(action==='mediaCreate'||action==='mediaUpdate'){
   const admin=await adminIdentity(c,req);
   if(!admin)return fail(res,401,'ADMIN_LOGIN_REQUIRED');
   const item=validateMediaAdminItem(req.body?.item);
   if(!item)return fail(res,400,'MEDIA_FIELDS_INVALID');
   if(approvedGalleryItems.some(x=>secureWorkUrl(x.url)===item.url))
    return fail(res,409,'ALREADY_PUBLISHED');
   const id=req.body?.id,revision=req.body?.revision;
   if(action==='mediaUpdate'&&
      (typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||!Number.isSafeInteger(revision)||revision<0))
    return fail(res,400,'FIELDS_INVALID');
   await c.query('BEGIN');
   try{
    let q;
    if(action==='mediaCreate'){
     q=await c.query(`INSERT INTO gallery_submissions
      (title,creator,description,category,external_url,thumbnail_url,consent,source_hash,status)
      VALUES($1,$2,$3,$4,$5,$6,true,$7,'pending')
      RETURNING id,revision,status`,
      [item.title,item.creator,item.description,item.category,item.url,item.thumbnail,sha('admin:'+admin.id)]);
    }else{
     q=await c.query(`UPDATE gallery_submissions SET
      title=$1,creator=$2,description=$3,category=$4,external_url=$5,thumbnail_url=$6,
      status='pending',revision=revision+1,reviewed_at=NULL,reviewed_by=NULL
      WHERE id=$7 AND revision=$8 AND category IN ('動画','音声・楽曲')
      RETURNING id,revision,status`,
      [item.title,item.creator,item.description,item.category,item.url,item.thumbnail,id,revision]);
    }
    if(!q.rowCount){await c.query('ROLLBACK');return fail(res,409,'MEDIA_CHANGED_RELOAD');}
    await c.query("INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,$2,$3,'success')",
     [admin.id,action==='mediaCreate'?'media_create':'media_update',String(q.rows[0].id)]);
    await c.query('COMMIT');
    return reply(res,200,{ok:true,item:q.rows[0]});
   }catch(e){
    await c.query('ROLLBACK').catch(()=>{});
    if(e.code==='23505')return fail(res,409,'SUBMISSION_ALREADY_RECEIVED');
    throw e;
   }
  }
  const transition=reviewTransition(action);
  if(!transition)return fail(res,400,'ACTION_INVALID');
  const id=req.body?.id,revision=req.body?.revision;
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||!Number.isSafeInteger(revision)||revision<0)
   return fail(res,400,'FIELDS_INVALID');
  const admin=await adminIdentity(c,req);
  if(!admin)return fail(res,401,'ADMIN_LOGIN_REQUIRED');
  await c.query('BEGIN');
  try{
   const q=await c.query(`UPDATE gallery_submissions
    SET status=$1,revision=revision+1,reviewed_at=now(),reviewed_by=$2
    WHERE id=$3 AND revision=$4 AND status=$5 RETURNING id,status,revision`,
    [transition[1],admin.id,id,revision,transition[0]]);
   if(!q.rowCount){await c.query('ROLLBACK');return fail(res,409,'SUBMISSION_CHANGED_OR_ACTION_INVALID');}
   await c.query("INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,$2,$3,'success')",
    [admin.id,'gallery_submission_'+action,id]);
   await c.query('COMMIT');
   return reply(res,200,{ok:true,item:q.rows[0]});
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
 }catch(e){
  console.error('gallery submissions:',e?.code||'error');
  return fail(res,503,'SUBMISSION_SERVICE_UNAVAILABLE');
 }finally{c?.release();await pool.end();}
}
