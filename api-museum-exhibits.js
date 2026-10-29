// MIO Museum phase 2. Only public exhibits; private owner vault is a separate future system.
// Never touches GAS, participant, attendance, or gacha data and never creates tables at request time.
import pg from 'pg';
import {createHash} from 'node:crypto';
import {validateArchiveExhibit} from './museum-exhibits-core.js';
const {Pool}=pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const fail=(res,status,code)=>res.status(status).json({ok:false,code});
const publishedOn=()=>process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED==='true';
const editingOn=()=>process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED==='true';
const hash=x=>createHash('sha256').update(x).digest('hex');
const cookie=(req,key)=>{
 const piece=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='));
 try{return piece?decodeURIComponent(piece.slice(key.length+1)):'';}catch{return '';}
};
export const sessionAdmin=async(connection,req)=>{
 const token=cookie(req,'mio_gallery_session'),device=cookie(req,'mio_gallery_device');
 if(!/^[A-Za-z0-9_-]{40,64}$/.test(token)||!/^[A-Za-z0-9_-]{40,64}$/.test(device))return null;
 const q=await connection.query(
  `SELECT u.id,u.role FROM gallery_admin_sessions s
   JOIN gallery_admin_users u ON u.id=s.user_id
   JOIN gallery_admin_devices d ON d.id=s.device_id
   WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL
   AND u.status='active' AND u.role IN ('owner','admin')
   AND d.user_id=u.id AND d.device_public_id=$2 AND d.status='approved'
   LIMIT 1`,
  [hash(token),hash(device)]
 );
 return q.rows[0]||null;
};
const publicRow=row=>({
 kind:row.kind,title:row.title,description:row.description,credit:row.credit,
 occurredOn:row.occurred_on?String(row.occurred_on).slice(0,10):null,
 imageUrl:row.image_url,externalUrl:row.external_url
});
const adminRow=row=>({
 ...publicRow(row),id:String(row.id),status:row.status,
 revision:Number(row.revision),createdAt:row.created_at,updatedAt:row.updated_at,
 publishedAt:row.published_at,trashedAt:row.trashed_at
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Vary','Cookie');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return fail(res,405,'METHOD_NOT_ALLOWED');}
 const scope=req.query?.scope==='admin'?'admin':'public';
 if(scope==='public'&&req.method==='GET'&&!publishedOn())
  return res.status(200).json({ok:true,items:[],open:false});
 // Admin operations never use preview hosts, even if a preview inherited production secrets.
 if((scope==='admin'||req.method==='POST')&&req.headers.host!==HOST)
  return fail(res,503,'ADMIN_HOST_UNAVAILABLE');
 if(req.method==='POST'){
  if(req.headers.origin!=='https://'+HOST||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
   return fail(res,403,'ORIGIN_INVALID');
  let size;
  try{size=JSON.stringify(req.body??{}).length;}catch{return fail(res,400,'BODY_INVALID');}
  if(size>8000||Number(req.headers['content-length']||0)>9000)return fail(res,413,'REQUEST_TOO_LARGE');
 }
 if(!process.env.GALLERY_DATABASE_URL)return fail(res,503,'MUSEUM_DB_NOT_CONFIGURED');
 const pool=new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:4000});
 let c;
 try{
  c=await pool.connect();
  if(scope==='public'&&req.method==='GET'){
   const q=await c.query(
    `SELECT kind,title,description,credit,occurred_on::text AS occurred_on,image_url,external_url
     FROM museum_public_exhibits WHERE status='published'
     ORDER BY occurred_on DESC NULLS LAST, created_at DESC LIMIT 250`
   );
   return res.status(200).json({ok:true,open:true,items:q.rows.map(publicRow)});
  }
  const admin=await sessionAdmin(c,req);
  if(!admin)return fail(res,401,'ADMIN_LOGIN_REQUIRED');
  if(admin.role!=='owner')return fail(res,403,'MUSEUM_OWNER_ONLY');
  if(req.method==='GET'){
   const q=await c.query(
    `SELECT id,kind,title,description,credit,occurred_on::text AS occurred_on,image_url,external_url,
     status,revision,created_at,updated_at,published_at,trashed_at
     FROM museum_public_exhibits
     ORDER BY updated_at DESC,id DESC LIMIT 250`
   );
   return res.status(200).json({ok:true,authorized:true,editable:editingOn(),imageUploadEnabled:editingOn()&&process.env.MIO_MUSEUM_IMAGE_UPLOAD_ENABLED==='true'&&Boolean(process.env.BLOB_READ_WRITE_TOKEN),items:q.rows.map(adminRow)});
  }
  if(!editingOn())return fail(res,503,'ARCHIVE_EDIT_CLOSED');
  const action=req.body?.action;
  if(!['create','update','publish','hide','reopen','trash','restore'].includes(action))return fail(res,400,'ACTION_INVALID');
  const item=(action==='create'||action==='update')?validateArchiveExhibit(req.body?.item):null;
  if((action==='create'||action==='update')&&!item)return fail(res,400,'EXHIBIT_INVALID');
  const id=req.body?.id,revision=req.body?.revision;
  if(action!=='create'&&(!uuid.test(String(id||''))||!Number.isSafeInteger(revision)||revision<0))
   return fail(res,400,'REVISION_INVALID');
  if(action==='publish'&&(req.body?.rightsConfirmed!==true||req.body?.privacyConfirmed!==true))
   return fail(res,400,'PUBLISH_REVIEW_REQUIRED');
  // Separately controlled opt-in: editing drafts does not authorize publication.
  if(action==='publish'&&!publishedOn())return fail(res,503,'ARCHIVE_PUBLISH_CLOSED');
  await c.query('BEGIN');
  try{
   let q;
   if(action==='create'){
    q=await c.query(
     `INSERT INTO museum_public_exhibits
      (kind,title,description,credit,occurred_on,image_url,external_url,
       status,rights_checked_at,privacy_checked_at,reviewed_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,'draft',now(),now(),$8)
      RETURNING id,status,revision`,
     [item.kind,item.title,item.description,item.credit,item.occurredOn,
      item.imageUrl,item.externalUrl,admin.id]
    );
   }else if(action==='update'){
    // Editing previously public metadata withdraws it until it is reviewed and published again.
    q=await c.query(
     `UPDATE museum_public_exhibits SET
      kind=$1,title=$2,description=$3,credit=$4,occurred_on=$5,image_url=$6,external_url=$7,
      status='draft',revision=revision+1,rights_checked_at=now(),
      privacy_checked_at=now(),reviewed_by=$8,published_at=NULL,updated_at=now()
      WHERE id=$9 AND revision=$10 AND status<>'trash'
      RETURNING id,status,revision`,
     [item.kind,item.title,item.description,item.credit,item.occurredOn,
      item.imageUrl,item.externalUrl,admin.id,id,revision]
    );
   }else if(action==='trash'){
    // Typed exhibit title + optimistic revision guard prevents accidental removal.
    const confirmed=req.body?.confirmedTitle;
    if(typeof confirmed!=='string'||!confirmed||confirmed.length>120){
     await c.query('ROLLBACK');return fail(res,400,'TRASH_CONFIRMATION_REQUIRED');
    }
    q=await c.query(
     `UPDATE museum_public_exhibits SET status='trash',trashed_at=now(),
      published_at=NULL,revision=revision+1,reviewed_by=$1,updated_at=now()
      WHERE id=$2 AND revision=$3 AND title=$4
      AND status IN ('draft','published','hidden')
      RETURNING id,status,revision`,
     [admin.id,id,revision,confirmed]
    );
   }else if(action==='restore'){
    // Restored exhibits require a new explicit publish approval.
    q=await c.query(
     `UPDATE museum_public_exhibits SET status='draft',trashed_at=NULL,
      published_at=NULL,revision=revision+1,reviewed_by=$1,updated_at=now()
      WHERE id=$2 AND revision=$3 AND status='trash'
      RETURNING id,status,revision`,
     [admin.id,id,revision]
    );
   }else{
    const transition={publish:['draft','published'],hide:['published','hidden'],reopen:['hidden','draft']}[action];
    if(!transition)throw Error('ACTION_INVALID');
    q=await c.query(
     `UPDATE museum_public_exhibits SET status=$1,revision=revision+1,
      reviewed_by=$2,updated_at=now(),
      published_at=CASE WHEN $1='published' THEN now() ELSE NULL END
      WHERE id=$3 AND revision=$4 AND status=$5
      AND rights_checked_at IS NOT NULL AND privacy_checked_at IS NOT NULL
      RETURNING id,status,revision`,
     [transition[1],admin.id,id,revision,transition[0]]
    );
   }
   if(!q.rowCount){await c.query('ROLLBACK');return fail(res,409,'EXHIBIT_CHANGED_RELOAD');}
   await c.query(
    "INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,$2,$3,'success')",
    [admin.id,'museum_exhibit_'+action,String(q.rows[0].id)]
   );
   await c.query('COMMIT');
   return res.status(200).json({ok:true,item:{id:String(q.rows[0].id),status:q.rows[0].status,revision:Number(q.rows[0].revision)}});
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
 }catch(e){
  console.error('museum public exhibitions:',e?.code||'error');
  return fail(res,503,'MUSEUM_SERVICE_UNAVAILABLE');
 }finally{c?.release();await pool.end();}
}