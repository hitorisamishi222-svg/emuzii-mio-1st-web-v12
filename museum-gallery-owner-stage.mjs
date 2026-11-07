// DRAFT-ONLY adapter for existing gallery session+approved device auth.
// This file has no serverless route and does not enable gallery writes.
// Future adapter must still enforce independent release flags and use a
// checked-out client for the full transaction. Never echo cookies or SQL.
import {checkOrigin,verifyGalleryAdmin} from './gallery-auth-shared.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function verifyMuseumGalleryOwnerStage(client,request){
 if(!client||typeof client.query!=='function'||!request||request.method!=='POST'||
    !request.headers||!checkOrigin(request))return null;
 // Existing verification joins active admin, unrevoked session and approved
 // device. Do not mint or accept a new identity system in museum development.
 const auth=await verifyGalleryAdmin(client,request);
 if(!auth||auth.role!=='owner'||typeof auth.user_id!=='string'||!UUID.test(auth.user_id)||
    typeof auth.device_id!=='string'||!UUID.test(auth.device_id))return null;
 return Object.freeze({user_id:auth.user_id.toLowerCase(),role:'owner'});
}
