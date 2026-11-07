// MIO museum - UNROUTED draft-only composition of existing safeguards.
// No HTTP handler, env reader, DB pool creation, migrations or deployment.
// The caller must independently authenticate the exact Vercel/Neon binding,
// schema, restorable backup and owner approval before passing a pool.
// This module cannot verify the provider's provenance on its own.
// IMPORTANT: existing gallery auth's production-only Origin rule remains
// unchanged. Preview origin authorization needs its own reviewed design.
import {withDedicatedMuseumStageClient} from './museum-gallery-client-stage.mjs';
import {verifyMuseumGalleryOwnerStage} from './museum-gallery-owner-stage.mjs';
import {loadMuseumModeratedCatalogStage} from './museum-gallery-source-stage.mjs';
import {saveMuseumGalleryDraft} from './museum-gallery-draft-store.mjs';

// Only one trusted code path supplies the owner and catalog callbacks.
// Never pass a client-claimed approval array, authenticated role or DB name
// from the browser body into these dependencies.
export async function saveMuseumOwnerGalleryDraftStage(pool,{
 request,operationId,proposal,verifyBinding
}={}){
 if(typeof verifyBinding!=='function')
  throw Error('MUSEUM_OWNER_DRAFT_BINDING_REQUIRED');
 return withDedicatedMuseumStageClient(pool,{
  verifyBinding,
  perform:client=>saveMuseumGalleryDraft(client,{
   request,operationId,proposal,
   verifyAdmin:verifyMuseumGalleryOwnerStage,
   loadModeratedCatalog:checkedClient=>
    loadMuseumModeratedCatalogStage(checkedClient,{lockModeration:true})
  })
 });
}
