// MIO MUSEUM — Preview-only owner → image → private Blob composition.
// UNROUTED. No HTTP handler, env lookup, database pool, Blob store creation,
// production access, or credentials. This is NOT a live upload endpoint.
// The Preview deployment identity, isolated DB binding, real backup-restore
// proof and private Blob store evidence must come from server-side provider
// verification before the caller can ever use this in a deployed route.
// Legacy production cookies do not automatically work on a Preview domain.
import {withDedicatedMuseumStageClient} from './museum-gallery-client-stage.mjs';
import {verifyMuseumPreviewOwnerSessionStage} from './museum-preview-owner-session-stage.mjs';
import {storeAndVerifyMuseumPrivateBlobStage} from './museum-private-blob-write-readback-stage.mjs';

const fail=code=>{throw Error('MUSEUM_OWNER_MEDIA_STAGE_'+code)};
const proofValid=(proof,storeId)=>proof&&
 proof.providerStoreId===storeId&&proof.privateAccessVerified===true&&
 proof.previewOnlyVerified===true&&proof.isolatedFromExistingGallery===true&&
 proof.restorationDrillVerified===true&&proof.ownerApproved===true;

export async function saveMuseumPreviewOwnerPrivateMediaStage(pool,{
 request,operationId,payload,
 verifyBinding,getTrustedDeployment,verifyDedicatedPrivateStore,
 storeId,dedicatedToken,sdk
}={}){
 if(!pool||typeof pool.connect!=='function'||
    typeof verifyBinding!=='function'||
    typeof getTrustedDeployment!=='function'||
    typeof verifyDedicatedPrivateStore!=='function')
  fail('SERVER_DEPENDENCIES_REQUIRED');
 if(!request||request.method!=='POST'||!request.headers||
    typeof request.headers.host!=='string')fail('REQUEST_INVALID');
 // Invoke these checks for each checkpoint, not just at the beginning:
 // the approved-device status may change during asynchronous Sharp work.
 const verifyTrustedScope=async()=>{
  let metadata;
  try{metadata=await getTrustedDeployment()}catch{fail('DEPLOYMENT_UNVERIFIED')}
  if(!metadata||!metadata.deployment||!metadata.expected)
   fail('DEPLOYMENT_UNVERIFIED');
  // The same checked-out database client is bound to the environment AND
  // used for the owner+approved-device session lookup. Never use pool.query.
  const owner=await withDedicatedMuseumStageClient(pool,{
   verifyBinding,
   perform:async client=>{
    const verified=await verifyMuseumPreviewOwnerSessionStage(client,request,metadata);
    if(!verified)fail('OWNER_SESSION_UNVERIFIED');
    return verified;
   }
  });
  let proof;
  try{proof=await verifyDedicatedPrivateStore()}catch{fail('PRIVATE_STORE_UNVERIFIED')}
  if(!proofValid(proof,storeId))fail('PRIVATE_STORE_UNVERIFIED');
  // The Blob module independently validates the token-embedded store ID;
  // this adapter deliberately never reads BLOB_READ_WRITE_TOKEN from env.
  return Object.freeze({
   ownerId:owner.ownerId,
   ownerAuthenticated:true,
   approvedDeviceAuthenticated:true,
   previewBindingVerified:true,
   dedicatedPrivateStoreVerified:true,
   isolatedDatabaseVerified:true,
   backupRestorationVerified:true,
   ownerApproved:true,
   dedicatedStoreId:storeId
  });
 };
 return await storeAndVerifyMuseumPrivateBlobStage({
  payload,operationId,verifyTrustedScope,storeId,dedicatedToken,sdk
 });
}
