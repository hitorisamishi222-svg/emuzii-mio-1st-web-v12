import pg from 'pg';
import { approvedGalleryItems } from './gallery-items.js';
const { Pool } = pg;

// Server-side catalog: the database is authoritative for any takedown.
// Never fall back to static entries when the moderation database is unavailable.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});}
 if(!process.env.GALLERY_DATABASE_URL)return res.status(503).json({ok:false,code:'GALLERY_SERVICE_UNAVAILABLE'});
 const pool=new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1,connectionTimeoutMillis:4000});
 try{
  const ids=approvedGalleryItems.map(i=>i.id);
  if(ids.some(id=>typeof id!=='string'))return res.status(503).json({ok:false,code:'CATALOG_ID_MISSING'});
  const result=await pool.query('SELECT item_id,title,creator,description,category,external_url,thumbnail_url,hidden,deleted FROM gallery_live_overrides WHERE item_id=ANY($1::text[])',[ids]);
  const overrides=new Map(result.rows.map(row=>[row.item_id,row]));
  const items=approvedGalleryItems.flatMap(item=>{
   const row=overrides.get(item.id);
   if(row?.hidden||row?.deleted||(!row&&item.hidden))return [];
   const merged={...item};
   for(const [db,key] of [['title','title'],['creator','creator'],['description','description'],['category','category'],['external_url','url'],['thumbnail_url','thumbnail']]){
    if(row&&row[db]!==null)merged[key]=row[db];
   }
   delete merged.hidden;
   return [merged];
  });
  // New user submissions are excluded until the separate owner-approved
  // migration and publication flag are both explicitly enabled.
  if(process.env.MIO_GALLERY_SUBMISSIONS_PUBLISH_ENABLED==='true'){
   const published=await pool.query(`SELECT id,title,creator,description,category,external_url
     FROM gallery_submissions WHERE status='approved' ORDER BY reviewed_at DESC,id DESC LIMIT 100`);
   const submitted=published.rows.map(row=>({
    id:'fanart-'+row.id,title:row.title,creator:row.creator,
    description:row.description,category:row.category,url:row.external_url,
    thumbnail:''
   }));
   items.unshift(...submitted);
  }
  return res.status(200).json({ok:true,items});
 }catch(e){
  console.error('gallery catalog:',e?.code||e?.message||'error');
  return res.status(503).json({ok:false,code:'GALLERY_SERVICE_UNAVAILABLE'});
 }finally{await pool.end()}
}
