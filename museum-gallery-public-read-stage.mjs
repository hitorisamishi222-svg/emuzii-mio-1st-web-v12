// Draft-only museum gallery read model. NOT a public route or live deployment.
// The caller MUST supply a checked-out dedicated pg client and a preflight-
// verified gallery database. The candidate tables are not yet installed.
// Never fall back to unverified static items, old draft metadata, or public
// preview files if the DB is missing or moderation cannot be read.
import {loadMuseumModeratedCatalogStage} from './museum-gallery-source-stage.mjs';
import {projectPublishedMuseumGallery} from './museum-gallery-published-core.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=code=>{throw Error('MUSEUM_READ_'+code)};
const revision=x=>{
 if(typeof x==='number'&&Number.isSafeInteger(x)&&x>=0)return x;
 if(typeof x==='string'&&/^(0|[1-9]\d*)$/.test(x)){
  const n=Number(x);if(Number.isSafeInteger(n))return n;
 }
 fail('REVISION_INVALID');
};
const empty=()=>Object.freeze({published:false,revision:null,items:Object.freeze([])});

export async function readPublishedMuseumGalleryStage(client){
 if(!client||typeof client.query!=='function')fail('DEDICATED_CLIENT_REQUIRED');
 let begun=false;
 try{
  // All catalog and layout reads use one consistent database snapshot.
  const begin=await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(begin?.command!=='BEGIN')fail('BEGIN_UNVERIFIED');
  begun=true;
  const response=await client.query(
   "SELECT published_revision,published_from_draft_revision,published_order,"+
   "published_visible_ids,published_featured_id,published_by,published_at "+
   "FROM museum_gallery_layout_stage WHERE layout_key='main' LIMIT 2",[]
  );
  if(!response||response.command!=='SELECT'||![0,1].includes(response.rowCount)||
     !Array.isArray(response.rows)||response.rows.length!==response.rowCount)
   fail('LAYOUT_READ_UNVERIFIED');
  let result;
  if(response.rowCount===0){
   result=empty();
  }else{
   const row=response.rows[0];
   if(!row||typeof row!=='object')fail('LAYOUT_ROW_INVALID');
   if(row.published_revision==null){
    if([row.published_from_draft_revision,row.published_order,
        row.published_visible_ids,row.published_featured_id,
        row.published_by,row.published_at].some(x=>x!==null))
     fail('LAYOUT_ROW_INVALID');
    result=empty();
   }else{
    const current=revision(row.published_revision);
    const sourceRev=revision(row.published_from_draft_revision);
    if(current<1||sourceRev<1||
       !Array.isArray(row.published_order)||
       !Array.isArray(row.published_visible_ids)||
       !(row.published_featured_id===null||
         typeof row.published_featured_id==='string')||
       typeof row.published_by!=='string'||!UUID.test(row.published_by)||
       !(row.published_at instanceof Date)||
       !Number.isFinite(row.published_at.getTime()))
     fail('PUBLISHED_LAYOUT_INVALID');
    // This function accesses the current moderation source only when an
    // actual published layout exists. A draft can never trigger disclosure.
    const source=await loadMuseumModeratedCatalogStage(client);
    if(source?.sourceVerified!==true)fail('MODERATION_READ_UNVERIFIED');
    result=projectPublishedMuseumGallery({
     authoritativeCatalog:source.catalog,
     verifiedApprovedIds:source.verifiedApprovedIds,
     sourceVerified:source.sourceVerified,
     publishedLayout:{
      revision:current,order:row.published_order,
      visibleIds:row.published_visible_ids,featuredId:row.published_featured_id
     }
    });
   }
  }
  const committed=await client.query('COMMIT');
  if(committed?.command!=='COMMIT')fail('READ_COMMIT_UNCONFIRMED');
  begun=false;
  return result;
 }catch(error){
  if(begun){
   try{await client.query('ROLLBACK')}
   catch{fail('READ_ROLLBACK_UNCONFIRMED')}
  }
  throw error;
 }
}
