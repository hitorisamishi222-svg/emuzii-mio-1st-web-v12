// Owner-only, read-only museum asset reference audit.
// This endpoint NEVER deletes blobs or changes exhibits.
import pg from 'pg';
import {list} from '@vercel/blob';
import {sessionAdmin} from './api-museum-exhibits.js';
import {ownedBlob} from './api-museum-image.js';
const {Pool}=pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const fail=(res,status,code)=>res.status(status).json({ok:false,code});
export function createMuseumAssetReviewHandler(deps={}){
 const PoolClass=deps.PoolClass||Pool;
 const listing=deps.listBlob||list;
 const authorized=deps.verifyAdmin||sessionAdmin;
 return async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Vary','Cookie');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return fail(res,405,'METHOD_NOT_ALLOWED');}
  if(req.headers.host!==HOST)return fail(res,503,'ADMIN_HOST_UNAVAILABLE');
  if(process.env.MIO_MUSEUM_ASSET_REVIEW_ENABLED!=='true')return fail(res,503,'ASSET_REVIEW_CLOSED');
  if(!process.env.GALLERY_DATABASE_URL||!process.env.BLOB_READ_WRITE_TOKEN)
   return fail(res,503,'ASSET_STORAGE_NOT_CONFIGURED');
  const cursor=req.query?.cursor??'';
  if(typeof cursor!=='string'||cursor.length>1024)return fail(res,400,'CURSOR_INVALID');
  const pool=new PoolClass({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:4000});
  let c;
  try{
   c=await pool.connect();
   const admin=await authorized(c,req);
   if(!admin)return fail(res,401,'ADMIN_LOGIN_REQUIRED');
   if(admin.role!=='owner')return fail(res,403,'MUSEUM_OWNER_ONLY');
   const page=await listing({prefix:'mio-museum/',limit:50,...(cursor?{cursor}:{})});
   if(!page||!Array.isArray(page.blobs))throw Error('LIST_INVALID');
   // List only files created by this museum implementation; ignore other Blob buckets.
   const blobs=page.blobs.filter(x=>x&&typeof x.url==='string'&&ownedBlob(x.url)).slice(0,50);
   const urls=blobs.map(x=>x.url);
   let referenced=new Map();
   if(urls.length){
    // A failed cross-reference query must NOT be reported as zero references.
    const q=await c.query(
     `SELECT image_url AS url,'museum' AS source
       FROM museum_public_exhibits WHERE image_url=ANY($1::text[])
       UNION ALL
       SELECT thumbnail_url AS url,'gallery' AS source
       FROM gallery_live_overrides WHERE thumbnail_url=ANY($1::text[])`,[urls]
    );
    for(const row of q.rows){
     const count=referenced.get(row.url)||{museum:0,gallery:0};
     if(row.source==='museum'||row.source==='gallery')count[row.source]++;
     referenced.set(row.url,count);
    }
   }
   const items=blobs.map(blob=>{
    const refs=referenced.get(blob.url)||{museum:0,gallery:0};
    const used=refs.museum+refs.gallery>0;
    return {
     url:blob.url,uploadedAt:blob.uploadedAt??null,
     size:Number.isSafeInteger(blob.size)&&blob.size>=0?blob.size:null,
     references:refs,
     reviewStatus:used?'referenced':'manual_review_required'
    };
   });
   return res.status(200).json({
    ok:true,items,hasMore:page.hasMore===true,
    cursor:page.hasMore===true&&typeof page.cursor==='string'?page.cursor:null,
    note:'A missing live reference is NOT proof that a file is safe to delete. Historical links and backups also require review.',
    deletionEnabled:false
   });
  }catch(e){
   console.error('museum asset audit:',e?.code||'error');
   return fail(res,503,'ASSET_REVIEW_UNAVAILABLE');
  }finally{c?.release();await pool.end().catch(()=>{});}
 };
}
export default createMuseumAssetReviewHandler();