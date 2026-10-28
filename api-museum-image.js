// One-step museum picture + draft save. Public exhibits only; never a private vault.
import pg from 'pg';
import {put,del} from '@vercel/blob';
import {randomUUID} from 'node:crypto';
import {validateArchiveExhibit} from './museum-exhibits-core.js';
import {sessionAdmin} from './api-museum-exhibits.js';

const HOST='emuzii-mio-1st-web-v12.vercel.app';
const {Pool}=pg;
const MAX_BYTES=750_000;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const say=(res,status,code)=>res.status(status).json({ok:false,code});
const ownedBlob=value=>{
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&u.username===''&&u.password===''&&u.search===''&&u.hash===''&&
   /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname)&&
   /^\/mio-museum\/[0-9a-f-]{36}\.(?:webp|jpg)$/i.test(u.pathname);
 }catch{return false;}
};
export function inspectDraftImage(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 if(input.format!=='webp'&&input.format!=='jpeg')return null;
 if(typeof input.base64!=='string'||input.base64.length<40||input.base64.length>1_100_000||!/^([A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))return null;
 const bytes=Buffer.from(input.base64,'base64');
 if(bytes.length<32||bytes.length>MAX_BYTES)return null;
 const webp=bytes.length>16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length;
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
 if(input.format==='webp'?!webp:!jpeg)return null;
 return {bytes,ext:input.format==='webp'?'webp':'jpg',mime:input.format==='webp'?'image/webp':'image/jpeg'};
}
export function createImageHandler(deps={}){
 const PoolClass=deps.PoolClass||Pool;
 const upload=deps.putBlob||put;
 const remove=deps.delBlob||del;
 const verify=deps.verifyAdmin||sessionAdmin;
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Vary','Cookie');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return say(res,405,'METHOD_NOT_ALLOWED');}
  if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return say(res,403,'ORIGIN_INVALID');
  // Upload and archive editing must both be explicitly opted in.
  if(process.env.MIO_MUSEUM_IMAGE_UPLOAD_ENABLED!=='true'||process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED!=='true')
   return say(res,503,'IMAGE_UPLOAD_CLOSED');
  if(!process.env.GALLERY_DATABASE_URL||!process.env.BLOB_READ_WRITE_TOKEN)return say(res,503,'MEDIA_STORAGE_UNAVAILABLE');
  let size;
  try{size=JSON.stringify(req.body??{}).length;}catch{return say(res,400,'BODY_INVALID');}
  if(size>1_300_000||Number(req.headers['content-length']||0)>1_500_000)return say(res,413,'BODY_TOO_LARGE');
  const {action,item:raw,image:rawImage,id,revision}=req.body||{};
  if(action!=='imageCreate'&&action!=='imageUpdate')return say(res,400,'ACTION_INVALID');
  if(action==='imageUpdate'&&(!ID.test(String(id||''))||!Number.isSafeInteger(revision)||revision<0))return say(res,400,'REVISION_INVALID');
  const image=inspectDraftImage(rawImage);
  if(!image)return say(res,400,'IMAGE_FORMAT_OR_SIZE_INVALID');
  // Use a local placeholder only while validating metadata. It never reaches DB.
  const item=validateArchiveExhibit({...raw,imageUrl:'/assets/museum-draft-upload.webp'});
  if(!item)return say(res,400,'EXHIBIT_INVALID');
  const pool=new PoolClass({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:4000});
  let c,createdUrl=null,committed=false,commitAttempted=false;
  try{
   c=await pool.connect();
   const admin=await verify(c,req);
   if(!admin)return say(res,401,'ADMIN_LOGIN_REQUIRED');
   if(admin.role!=='owner')return say(res,403,'MUSEUM_OWNER_ONLY');
   await c.query('BEGIN');
   try{
    if(action==='imageUpdate'){
     const current=await c.query('SELECT revision FROM museum_public_exhibits WHERE id=$1 FOR UPDATE',[id]);
     if(!current.rowCount||Number(current.rows[0].revision)!==revision){
      await c.query('ROLLBACK');return say(res,409,'EXHIBIT_CHANGED_RELOAD');
     }
    }
    const pathname='mio-museum/'+randomUUID()+'.'+image.ext;
    const stored=await upload(pathname,image.bytes,{
     access:'public',contentType:image.mime,addRandomSuffix:false,cacheControlMaxAge:60
    });
    if(!stored?.url||!ownedBlob(stored.url))throw Error('STORAGE_RETURNED_INVALID_URL');
    createdUrl=stored.url;
    let result;
    if(action==='imageCreate'){
     result=await c.query(
      `INSERT INTO museum_public_exhibits
       (kind,title,description,credit,occurred_on,image_url,external_url,
        status,rights_checked_at,privacy_checked_at,reviewed_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,'draft',now(),now(),$8)
       RETURNING id,status,revision`,
      [item.kind,item.title,item.description,item.credit,item.occurredOn,
       createdUrl,item.externalUrl,admin.id]
     );
    }else{
     result=await c.query(
      `UPDATE museum_public_exhibits SET
       kind=$1,title=$2,description=$3,credit=$4,occurred_on=$5,image_url=$6,external_url=$7,
       status='draft',revision=revision+1,rights_checked_at=now(),
       privacy_checked_at=now(),reviewed_by=$8,published_at=NULL,updated_at=now()
       WHERE id=$9 AND revision=$10 RETURNING id,status,revision`,
      [item.kind,item.title,item.description,item.credit,item.occurredOn,
       createdUrl,item.externalUrl,admin.id,id,revision]
     );
    }
    if(!result.rowCount){await c.query('ROLLBACK');return say(res,409,'EXHIBIT_CHANGED_RELOAD');}
    await c.query(
     "INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,$2,$3,'success')",
     [admin.id,'museum_'+(action==='imageCreate'?'image_created':'image_replaced'),String(result.rows[0].id)]
    );
    // Once COMMIT is sent, a network error leaves the DB result uncertain.
    // Never delete the new Blob until reconciliation confirms it was not committed.
    commitAttempted=true;
    await c.query('COMMIT');committed=true;
    return res.status(200).json({ok:true,exhibit:{
     id:String(result.rows[0].id),status:'draft',revision:Number(result.rows[0].revision),
     imageUrl:createdUrl
    }});
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
  }catch(e){
   console.error('museum image draft:',e?.code||'error');
   return say(res,503,'MUSEUM_IMAGE_SAVE_FAILED');
  }finally{
   c?.release();
   await pool.end().catch(()=>{});
   // If DB write/audit failed, remove the NEW image. Never remove existing galleries.
   if(createdUrl&&!committed&&!commitAttempted)await remove(createdUrl).catch(()=>{});
   // Previous image is intentionally retained until a separate reviewed cleanup process.
  }
 };
}
export default createImageHandler();