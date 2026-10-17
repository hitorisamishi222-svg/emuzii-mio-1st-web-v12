import {randomBytes} from 'node:crypto';
import {put} from '@vercel/blob';
import {approvedGalleryItems} from './gallery-items.js';
import {db,fail,checkOrigin,verifyGalleryAdmin} from './gallery-auth-shared.js';

const CATEGORIES=new Set(['動画','イラスト','音声・楽曲','ファンアート','その他']);
const canon='emuzii-mio-1st-web-v12.vercel.app';
const validId=id=>typeof id==='string'&&/^[a-z0-9-]{3,70}$/.test(id);
const title=(s,max,required)=>{if(typeof s!=='string'||s.length>max)throw Error('INVALID_TEXT');const v=s.trim();if(required&&!v)throw Error('REQUIRED_TEXT');return v;};
const link=s=>{
 if(typeof s!=='string'||s.length>2048)throw Error('INVALID_URL');
 if(/^\/(?!\/)[A-Za-z0-9_./-]+$/.test(s)&&!s.includes('..'))return s;
 const u=new URL(s);
 if(u.protocol!=='https:'||u.username||u.password||u.href.length>2048)throw Error('INVALID_URL');
 return u.href;
};
const image=s=>{
 if(s==='')return '';
 if(typeof s!=='string'||s.length>2048)throw Error('INVALID_IMAGE_URL');
 if(/^\/assets\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(s)&&!s.includes('..'))return s;
 const u=new URL(s);
 if(u.protocol!=='https:'||u.username||u.password||!u.hostname.endsWith('.public.blob.vercel-storage.com')||!/\.(?:png|jpe?g|webp)$/i.test(u.pathname))throw Error('INVALID_IMAGE_URL');
 return u.href;
};
const mediaType={
 'image/png':'png',
 'image/jpeg':'jpg',
 'image/webp':'webp'
};
function checkMagic(b,mime){
 if(mime==='image/png')return b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==='image/jpeg')return b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255;
 if(mime==='image/webp')return b.length>=16&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 return false;
}
async function saveOperation(c,auth,action,body){
 const id=body.itemId,base=approvedGalleryItems.find(x=>x.id===id);
 if(!validId(id)||!base)throw Error('ITEM_NOT_FOUND');
 const expected=body.expectedRevision;
 if(!Number.isSafeInteger(expected)||expected<0)throw Error('INVALID_REVISION');
 await c.query('BEGIN');
 try{
  const q=await c.query('SELECT * FROM gallery_live_overrides WHERE item_id=$1 FOR UPDATE',[id]);
  const prev=q.rows[0],revision=Number(prev?.revision||0);
  if(revision!==expected)throw Error('VERSION_CONFLICT');
  const item={
   title:prev?.title??base.title,creator:prev?.creator??base.creator,
   description:prev?.description??base.description??'',category:prev?.category??base.category,
   url:prev?.external_url??base.url,thumbnail:prev?.thumbnail_url??base.thumbnail??'',
   hidden:Boolean(prev?.hidden??base.hidden),deleted:Boolean(prev?.deleted)
  };
  if(action==='save'){
   const value=body.fields;
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_FIELDS');
   item.title=title(value.title,120,true);
   item.creator=title(value.creator,80,true);
   item.description=title(value.description,1200,false);
   if(!CATEGORIES.has(value.category))throw Error('INVALID_CATEGORY');
   item.category=value.category;
   item.url=link(value.url);
   item.thumbnail=image(value.thumbnail);
  }else if(action==='hide'){item.hidden=true;}
  else if(action==='show'){if(item.deleted)throw Error('RESTORE_FIRST');item.hidden=false;}
  else if(action==='delete'){item.hidden=true;item.deleted=true;}
  else if(action==='restore'){item.hidden=false;item.deleted=false;}
  else throw Error('INVALID_ACTION');
  const params=[id,item.title,item.creator,item.description,item.category,item.url,item.thumbnail,item.hidden,item.deleted,revision+1,auth.user_id];
  if(prev){
   const up=await c.query(`UPDATE gallery_live_overrides SET title=$2,creator=$3,description=$4,category=$5,external_url=$6,thumbnail_url=$7,hidden=$8,deleted=$9,revision=$10,updated_by=$11,updated_at=now() WHERE item_id=$1 RETURNING revision`,params);
   if(!up.rowCount)throw Error('UPDATE_FAILED');
  }else{
   await c.query(`INSERT INTO gallery_live_overrides(item_id,title,creator,description,category,external_url,thumbnail_url,hidden,deleted,revision,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,params);
  }
  await c.query("INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,$2,$3,'success')",[auth.user_id,'gallery_'+action,id]);
  await c.query('COMMIT');
  return {ok:true,itemId:id,revision:revision+1,hidden:item.hidden,deleted:item.deleted};
 }catch(e){
  await c.query('ROLLBACK');
  throw e;
 }
}
async function upload(c,auth,body){
 const {itemId,mime,base64}=body;
 if(!approvedGalleryItems.some(x=>x.id===itemId))throw Error('ITEM_NOT_FOUND');
 if(!mediaType[mime]||typeof base64!=='string'||base64.length>2_900_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('INVALID_IMAGE');
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length<100||bytes.length>2*1024*1024||!checkMagic(bytes,mime))throw Error('INVALID_IMAGE');
 if(!process.env.BLOB_READ_WRITE_TOKEN)throw Error('UPLOAD_NOT_CONFIGURED');
 const count=await c.query("SELECT count(*) AS n FROM gallery_admin_audit WHERE actor_id=$1 AND action='gallery_thumbnail_upload' AND occurred_at>now()-interval '1 hour'",[auth.user_id]);
 if(Number(count.rows[0].n)>=15)throw Error('UPLOAD_RATE_LIMIT');
 const key='gallery/'+itemId+'/'+randomBytes(12).toString('hex')+'.'+mediaType[mime];
 const result=await put(key,bytes,{access:'public',contentType:mime,addRandomSuffix:false});
 await c.query("INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,'gallery_thumbnail_upload',$2,'success')",[auth.user_id,itemId]);
 return {ok:true,thumbnail:result.url};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Vary','Cookie');
 if(req.headers.host!==canon)return fail(res,403,'ORIGIN_NOT_ALLOWED');
 if(req.method==='GET')return res.status(200).json({ok:true,enabled:process.env.GALLERY_MODERATION_ENABLED==='true',requiresAdmin:true});
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return fail(res,405,'METHOD_NOT_ALLOWED');}
 if(!checkOrigin(req))return fail(res,403,'REQUEST_ORIGIN_INVALID');
 if(Number(req.headers['content-length']||0)>3_500_000)return fail(res,413,'BODY_TOO_LARGE');
 // Pause remains in effect while shared identity and approved-device sign-in are redesigned.
 if(process.env.GALLERY_MODERATION_ENABLED!=='true')return fail(res,503,'GALLERY_MODERATION_PAUSED');
 if(!process.env.GALLERY_DATABASE_URL)return fail(res,503,'DATABASE_NOT_CONFIGURED');
 const action=req.body?.action;
 if(!['list','save','hide','show','delete','restore','upload'].includes(action))return fail(res,400,'INVALID_ACTION');
 const pool=db();let c;
 try{
  c=await pool.connect();
  const auth=await verifyGalleryAdmin(c,req);
  if(!auth)return fail(res,403,'ADMIN_DEVICE_AUTH_REQUIRED');
  if(action==='list'){
   const q=await c.query('SELECT * FROM gallery_live_overrides ORDER BY item_id');
   const byId=new Map(q.rows.map(row=>[row.item_id,row]));
   const items=approvedGalleryItems.map(item=>{
    const v=byId.get(item.id);return {
     ...item,
     title:v?.title??item.title,creator:v?.creator??item.creator,
     description:v?.description??item.description??'',category:v?.category??item.category,
     url:v?.external_url??item.url,thumbnail:v?.thumbnail_url??item.thumbnail??'',
     hidden:Boolean(v?.hidden??item.hidden),deleted:Boolean(v?.deleted),
     revision:Number(v?.revision||0)
    };
   });
   return res.status(200).json({ok:true,items,role:auth.role});
  }
  if(action==='upload'){
   const result=await upload(c,auth,req.body);
   return res.status(200).json(result);
  }
  const result=await saveOperation(c,auth,action,req.body);
  return res.status(200).json(result);
 }catch(e){
  const known=new Set(['INVALID_TEXT','REQUIRED_TEXT','INVALID_URL','INVALID_IMAGE_URL','INVALID_FIELDS','INVALID_CATEGORY','INVALID_REVISION','ITEM_NOT_FOUND','INVALID_ACTION','INVALID_IMAGE','UPLOAD_RATE_LIMIT','RESTORE_FIRST','VERSION_CONFLICT','UPLOAD_NOT_CONFIGURED']);
  const code=known.has(e?.message)?e.message:'GALLERY_UPDATE_FAILED';
  console.error('Gallery management:',code);
  return fail(res,code==='VERSION_CONFLICT'?409:code==='ITEM_NOT_FOUND'?404:code==='GALLERY_UPDATE_FAILED'?503:400,code);
 }finally{c?.release();await pool.end();}
}
