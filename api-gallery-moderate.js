import pg from 'pg';
import { createHash } from 'node:crypto';
import { approvedGalleryItems } from './gallery-items.js';
const { Pool } = pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const hash=s=>createHash('sha256').update(s).digest('hex');
const error=(res,status,code)=>res.status(status).json({ok:false,code});
const cookie=(req,name)=>{
 const piece=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
 try{return piece?decodeURIComponent(piece.slice(name.length+1)):null}catch{return null}
};
const findAdmin=async(c,req)=>{
 const token=cookie(req,'mio_gallery_session'),device=cookie(req,'mio_gallery_device');
 if(!token||!device||! /^[A-Za-z0-9_-]{40,64}$/.test(token)||! /^[A-Za-z0-9_-]{40,64}$/.test(device))return null;
 const r=await c.query(`SELECT u.id,u.role,d.id AS device_id FROM gallery_admin_sessions s
 JOIN gallery_admin_users u ON s.user_id=u.id
 JOIN gallery_admin_devices d ON s.device_id=d.id
 WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL
 AND u.status='active' AND u.role IN ('owner','admin') AND d.user_id=u.id
 AND d.device_public_id=$2 AND d.status='approved' LIMIT 1`,[hash(token),hash(device)]);
 return r.rows[0]||null;
};
const merge=(item,row)=>({
 id:item.id,
 title:row?.title??item.title,
 creator:row?.creator??item.creator,
 description:row?.description??item.description??'',
 category:row?.category??item.category,
 url:row?.external_url??item.url,
 thumbnail:row?.thumbnail_url??item.thumbnail??'',
 audio:item.audio??'',
 hidden:row?.hidden??Boolean(item.hidden),
 deleted:row?.deleted??false,
 revision:Number(row?.revision??0)
});
const validLink=s=>{
 if(/^\/[A-Za-z0-9_./-]+$/.test(s)&&!s.startsWith('//')&&!s.includes('..'))return true;
 try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=2048}catch{return false}
};
const validThumbnail=s=>{
 if(s==='')return true;
 if(/^\/assets\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(s)&&!s.includes('..'))return true;
 try{
  const u=new URL(s);
  return u.protocol==='https:'&&!u.username&&!u.password&&/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname)&&u.pathname.length<=800;
 }catch{return false}
};
const validate=v=>{
 if(!v||typeof v!=='object')return null;
 const rawKeys=['title','creator','description','category','url','thumbnail'];
 if(rawKeys.some(k=>typeof v[k]!=='string'))return null;
 const data=Object.fromEntries(rawKeys.map(k=>[k,v[k].trim()]));
 if(!data.title||data.title.length>120||!data.creator||data.creator.length>80||data.description.length>1000||!['動画','イラスト','音声・楽曲','ファンアート','その他'].includes(data.category)||!data.url||data.url.length>2048||!validLink(data.url)||data.thumbnail.length>1024||!validThumbnail(data.thumbnail))return null;
 return data;
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Vary','Cookie');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return error(res,405,'METHOD_NOT_ALLOWED')}
 if(req.headers.host!==HOST||!process.env.GALLERY_DATABASE_URL)return error(res,503,'MODERATION_UNAVAILABLE');
 if(req.method==='POST'){
  if(req.headers.origin!=='https://'+HOST||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return error(res,403,'ORIGIN_INVALID');
  if(Number(req.headers['content-length']||0)>18000)return error(res,413,'REQUEST_TOO_LARGE');
 }
 const pool=new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:4000});
 let c;
 try{
  c=await pool.connect();
  const admin=await findAdmin(c,req);
  if(!admin){if(req.method==='GET')return res.status(200).json({ok:true,authorized:false,items:[]});return error(res,401,'ADMIN_LOGIN_REQUIRED');}
  if(req.method==='GET'){
   const rows=await c.query('SELECT * FROM gallery_live_overrides WHERE item_id=ANY($1::text[])',[approvedGalleryItems.map(x=>x.id)]);
   const byId=new Map(rows.rows.map(r=>[r.item_id,r]));
   const items=approvedGalleryItems.map(item=>merge(item,byId.get(item.id)));
   return res.status(200).json({ok:true,items,role:admin.role,authorized:true,authorizedDevice:true});
  }
  const body=req.body;
  const action=body?.action;
  const id=body?.id;
  const expected=body?.revision;
  if(!['update','hide','restore','delete'].includes(action))return error(res,400,'ACTION_INVALID');
  if(typeof id!=='string'||! /^[a-z0-9-]{3,70}$/.test(id))return error(res,400,'ID_INVALID');
  const original=approvedGalleryItems.find(item=>item.id===id);
  if(!original)return error(res,404,'ITEM_NOT_FOUND');
  if(!Number.isSafeInteger(expected)||expected<0)return error(res,400,'REVISION_INVALID');
  const data=action==='update'?validate(body.item):null;
  if(action==='update'&&!data)return error(res,400,'FIELDS_INVALID');
  await c.query('BEGIN');
  try{
   const q=await c.query('SELECT * FROM gallery_live_overrides WHERE item_id=$1 FOR UPDATE',[id]);
   const current=merge(original,q.rows[0]);
   if(current.revision!==expected){await c.query('ROLLBACK');return error(res,409,'ITEM_CHANGED_RELOAD')}
   const next=action==='update'?{...current,...data}:current;
   if(action==='hide')next.hidden=true;
   if(action==='restore'){next.hidden=false;next.deleted=false}
   if(action==='delete'){next.hidden=true;next.deleted=true}
   const update=await c.query(`INSERT INTO gallery_live_overrides
    (item_id,title,creator,description,category,external_url,thumbnail_url,hidden,deleted,revision,updated_by,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,now())
    ON CONFLICT(item_id) DO UPDATE SET
    title=EXCLUDED.title, creator=EXCLUDED.creator, description=EXCLUDED.description,
    category=EXCLUDED.category, external_url=EXCLUDED.external_url,
    thumbnail_url=EXCLUDED.thumbnail_url, hidden=EXCLUDED.hidden, deleted=EXCLUDED.deleted,
    revision=gallery_live_overrides.revision+1, updated_by=EXCLUDED.updated_by, updated_at=now()
    WHERE gallery_live_overrides.revision=$11
    RETURNING revision`,
   [id,next.title,next.creator,next.description,next.category,next.url,next.thumbnail,next.hidden,next.deleted,admin.id,expected]);
   if(!update.rowCount){await c.query('ROLLBACK');return error(res,409,'ITEM_CHANGED_RELOAD')}
   await c.query("INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,$2,$3,'success')",[admin.id,'gallery_'+action,id]);
   await c.query('COMMIT');
   return res.status(200).json({ok:true,item:{...next,revision:Number(update.rows[0].revision)},action});
  }catch(e){await c.query('ROLLBACK');throw e}
 }catch(e){
  console.error('gallery moderation:',e?.code||e?.message||'error');
  return error(res,503,'MODERATION_SERVICE_UNAVAILABLE');
 }finally{c?.release();await pool.end()}
}
