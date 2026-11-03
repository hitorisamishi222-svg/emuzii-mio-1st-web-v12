// DRAFT ONLY, UNROUTED. Server-side adapter for the existing MIO gallery.
// Reads one checked-out PostgreSQL client; caller must establish the
// appropriate transaction (read-only snapshot or serializable moderation)
// and verify the gallery DB identity before calling this function.
// Never sends private records to visitors, writes DB, or infers approval from
// the browser. The proposed museum_public_exhibits table is NOT yet installed.
import {approvedGalleryItems} from './gallery-items.js';
import {createHash} from 'node:crypto';

const ID=/^[a-z0-9-]{3,70}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KINDS=Object.freeze({gallery:'ギャラリー',icons:'イラスト',moments:'その他',events:'その他'});
const STATUS=new Set(['draft','published','hidden','trash']);
const fail=code=>{throw Error('MUSEUM_SOURCE_'+code)};
const rows=(r,max)=>{
 if(!r||r.command!=='SELECT'||!Number.isSafeInteger(r.rowCount)||
    r.rowCount<0||r.rowCount>max||!Array.isArray(r.rows)||
    r.rows.length!==r.rowCount)fail('READ_UNVERIFIED');
 return r.rows;
};
const text=(v,max)=>typeof v==='string'&&v.length<=max&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const checkedTime=x=>x instanceof Date?Number.isFinite(x.getTime()):
 typeof x==='string'&&x.length>0&&Number.isFinite(Date.parse(x));
const iso=x=>{
 if(!checkedTime(x))fail('REVIEW_VERSION_UNVERIFIED');
 return new Date(x).toISOString();
};
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rev=x=>{
 const n=typeof x==='string'&&/^(0|[1-9]\d*)$/.test(x)?Number(x):x;
 if(!Number.isSafeInteger(n)||n<0)fail('REVIEW_VERSION_UNVERIFIED');
 return n;
};
const catalogEntry=(item)=>({
 id:item.id,title:item.title,creator:item.creator,
 description:item.description??'',category:item.category,room:item.room??'gallery',
 thumbnail:item.thumbnail??'',url:item.url,
 hidden:item.hidden===true,deleted:item.deleted===true
});
// A moderation/catalog bridge is never an editor. Keep record IDs so a
// curator's saved ordering can still be validated, but redact the entire
// nonpublic work before it reaches a public-read projection or error trace.
// This is an in-memory view only: original DB rows and backups are retained.
const redactNonpublic=item=>
 item.hidden||item.deleted?{
  id:item.id,title:'非公開の展示',creator:'翠央記念館',
  description:'',category:item.category,room:item.room,thumbnail:'',url:'',
  hidden:true,deleted:item.deleted===true
 }:item;

