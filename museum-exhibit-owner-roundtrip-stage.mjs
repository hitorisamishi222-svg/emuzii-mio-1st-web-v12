// MIO MUSEUM — UNROUTED private draft save -> verified re-read.
// This module does NOT create a database pool, HTTP API, auth session,
// backup, deployment permission, publication or media upload.
// A save acknowledgment alone is NOT proof that the owner can still edit
// the same revision. Both steps independently recheck the dedicated binding
// and existing approved-device owner session on separate checked-out clients.
// On uncertainty keep the SAME operationId for receipt-based recovery;
// NEVER silently retry using a new operationId.
import {saveMuseumOwnerExhibitStage} from './museum-exhibit-owner-save-stage.mjs';
import {getMuseumOwnerDraftStage} from './museum-exhibit-owner-list-entry-stage.mjs';
import {prepareMuseumExhibitFormDraftStage} from './museum-exhibit-ui-contract-stage.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OP=/^[a-f0-9]{32}$/;
const EXPECTED_KEYS=['kind','category','title','description','credit','occurredOn','imageUrl','externalUrl'];
const fail=reason=>{throw Error('MUSEUM_DRAFT_ROUNDTRIP_'+reason)};
const own=(x,fields)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join(',')===[...fields].sort().join(',');

export async function saveAndVerifyMuseumOwnerDraftStage(pool,{
 request,verifyBinding,operationId,action,exhibitId=null,
 expectedRevision=null,draft,uiDraft
}={}){
 if(!pool||typeof pool.connect!=='function'||typeof verifyBinding!=='function')
  fail('DEPENDENCY_REQUIRED');
 if(typeof operationId!=='string'||!OP.test(operationId))fail('OPERATION_ID_INVALID');
 if(action!=='create'&&action!=='edit')fail('ACTION_INVALID');
 if(action==='create'&&(exhibitId!==null||expectedRevision!==null))
  fail('CREATE_ARGUMENT_INVALID');
 if(action==='edit'&&(!UUID.test(exhibitId||'')||
   !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
   expectedRevision>=2147483647))fail('EDIT_ARGUMENT_INVALID');
 if((draft===undefined)===(uiDraft===undefined))
  fail('EXACTLY_ONE_DRAFT_REQUIRED');

 // Capture the exact submitted values before the first await. A form can be
 // changed while requests are in flight; comparison must use the saved input,
 // not mutable references that the browser may alter later.
 let submitted,source;
 try{
  if(uiDraft!==undefined){
   submitted=Object.freeze({...uiDraft});
   source=prepareMuseumExhibitFormDraftStage(submitted);
  }else{
   if(!own(draft,EXPECTED_KEYS))fail('DRAFT_FIELDS_INVALID');
   submitted=Object.freeze({...draft});
   source=submitted;
  }
 }catch(error){
  if(error?.message?.startsWith('MUSEUM_DRAFT_ROUNDTRIP_'))throw error;
  fail('DRAFT_FIELDS_INVALID');
 }
 const intended=Object.freeze({
  room:source.kind,category:source.category,
  title:typeof source.title==='string'?source.title.trim():source.title,
  description:source.description,
  credit:typeof source.credit==='string'?source.credit.trim():source.credit,
  occurredOn:source.occurredOn,
  externalUrl:source.externalUrl,
  ...(uiDraft===undefined?{imageUrl:source.imageUrl}:{})
 });

 let saved;
 try{
  saved=await saveMuseumOwnerExhibitStage(pool,{
   request,verifyBinding,operationId,action,exhibitId,expectedRevision,
   ...(uiDraft!==undefined?{uiDraft:submitted}:{draft:submitted})
  });
 }catch(error){
  // Auth/provider errors can contain secrets. Expose only recognized,
  // safe application-level failure classes.
  if(error?.message==='MUSEUM_EXHIBIT_COMMIT_UNCONFIRMED')
   fail('COMMIT_UNCONFIRMED');
  if(error?.message==='MUSEUM_EXHIBIT_REVISION_OR_STATE_CONFLICT')
   fail('REVISION_CONFLICT');
  if(error?.message==='MUSEUM_EXHIBIT_OPERATION_CONFLICT')
   fail('OPERATION_CONFLICT');
  fail('SAVE_NOT_CONFIRMED');
 }
 if(saved?.ok!==true||saved.privateDraftAtSave!==true||
    saved.published!==false||typeof saved.replayed!=='boolean'||
    !UUID.test(saved.exhibitId||'')||
    !Number.isSafeInteger(saved.revision)||saved.revision<0||
    (action==='create'&&saved.revision!==0)||
    (action==='edit'&&(saved.exhibitId.toLowerCase()!==exhibitId.toLowerCase()||
     saved.revision!==expectedRevision+1)))
  fail('SAVE_RECEIPT_UNVERIFIED');
 const id=saved.exhibitId.toLowerCase();

 let loaded;
 try{
  loaded=await getMuseumOwnerDraftStage(pool,{
   request,verifyBinding,exhibitId:id
  });
 }catch{
  // The write may already have COMMITTED. Never re-save automatically.
  fail('RELOAD_UNCONFIRMED');
 }
 if(loaded?.found!==true||loaded.editable!==true||
    loaded.onlyPrivateDrafts!==true||!loaded.item)
  fail('NOT_CURRENT_PRIVATE_DRAFT');
 const item=loaded.item;
 if(item.id!==id||item.status!=='draft'||item.editable!==true)
  fail('RELOAD_IDENTITY_MISMATCH');
 if(item.revision!==saved.revision)
  fail('REVISION_ADVANCED');
 for(const key of Object.keys(intended)){
  if(item[key]!==intended[key])fail('RELOAD_CONTENT_MISMATCH');
 }
 return Object.freeze({
  ok:true,savedAndReloaded:true,
  replayedReceipt:saved.replayed,
  exhibitId:id,revision:saved.revision,
  currentPrivateDraft:item,canEditWithRevision:saved.revision,
  canPublish:false,requiresFreshReview:true,
  // Real DB/access/auth/restore must still be verified by both stages;
  // these booleans are NOT an independent release authorization.
  productionReleased:false
 });
}
