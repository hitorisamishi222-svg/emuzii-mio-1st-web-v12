// UNROUTED composition for MIO's FUTURE authenticated museum draft inbox.
// This module does not create an HTTP route, PG pool or production credentials.
// It cannot run until the independent isolation/schema/restore/owner approval
// binding succeeds on the SAME dedicated checked-out client.
import {withDedicatedMuseumStageClient} from './museum-gallery-client-stage.mjs';
import {verifyMuseumGalleryOwnerStage} from './museum-gallery-owner-stage.mjs';
import {listMuseumPrivateDraftsStage} from './museum-exhibit-owner-list-stage.mjs';

export async function listMuseumOwnerDraftsStage(pool,{
 request,verifyBinding,room=null,limit=20,cursor=null
}={}){
 if(typeof verifyBinding!=='function')throw Error('MUSEUM_DRAFT_LIST_BINDING_REQUIRED');
 return withDedicatedMuseumStageClient(pool,{
  verifyBinding,
  perform:client=>listMuseumPrivateDraftsStage(client,{
   request,verifyOwner:verifyMuseumGalleryOwnerStage,room,limit,cursor
  })
 });
}
