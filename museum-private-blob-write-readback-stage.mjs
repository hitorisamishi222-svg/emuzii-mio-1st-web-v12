// MIO museum — UNROUTED and DISABLED private Vercel Blob image bridge.
// Source code is preparation only; it has no route, DB, credential lookup,
// store provisioning, migration, release switch or production usage.
// The trusted verifier MUST independently prove owner, device, Preview scope,
// isolated database, private store provenance and an actual backup restore.
// Test doubles can demonstrate behavior but are NOT such provenance evidence.
import {put as blobPut,get as blobGet} from '@vercel/blob';
import {createHash,timingSafeEqual} from 'node:crypto';
import {decodeAndReencodeMuseumImageStage} from './museum-media-decode-reencode-stage.mjs';

const OP=/^[a-f0-9]{32}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Vercel SDK accepts both prefixed store_<id> and bare <id>.
// CDN host ALWAYS uses the bare form. Never alter case or drop arbitrary text.
const STORE=/^(?:store_)?[a-z0-9-]{8,80}$/;
const bareStoreId=id=>id.startsWith('store_')?id.slice(6):id;
const REQUIRED=['ownerAuthenticated','approvedDeviceAuthenticated','previewBindingVerified',
 'dedicatedPrivateStoreVerified','isolatedDatabaseVerified',
 'backupRestorationVerified','ownerApproved'];
const LIMIT=700_000;
const fail=code=>{throw Error('MUSEUM_PRIVATE_BLOB_STAGE_'+code)};
const expectedUrl=(storeId,pathname)=>'https://'+bareStoreId(storeId)+'.private.blob.vercel-storage.com/'+pathname;
const sha=content=>createHash('sha256').update(content).digest('hex');
function validateBlobMetadata(blob,storeId,pathname){
 if(!blob||blob.pathname!==pathname||
    blob.url!==expectedUrl(storeId,pathname)||
    blob.contentType!=='image/webp'||
    !Number.isSafeInteger(blob.size)||blob.size<1||blob.size>LIMIT)
   fail('PRIVATE_STORE_METADATA_MISMATCH');
}
async function readBoundedStream(stream){
 if(!stream||typeof stream.getReader!=='function')fail('READ_STREAM_MISSING');
 const reader=stream.getReader(),parts=[];let total=0;
 try{
  for(;;){
   const next=await reader.read();
   if(!next||typeof next.done!=='boolean')fail('READ_STREAM_INVALID');
   if(next.done)break;
   if(!(next.value instanceof Uint8Array)||next.value.length===0)fail('READ_STREAM_INVALID');
   total+=next.value.byteLength;
   if(total>LIMIT)fail('READ_STREAM_TOO_LARGE');
   parts.push(Buffer.from(next.value));
  }
  return Buffer.concat(parts,total);
 }finally{
  try{reader.releaseLock()}catch{}
 }
}
async function retrieve(sdk,storeId,token,pathname){
 let current;
 try{
  current=await sdk.get(pathname,{access:'private',storeId,token,useCache:false});
 }catch{
  // A permission error, timeout, or unknown provider error is NOT "not found".
  fail('READ_UNCONFIRMED');
 }
 if(current===null)return null;
 if(current?.statusCode!==200)fail('READ_UNCONFIRMED');
 validateBlobMetadata(current.blob,storeId,pathname);
 let content;
 try{content=await readBoundedStream(current.stream)}catch(error){
  if(error?.message?.startsWith('MUSEUM_PRIVATE_BLOB_STAGE_'))throw error;
  fail('READ_STREAM_FAILED');
 }
 if(content.length!==current.blob.size)fail('READ_SIZE_MISMATCH');
 return content;
}
function verifyBytes(content,expected){
 if(!Buffer.isBuffer(content)||content.length!==expected.bytes)
  fail('READBACK_INTEGRITY_MISMATCH');
 const actual=Buffer.from(sha(content),'hex'),digest=Buffer.from(expected.sha256,'hex');
 if(digest.length!==32||!timingSafeEqual(actual,digest)||
    !content.equals(expected.content))fail('READBACK_INTEGRITY_MISMATCH');
}

