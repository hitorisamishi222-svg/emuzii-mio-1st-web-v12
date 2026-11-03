// INERT stage-only contract for a future one-time museum release.
// Not routed and not deployed. Proposed database tables are UNAPPLIED.
// ONLY a future protected server adapter may supply verified callbacks and a
// dedicated checked-out PostgreSQL client; passing .query alone is not proof.
// Release flags, production admin approval and rollback drills remain separate.
import {createHash} from 'node:crypto';
import {planMuseumCuration} from './museum-curation-plan.mjs';

const OP=/^[a-f0-9]{32}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw Error('MUSEUM_STAGE_'+code)};
const rev=x=>{
 if(typeof x==='number'&&Number.isSafeInteger(x)&&x>=0)return x;
 if(typeof x==='string'&&/^(0|[1-9]\d*)$/.test(x)){
  const v=Number(x);if(Number.isSafeInteger(v))return v;
 }
 fail('REVISION_UNVERIFIED');
};
const exactly=(result,n)=>{
 if(!result||result.rowCount!==n||!Array.isArray(result.rows)||
    result.rows.length!==n)fail('DATABASE_RESULT_UNVERIFIED');
 return result.rows;
};
const receiptHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const confirmText={publish:'PUBLISH_MIO_GALLERY',rollback:'RESTORE_MIO_GALLERY'};