export async function loadMuseumModeratedCatalogStage(client,{lockModeration=false}={}){
 if(!client||typeof client.query!=='function')fail('DEDICATED_CLIENT_REQUIRED');
 if(typeof lockModeration!=='boolean')fail('LOCK_MODE_INVALID');
 // A READ ONLY transaction cannot run SELECT ... FOR SHARE. Management
 // transactions should request a share lock; read-only visitor snapshots
 // get consistent results from REPEATABLE READ without locking rows.
 const lockClause=lockModeration?' FOR SHARE':'';
 // This import is an explicit *reviewed static allowlist*, not blanket
 // approval for unknown DB records or unreviewed uploads.
 if(!Array.isArray(approvedGalleryItems)||approvedGalleryItems.length>500)
  fail('STATIC_ALLOWLIST_INVALID');
 const staticIds=new Set();
 for(const item of approvedGalleryItems){
  if(!item||!ID.test(item.id||'')||staticIds.has(item.id)||
     typeof item.hidden!=='boolean'||!text(item.title,120)||
     !text(item.creator,80)||!text(item.description??'',2000)||
     !text(item.category,40)||!text(item.thumbnail??'',1024)||
     !text(item.url,2048))fail('STATIC_ALLOWLIST_INVALID');
  staticIds.add(item.id);
 }
 // Explicit column list: do not read tokens, device identifiers, audit
 // payloads or participant information from unrelated tables.
 const overrides=rows(await client.query(
  'SELECT item_id,title,creator,description,category,external_url,'+
  'thumbnail_url,hidden,deleted,revision,updated_at FROM gallery_live_overrides '+
  'WHERE item_id=ANY($1::text[])'+lockClause,
  [[...staticIds]]
 ),500);
 const byId=new Map();
 for(const row of overrides){
  if(!row||!staticIds.has(row.item_id)||byId.has(row.item_id)||
     typeof row.hidden!=='boolean'||typeof row.deleted!=='boolean')
   fail('OVERRIDE_INVALID');
  for(const [field,max] of [
   ['title',120],['creator',80],['description',2000],
   ['category',40],['external_url',2048],['thumbnail_url',1024]
  ])if(row[field]!==null&&!text(row[field],max))fail('OVERRIDE_INVALID');
  byId.set(row.item_id,row);
 }
 const currentReviewHashes=Object.create(null);
 const catalog=approvedGalleryItems.map(base=>{
  const row=byId.get(base.id);
  const get=(column,fallback)=>row?.[column]??fallback;
  const entry=redactNonpublic(catalogEntry({
   ...base,
   title:get('title',base.title),creator:get('creator',base.creator),
   description:get('description',base.description??''),
   category:get('category',base.category),
   url:get('external_url',base.url),
   thumbnail:get('thumbnail_url',base.thumbnail??''),
   hidden:base.hidden||row?.hidden===true,
   deleted:row?.deleted===true
  }));
  if(!entry.hidden&&!entry.deleted){
   // A changed override timestamp creates a new approval generation after
   // hide/review/restore. The future writer MUST update this atomically.
   currentReviewHashes[base.id]=sha([
    'reviewed-legacy-v1',base.id,
    row?rev(row.revision):0,row?iso(row.updated_at):'reviewed-static',
    entry.title,entry.category,entry.thumbnail,entry.url,entry.creator,
    entry.description
   ]);
  }
  return entry;
 });
 // New museum records are deliberately distinct from the legacy gallery:
 // every record has a stable namespace; no overwrite of an old ID.
 const exhibits=rows(await client.query(
  'SELECT id,kind,title,description,credit,image_url,external_url,'+
  'status,revision,updated_at,rights_checked_at,privacy_checked_at,reviewed_by,published_at '+
  'FROM museum_public_exhibits ORDER BY created_at,id LIMIT 501'+lockClause,[]
 ),500);
 const approvedIds=approvedGalleryItems.map(item=>item.id);
 const seen=new Set(staticIds);
 for(const row of exhibits){
  if(!row||!UUID.test(row.id||'')||!Object.hasOwn(KINDS,row.kind)||
     !STATUS.has(row.status)||!text(row.title,120)||!row.title.trim()||
     !text(row.description,2000)||!text(row.credit,80)||
     !text(row.image_url,1024)||!text(row.external_url,2048))
   fail('EXHIBIT_INVALID');
  const id='museum-'+row.id.toLowerCase();
  if(!ID.test(id)||seen.has(id))fail('EXHIBIT_DUPLICATE');
  seen.add(id);
  const reviewed=row.status==='published'&&
   checkedTime(row.rights_checked_at)&&checkedTime(row.privacy_checked_at)&&
   checkedTime(row.published_at)&&typeof row.reviewed_by==='string'&&UUID.test(row.reviewed_by);
  // A stored 'published' state without a complete rights/privacy trail is
  // invalid; never silently manufacture that approval.
  if(row.status==='published'&&!reviewed)fail('EXHIBIT_REVIEW_UNVERIFIED');
  const item={
   id,title:row.title,creator:row.credit||'翠央記念館',
   description:row.description,category:KINDS[row.kind],room:row.kind,
   thumbnail:row.image_url,url:row.external_url||row.image_url||'',
   hidden:!reviewed,deleted:row.status==='trash'
  };
  catalog.push(Object.freeze(redactNonpublic(item)));
  if(reviewed){
   // A new approved version cannot silently inherit a historic grant.
   currentReviewHashes[id]=sha([
    'reviewed-museum-v1',id,rev(row.revision),iso(row.updated_at),
    iso(row.rights_checked_at),iso(row.privacy_checked_at),
    iso(row.published_at),row.reviewed_by.toLowerCase(),
    row.kind,row.title,row.description,row.credit,row.image_url,row.external_url
   ]);
   approvedIds.push(id);
  }
 }
 return Object.freeze({
  sourceVerified:true,
  // This marker is supplied only after both legacy and museum moderation
  // tables were read with FOR SHARE in the same supplied transaction client.
  mutationReadLocked:lockModeration,
  catalog:Object.freeze(catalog.map(i=>Object.freeze(i))),
  verifiedApprovedIds:Object.freeze(approvedIds),
  currentReviewHashes:Object.freeze(currentReviewHashes)
 });
}