/**
 * Server-only composition test target. No real caller or deployment route.
 * The operationId is stable across uncertain responses; never overwrite.
 * The SDK is injectable only for isolated tests; real usage needs a completely
 * separate reviewed caller and environment provisioning.
 */
export async function storeAndVerifyMuseumPrivateBlobStage({
 payload,operationId,verifyTrustedScope,storeId,dedicatedToken,sdk
}={}){
 if(typeof operationId!=='string'||!OP.test(operationId))fail('OPERATION_ID_INVALID');
 if(typeof verifyTrustedScope!=='function')fail('TRUSTED_SCOPE_VERIFIER_REQUIRED');
 if(typeof storeId!=='string'||!STORE.test(storeId))fail('STORE_ID_INVALID');
 if(typeof dedicatedToken!=='string'||dedicatedToken.length<32||
    dedicatedToken.length>4096)fail('DEDICATED_TOKEN_REQUIRED');
 if(sdk!==undefined&&(!sdk||typeof sdk.put!=='function'||typeof sdk.get!=='function'))
  fail('SDK_INVALID');
 let evidence;
 try{evidence=await verifyTrustedScope()}catch{fail('TRUSTED_SCOPE_UNVERIFIED')}
 if(!evidence||!UUID.test(evidence.ownerId||'')||
    evidence.dedicatedStoreId!==storeId||
    !REQUIRED.every(key=>evidence[key]===true))
  fail('TRUSTED_SCOPE_UNVERIFIED');
 // Never infer any of those approvals from browser input, a pathname, or the
 // presence of the old shared BLOB_READ_WRITE_TOKEN.
 let image;
 try{image=await decodeAndReencodeMuseumImageStage(payload)}
 catch(error){
  if(error?.message?.startsWith('MUSEUM_IMAGE_PREFLIGHT_')||
     error?.message?.startsWith('MUSEUM_MEDIA_REENCODE_'))throw error;
  fail('IMAGE_VALIDATION_FAILED');
 }
 const owner=evidence.ownerId.toLowerCase();
 const pathname='museum-private/'+owner+'/'+operationId+'.webp';
 const client=sdk||{put:blobPut,get:blobGet};
 const prior=await retrieve(client,storeId,dedicatedToken,pathname);
 if(prior!==null){
  verifyBytes(prior,image);
  return Object.freeze({ok:true,privateOnly:true,replayed:true,
   bytes:image.bytes,width:image.width,height:image.height,sha256:image.sha256});
 }
 let writeUncertain=false;
 try{
  const uploaded=await client.put(pathname,Buffer.from(image.content),{
   access:'private',token:dedicatedToken,storeId,addRandomSuffix:false,
   allowOverwrite:false,maximumSizeInBytes:LIMIT,contentType:'image/webp'
  });
  // A public Blob URL or wrong store host is never a successful upload.
  if(!uploaded||uploaded.pathname!==pathname||
     uploaded.url!==expectedUrl(storeId,pathname))
   fail('PRIVATE_STORE_METADATA_MISMATCH');
 }catch(error){
  // An acknowledged result from the wrong or a public store must never be
  // repaired into success by reading an unrelated private object.
  if(error?.message==='MUSEUM_PRIVATE_BLOB_STAGE_PRIVATE_STORE_METADATA_MISMATCH')
   throw error;
  // A failed write may have committed despite lost ACK; do not repeat PUT.
  writeUncertain=true;
 }
 let readback;
 try{readback=await retrieve(client,storeId,dedicatedToken,pathname)}
 catch(error){
  if(writeUncertain)fail('WRITE_UNCONFIRMED_RETRY_SAME_ID');
  if(error?.message?.startsWith('MUSEUM_PRIVATE_BLOB_STAGE_'))throw error;
  fail('READ_UNCONFIRMED_RETRY_SAME_ID');
 }
 if(readback===null)fail('WRITE_UNCONFIRMED_RETRY_SAME_ID');
 verifyBytes(readback,image);
 return Object.freeze({ok:true,privateOnly:true,replayed:writeUncertain,
  bytes:image.bytes,width:image.width,height:image.height,sha256:image.sha256});
}