async function changePublication(client,{action,request,operationId,expectedPublishedRevision,
 expectedDraftRevision,targetRevision,confirmation,verifyAdmin,loadModeratedCatalog}={}){
 if(!['publish','rollback'].includes(action))fail('ACTION_INVALID');
 if(!client||typeof client.query!=='function')fail('DEDICATED_CLIENT_REQUIRED');
 if(typeof verifyAdmin!=='function'||typeof loadModeratedCatalog!=='function')
  fail('SERVER_VERIFIER_REQUIRED');
 if(typeof operationId!=='string'||!OP.test(operationId))fail('OPERATION_ID_INVALID');
 if(!Number.isSafeInteger(expectedPublishedRevision)||expectedPublishedRevision<0||
    expectedPublishedRevision===Number.MAX_SAFE_INTEGER)fail('REVISION_INVALID');
 if(action==='publish'&&(!Number.isSafeInteger(expectedDraftRevision)||expectedDraftRevision<1))
  fail('DRAFT_REVISION_INVALID');
 if(action==='rollback'&&(!Number.isSafeInteger(targetRevision)||targetRevision<1))
  fail('HISTORY_REVISION_INVALID');
 if(confirmation!==confirmText[action])fail('CONFIRMATION_REQUIRED');
 let begun=false,commitAttempted=false;
 try{
  // Serializable isolation prevents a concurrent moderation change from
  // silently racing the verification and published snapshot write.
  // Future moderation reads MUST use this same dedicated transaction client.
  const start=await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  if(start?.command!=='BEGIN')fail('BEGIN_UNVERIFIED');
  begun=true;
  const admin=await verifyAdmin(client,request);
  if(!admin||!UUID.test(admin.user_id||'')||admin.role!=='owner')
   fail('OWNER_AUTH_REQUIRED');
  const authUser=admin.user_id.toLowerCase();
  const payloadHash=receiptHash({
   actor:authUser,action,expectedPublishedRevision,
   expectedDraftRevision:action==='publish'?expectedDraftRevision:null,
   targetRevision:action==='rollback'?targetRevision:null,confirmation
  });
  const rows=exactly(await client.query(
   "SELECT draft_revision,draft_order,draft_visible_ids,draft_featured_id,"+
   "published_revision,published_from_draft_revision FROM museum_gallery_layout_stage "+
   "WHERE layout_key='main' FOR UPDATE"),1);
  const row=rows[0];
  const currentDraft=rev(row?.draft_revision);
  const currentPublished=row?.published_revision==null?0:rev(row.published_revision);
  const prior=await client.query(
   'SELECT actor_id,action,payload_hash,new_revision FROM museum_gallery_layout_audit_stage WHERE operation_id=$1',
   [operationId]);
  if(!prior||![0,1].includes(prior.rowCount)||!Array.isArray(prior.rows)||
     prior.rows.length!==prior.rowCount)fail('AUDIT_READ_UNVERIFIED');
  if(prior.rowCount===1){
   const receipt=prior.rows[0];
   if(receipt?.actor_id?.toLowerCase()!==authUser||
      receipt.action!==action||receipt.payload_hash!==payloadHash)
    fail('OPERATION_CONFLICT');
   const recordedRevision=rev(receipt.new_revision);
   const history=exactly(await client.query(
    "SELECT published_revision FROM museum_gallery_layout_history_stage WHERE layout_key='main' AND published_revision=$1",
    [recordedRevision]),1);
   if(rev(history[0].published_revision)!==recordedRevision||
      currentPublished<recordedRevision)fail('AUDIT_HISTORY_MISMATCH');
   commitAttempted=true;
   const done=await client.query('COMMIT');
   if(done?.command!=='COMMIT')fail('COMMIT_UNCONFIRMED');
   begun=false;
   return Object.freeze({ok:true,replayed:true,revision:recordedRevision,
    active:currentPublished===recordedRevision,publishedToStageOnly:true});
  }
  if(currentPublished!==expectedPublishedRevision)fail('PUBLISHED_REVISION_CONFLICT');
  if(currentPublished===Number.MAX_SAFE_INTEGER)fail('REVISION_EXHAUSTED');
  let order,visibleIds,featuredId,sourceDraftRevision;
  if(action==='publish'){
   if(currentDraft!==expectedDraftRevision)fail('DRAFT_REVISION_CONFLICT');
   if(row.published_from_draft_revision!=null&&
      rev(row.published_from_draft_revision)===currentDraft)fail('DRAFT_ALREADY_PUBLISHED');
   sourceDraftRevision=currentDraft;
   order=row.draft_order;visibleIds=row.draft_visible_ids;
   featuredId=row.draft_featured_id;
  }else{
   if(targetRevision>=currentPublished)fail('HISTORY_REVISION_INVALID');
   const history=exactly(await client.query(
    "SELECT published_revision,source_draft_revision,snapshot_order,snapshot_visible_ids,snapshot_featured_id "+
    "FROM museum_gallery_layout_history_stage WHERE layout_key='main' AND published_revision=$1",
    [targetRevision]),1)[0];
   if(rev(history.published_revision)!==targetRevision)fail('HISTORY_UNVERIFIED');
   sourceDraftRevision=rev(history.source_draft_revision);
   order=history.snapshot_order;visibleIds=history.snapshot_visible_ids;
   featuredId=history.snapshot_featured_id;
  }
  // These values come from locked DB rows, not from the user's HTTP body.
  if(!Array.isArray(order)||!Array.isArray(visibleIds)||
     !(featuredId===null||typeof featuredId==='string'))
   fail('SNAPSHOT_INVALID');
  const source=await loadModeratedCatalog(client);
  if(!source||source.sourceVerified!==true||!Array.isArray(source.catalog)||
     !Array.isArray(source.verifiedApprovedIds))fail('MODERATION_SOURCE_UNVERIFIED');
  // Recheck CURRENT rights/takedowns; a once-approved saved snapshot is not
  // authorization to display a work that was removed in the meantime.
  const candidate=planMuseumCuration({
   catalog:source.catalog,verifiedApprovedIds:source.verifiedApprovedIds,
   currentRevision:currentDraft,
   proposal:{expectedRevision:currentDraft,order,visibleIds,featuredId}
  });
  const next=currentPublished+1;
  const result=await client.query(
   "UPDATE museum_gallery_layout_stage SET published_revision=$1,published_from_draft_revision=$2,"+
   "published_order=$3::jsonb,published_visible_ids=$4::jsonb,published_featured_id=$5,"+
   "published_by=$6,published_at=now() WHERE layout_key='main' AND draft_revision=$7 "+
   "AND COALESCE(published_revision,0)=$8 RETURNING published_revision",
   [next,sourceDraftRevision,JSON.stringify(candidate.orderedIds),
    JSON.stringify(candidate.visibleIds),candidate.featuredId,authUser,currentDraft,currentPublished]
  );
  if(rev(exactly(result,1)[0].published_revision)!==next)fail('PUBLISH_WRITE_UNVERIFIED');
  const snapshot=await client.query(
   "INSERT INTO museum_gallery_layout_history_stage(layout_key,published_revision,source_draft_revision,"+
   "snapshot_order,snapshot_visible_ids,snapshot_featured_id,published_by) "+
   "VALUES('main',$1,$2,$3::jsonb,$4::jsonb,$5,$6) RETURNING published_revision",
   [next,sourceDraftRevision,JSON.stringify(candidate.orderedIds),
    JSON.stringify(candidate.visibleIds),candidate.featuredId,authUser]
  );
  if(rev(exactly(snapshot,1)[0].published_revision)!==next)fail('HISTORY_WRITE_UNVERIFIED');
  const audit=await client.query(
   "INSERT INTO museum_gallery_layout_audit_stage(layout_key,operation_id,payload_hash,actor_id,"+
   "action,prior_revision,new_revision) VALUES('main',$1,$2,$3,$4,$5,$6) RETURNING operation_id",
   [operationId,payloadHash,authUser,action,currentPublished,next]
  );
  if(exactly(audit,1)[0].operation_id!==operationId)fail('AUDIT_WRITE_UNVERIFIED');
  commitAttempted=true;
  const done=await client.query('COMMIT');
  if(done?.command!=='COMMIT')fail('COMMIT_UNCONFIRMED');
  begun=false;
  // No live endpoint reads this candidate table, so do not call this a site release.
  return Object.freeze({ok:true,replayed:false,revision:next,active:true,publishedToStageOnly:true});
 }catch(e){
  if(begun&&!commitAttempted){
   try{await client.query('ROLLBACK')}catch{fail('ROLLBACK_UNCONFIRMED')}
  }
  if(commitAttempted)fail('COMMIT_UNCONFIRMED');
  throw e;
 }
}
export const publishMuseumGalleryStage=(client,params={})=>
 changePublication(client,{...params,action:'publish'});
export const rollbackMuseumGalleryStage=(client,params={})=>
 changePublication(client,{...params,action:'rollback'});
