// MIO museum INERT owner-only composition: no API route or real connection.
// Provider identity/schema, verified restored backup, Preview env isolation and
// owner approval must be independently supplied before any checked-out client.
// Current gallery auth checks the existing production Origin; do not widen it
// by accepting arbitrary Preview hosts.
import {withDedicatedMuseumStageClient} from './museum-gallery-client-stage.mjs';
import {verifyMuseumGalleryOwnerStage} from './museum-gallery-owner-stage.mjs';
import {saveMuseumExhibitPrivateDraftStage} from './museum-exhibit-private-draft-stage.mjs';

export async function saveMuseumOwnerExhibitStage(pool,{
 request,operationId,action,draft,exhibitId=null,expectedRevision=null,
 verifyBinding
}={}){
 if(typeof verifyBinding!=='function')throw Error('MUSEUM_EXHIBIT_BINDING_REQUIRED');
 return withDedicatedMuseumStageClient(pool,{
  verifyBinding,
  perform:client=>saveMuseumExhibitPrivateDraftStage(client,{
   request,operationId,action,draft,exhibitId,expectedRevision,
   verifyOwner:verifyMuseumGalleryOwnerStage
  })
 });
}
