// MIO museum INERT owner-only composition: no API route or real connection.
// Provider identity/schema, verified restored backup, Preview env isolation and
// owner approval must be independently supplied before any checked-out client.
// Current gallery auth checks the existing production Origin; do not widen it
// by accepting arbitrary Preview hosts.
import {withDedicatedMuseumStageClient} from './museum-gallery-client-stage.mjs';
import {verifyMuseumGalleryOwnerStage} from './museum-gallery-owner-stage.mjs';
import {saveMuseumExhibitPrivateDraftStage} from './museum-exhibit-private-draft-stage.mjs';
import {prepareMuseumExhibitFormDraftStage} from './museum-exhibit-ui-contract-stage.mjs';

export async function saveMuseumOwnerExhibitStage(pool,{
 request,operationId,action,draft,uiDraft,exhibitId=null,expectedRevision=null,
 verifyBinding
}={}){
 if(typeof verifyBinding!=='function')throw Error('MUSEUM_EXHIBIT_BINDING_REQUIRED');
 // Never combine two sources of truth or silently ignore user edits.
 if((uiDraft===undefined)===(draft===undefined))
  throw Error('MUSEUM_EXHIBIT_EXACTLY_ONE_DRAFT_REQUIRED');
 const canonicalDraft=uiDraft===undefined?draft:prepareMuseumExhibitFormDraftStage(uiDraft);
 return withDedicatedMuseumStageClient(pool,{
  verifyBinding,
  perform:client=>saveMuseumExhibitPrivateDraftStage(client,{
   request,operationId,action,draft:canonicalDraft,exhibitId,expectedRevision,
   // Owner UI has no image URL field; editing it must NOT clear a stored cover.
   // This policy is decided server-side from the mutually exclusive uiDraft path.
   preserveExistingImage:action==='edit'&&uiDraft!==undefined,
   verifyOwner:verifyMuseumGalleryOwnerStage
  })
 });
}
