// DRAFT-ONLY gallery layout persistence contract.
// NOT an API route; NOT wired to the public site; proposed tables are unapplied.
// This function accepts only a dedicated checked-out DB client. A .query shape
// check cannot PROVE that it is dedicated: the future adapter must guarantee it.
// Authentication, current moderation/rights and catalog are injected SERVER-SIDE
// callbacks, never inferred from request body or from saved layout metadata.
// This saves a PRIVATE draft only. It cannot publish, unhide, delete, or upload.
import {createHash} from 'node:crypto';
import {planMuseumCuration} from './museum-curation-plan.mjs';
const OP=/^[a-f0-9]{32}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const die=code=>{throw Error('MUSEUM_DRAFT_'+code)};
const count=(result,expected)=>{
 if(!result||result.rowCount!==expected||!Array.isArray(result.rows)||
    result.rows.length!==expected)die('DATABASE_RESPONSE_UNVERIFIED');
 return result.rows;
};
const revision=value=>{
 if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return value;
 if(typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)){
  const v=Number(value);if(Number.isSafeInteger(v))return v;
 }
 die('REVISION_INVALID');
};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function saveMuseumGalleryDraft(client,{request,operationId,proposal,verifyAdmin,loadModeratedCatalog}={}){
 if(!client||typeof client.query!=='function')die('DEDICATED_CLIENT_REQUIRED');
 if(typeof verifyAdmin!=='function'||typeof loadModeratedCatalog!=='function')die('VERIFIER_REQUIRED');
 if(typeof operationId!=='string'||!OP.test(operationId))die('OPERATION_ID_INVALID');
 if(!proposal||typeof proposal!=='object'||Array.isArray(proposal)||
    Object.keys(proposal).sort().join(',')!=='expectedRevision,featuredId,order,visibleIds')
  die('PROPOSAL_INVALID');
 // Validate the exact field set before checking idempotent operation replay;
 // otherwise an extra field could silently disappear from the payload hash.
 if(!Number.isSafeInteger(proposal.expectedRevision)||proposal.expectedRevision<0)die('REVISION_INVALID');
 let inTransaction=false,commitAttempted=false;
 try{
  // The moderation snapshot must be read on this dedicated client under
  // serializable isolation, so concurrent rights changes cannot silently race.
  const start=await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  if(start?.command!=='BEGIN')die('BEGIN_UNVERIFIED');
  inTransaction=true;
  const admin=await verifyAdmin(client,request);
  if(!admin||!UUID.test(admin.user_id||'')||!['owner','admin'].includes(admin.role))
   die('ADMIN_AUTH_REQUIRED');
  const payloadHash=hash({
   actor:admin.user_id,action:'draft',expectedRevision:proposal.expectedRevision,
   order:proposal.order,visibleIds:proposal.visibleIds,featuredId:proposal.featuredId
  });
  // Init is explicit and safe only if the migration has already been reviewed
  // and manually installed. It creates ONE layout record, not a new table.
  const initial=await client.query(
   "INSERT INTO museum_gallery_layout_stage(layout_key) VALUES('main') ON CONFLICT DO NOTHING");
  if(initial?.command!=='INSERT'||![0,1].includes(initial?.rowCount))
   die('LAYOUT_INIT_UNVERIFIED');
  const locked=await client.query(
   "SELECT draft_revision FROM museum_gallery_layout_stage WHERE layout_key='main' FOR UPDATE");
  const row=count(locked,1)[0];
  const current=revision(row?.draft_revision);
  // An operation already committed can be retried after an unknown COMMIT,
  // but only when the same authenticated actor supplied an identical payload.
  const prior=await client.query(
   'SELECT actor_id,action,payload_hash,new_revision FROM museum_gallery_layout_audit_stage WHERE operation_id=$1',
   [operationId]);
  if(!prior||![0,1].includes(prior.rowCount)||!Array.isArray(prior.rows)||
    prior.rows.length!==prior.rowCount)die('AUDIT_READ_UNVERIFIED');
  if(prior.rowCount===1){
   const a=prior.rows[0];
   if(a?.actor_id!==admin.user_id||a.action!=='draft'||a.payload_hash!==payloadHash)
    die('OPERATION_CONFLICT');
   const r=revision(a.new_revision);
   // An audit row that points into an uncommitted or impossible future
   // revision is not proof of an already saved draft.
   if(r>current||r<=proposal.expectedRevision)die('AUDIT_REVISION_MISMATCH');
   commitAttempted=true;
   const commit=await client.query('COMMIT');
   if(commit?.command!=='COMMIT')die('COMMIT_UNCONFIRMED');
   inTransaction=false;
   return Object.freeze({ok:true,replayed:true,revision:r,published:false});
  }
  if(current!==proposal.expectedRevision)die('REVISION_CONFLICT');
  if(current===Number.MAX_SAFE_INTEGER)die('REVISION_EXHAUSTED');
  // Future caller must provide a validated, server-side source and must reread
  // moderation/rights on the same DB session. No caller-supplied ids are trusted.
  const source=await loadModeratedCatalog(client);
  if(!source||source.sourceVerified!==true||source.mutationReadLocked!==true||
     !Array.isArray(source.catalog)||!Array.isArray(source.verifiedApprovedIds))
   die('CATALOG_SOURCE_UNVERIFIED');
  const candidate=planMuseumCuration({
   catalog:source.catalog,verifiedApprovedIds:source.verifiedApprovedIds,
   currentRevision:current,proposal
  });
  const update=await client.query(
   "UPDATE museum_gallery_layout_stage SET draft_revision=$1,draft_order=$2::jsonb,draft_visible_ids=$3::jsonb,draft_featured_id=$4,drafted_by=$5,drafted_at=now() WHERE layout_key='main' AND draft_revision=$6 RETURNING draft_revision",
   [candidate.candidateRevision,JSON.stringify(candidate.orderedIds),
    JSON.stringify(candidate.visibleIds),candidate.featuredId,admin.user_id,current]
  );
  const saved=revision(count(update,1)[0]?.draft_revision);
  if(saved!==candidate.candidateRevision)die('WRITE_RESULT_UNVERIFIED');
  const audit=await client.query(
   "INSERT INTO museum_gallery_layout_audit_stage(layout_key,operation_id,payload_hash,actor_id,action,prior_revision,new_revision) VALUES('main',$1,$2,$3,'draft',$4,$5) RETURNING operation_id",
   [operationId,payloadHash,admin.user_id,current,saved]);
  if(count(audit,1)[0]?.operation_id!==operationId)die('AUDIT_WRITE_UNVERIFIED');
  // Only a verified COMMIT acknowledgment means saved. Unknown COMMIT may
  // have taken effect; caller must check operationId before any retry.
  commitAttempted=true;
  const commit=await client.query('COMMIT');
  if(commit?.command!=='COMMIT')die('COMMIT_UNCONFIRMED');
  inTransaction=false;
  return Object.freeze({ok:true,replayed:false,revision:saved,published:false});
 }catch(error){
  if(inTransaction&&!commitAttempted){
   try{await client.query('ROLLBACK');}
   catch{die('ROLLBACK_UNCONFIRMED')}
  }
  if(commitAttempted)die('COMMIT_UNCONFIRMED');
  throw error;
 }
}
