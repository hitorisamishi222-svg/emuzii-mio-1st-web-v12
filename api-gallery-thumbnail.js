import pg from 'pg';
import { put, del } from '@vercel/blob';
import { createHash, randomUUID } from 'node:crypto';
import { approvedGalleryItems } from './gallery-items.js';
const { Pool } = pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(res,status,code)=>res.status(status).json({ok:false,code});
const cookie=(req,name)=>{
 const part=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
 try{return part?decodeURIComponent(part.slice(name.length+1)):null}catch{return null}
};
const authorized=async(c,req)=>{
 const token=cookie(req,'mio_gallery_session'),device=cookie(req,'mio_gallery_device');
 if(!token||!device||!/^[A-Za-z0-9_-]{40,64}$/.test(token)||!/^[A-Za-z0-9_-]{40,64}$/.test(device))return null;
 const q=await c.query(`SELECT u.id,d.id AS device_id FROM gallery_admin_sessions s
 JOIN gallery_admin_users u ON u.id=s.user_id JOIN gallery_admin_devices d ON d.id=s.device_id
 WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND u.status='active'
 AND u.role IN ('owner','admin') AND d.user_id=u.id AND d.status='approved'
 AND d.device_public_id=$2 LIMIT 1`,[digest(token),digest(device)]);
 return q.rows[0]||null;
};
const ownedBlob=u=>{
 try{const p=new URL(u);return p.protocol==='https:'&&/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(p.hostname)&&/^\/mio-gallery\/[0-9a-f-]+\.webp$/.test(p.pathname)}catch{return false}
};
const validItem=value=>{
 if(!value||typeof value!=='object')return null;
 const keys=['title','creator','description','category','url'];
 if(keys.some(k=>typeof value[k]!=='string'))return null;
 const item=Object.fromEntries(keys.map(k=>[k,value[k].trim()]));
 if(!item.title||item.title.length>120||!item.creator||item.creator.length>80||item.description.length>1000||!['動画','イラスト','音声・楽曲','ファンアート','その他'].includes(item.category)||!item.url||item.url.length>2048)return null;
 const url=item.url;
 if(/^\/[A-Za-z0-9_./-]+$/.test(url)&&!url.startsWith('//')&&!url.includes('..'))return item;
 try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?item:null}catch{return null}
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(res,405,'METHOD_NOT_ALLOWED')}
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return fail(res,403,'ORIGIN_NOT_ALLOWED');
 if(!process.env.GALLERY_DATABASE_URL||!process.env.BLOB_READ_WRITE_TOKEN)return fail(res,503,'MEDIA_STORAGE_UNAVAILABLE');
 const input=req.body;
 if(!input||typeof input!=='object'||typeof input.id!=='string'||!Number.isSafeInteger(input.revision)||input.revision<0)return fail(res,400,'INVALID_REQUEST');
 const base=approvedGalleryItems.find(x=>x.id===input.id);
 if(!base)return fail(res,404,'ITEM_NOT_FOUND');
 const fields=input.saveFields===true?validItem(input.item):null;
 if(input.saveFields===true&&!fields)return fail(res,400,'FIELDS_INVALID');
 const b64=input.webp;
 if(typeof b64!=='string'||b64.length>1100000||b64.length<40||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return fail(res,400,'IMAGE_INVALID');
 const image=Buffer.from(b64,'base64');
 if(image.length<20||image.length>750000||image.toString('ascii',0,4)!=='RIFF'||image.toString('ascii',8,12)!=='WEBP')return fail(res,400,'WEBP_REQUIRED');
 const pool=new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:4000});
 let c,createdURL=null,oldURL=null,updated=false;
 try{
  c=await pool.connect();
  const admin=await authorized(c,req);
  if(!admin)return fail(res,401,'ADMIN_LOGIN_REQUIRED');
  await c.query('BEGIN');
  try{
   const q=await c.query('SELECT * FROM gallery_live_overrides WHERE item_id=$1 FOR UPDATE',[base.id]);
   const row=q.rows[0]||null;
   const rev=Number(row?.revision||0);
   if(rev!==input.revision){await c.query('ROLLBACK');return fail(res,409,'ITEM_CHANGED_RELOAD')}
   oldURL=row?.thumbnail_url??base.thumbnail??'';
   const chosen=fields||{title:row?.title??base.title,creator:row?.creator??base.creator,description:row?.description??base.description??'',category:row?.category??base.category,url:row?.external_url??base.url};
   const path='mio-gallery/'+randomUUID()+'.webp';
   const stored=await put(path,image,{access:'public',contentType:'image/webp',addRandomSuffix:false,cacheControlMaxAge:60});
   if(!stored?.url||!ownedBlob(stored.url))throw Error('BLOB_SAVE_INVALID');
   createdURL=stored.url;
   const response=await c.query(`INSERT INTO gallery_live_overrides(item_id,title,creator,description,category,external_url,thumbnail_url,hidden,deleted,revision,updated_by,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,now())
    ON CONFLICT(item_id) DO UPDATE SET
    title=EXCLUDED.title,creator=EXCLUDED.creator,description=EXCLUDED.description,
    category=EXCLUDED.category,external_url=EXCLUDED.external_url,
    thumbnail_url=EXCLUDED.thumbnail_url,revision=gallery_live_overrides.revision+1,updated_by=EXCLUDED.updated_by,updated_at=now()
    WHERE gallery_live_overrides.revision=$11
    RETURNING revision`,
   [base.id,chosen.title,chosen.creator,chosen.description,chosen.category,chosen.url,createdURL,row?.hidden??Boolean(base.hidden),row?.deleted??false,admin.id,input.revision]);
   if(!response.rowCount){await c.query('ROLLBACK');return fail(res,409,'ITEM_CHANGED_RELOAD')}
   await c.query("INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,'gallery_thumbnail_uploaded',$2,'success')",[admin.id,base.id]);
   await c.query('COMMIT');
   updated=true;
   res.status(200).json({ok:true,id:base.id,thumbnail:createdURL,revision:Number(response.rows[0].revision),item:{...chosen,id:base.id,thumbnail:createdURL,hidden:row?.hidden??Boolean(base.hidden),deleted:row?.deleted??false,revision:Number(response.rows[0].revision)}});
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}
 }catch(e){
  console.error('gallery thumbnail:',e?.code||e?.message||'error');
  if(!res.headersSent)fail(res,503,'THUMBNAIL_UPLOAD_FAILED');
 }finally{
  c?.release();await pool.end();
  // Only clean up blobs owned by this gallery integration; never delete static or third-party files.
  if(!updated&&createdURL){await del(createdURL).catch(()=>{});}
  if(updated&&oldURL&&ownedBlob(oldURL)&&oldURL!==createdURL){
   try{const check=new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1});const q=await check.query('SELECT count(*) AS usages FROM gallery_live_overrides WHERE thumbnail_url=$1',[oldURL]);await check.end();if(Number(q.rows[0].usages)===0)await del(oldURL)}catch(e){console.warn('Old thumbnail retained',e?.message)}
  }
 }
}
