// MIO MUSEUM — OFFLINE, IN-MEMORY private-media rehearsal (UNROUTED).
// No persistent storage, HTTP API, database, auth, Blob provider, public URL,
// approval or actual restoration evidence. Data disappears when this instance
// goes away. This must NEVER be treated as a production media repository.
// Future owner saves require independent provider, approved-device, real
// server-side decode/re-encode and verified backup/restore gates.
import {createHash,timingSafeEqual} from 'node:crypto';
import {prepareMuseumImageIngestPreflightStage} from './museum-image-ingest-preflight-stage.mjs';

const OP=/^[a-f0-9]{32}$/;
const fail=code=>{throw Error('MUSEUM_MEDIA_MEMORY_'+code)};
const digest=x=>createHash('sha256').update(x).digest();
const identity=image=>JSON.stringify([
 image.format,image.contentType,image.bytes,image.width,image.height,image.sha256
]);
const readbackEqual=(current,record)=>{
 if(!Buffer.isBuffer(current)||current.length!==record.bytes)return false;
 const a=digest(current),b=Buffer.from(record.sha256,'hex');
 return b.length===32&&timingSafeEqual(a,b);
};

/** For isolated unit tests only. No real connector may use this object. */
export function createMuseumPrivateMediaMemoryRehearsalStage({faults=null}={}){
 if(faults!==null&&(!faults||typeof faults!=='object'||Array.isArray(faults)))fail('FAULTS_INVALID');
 const records=new Map();
 function saveAndVerify({operationId,payload}={}){
  if(typeof operationId!=='string'||!OP.test(operationId))fail('OPERATION_ID_INVALID');
  // Full format/dimension/metadata preflight runs EVEN for idempotent replays,
  // rejecting a different or malformed attachment for an existing operation.
  const image=prepareMuseumImageIngestPreflightStage(payload);
  const fingerprint=identity(image);
  let entry=records.get(operationId),replayed=Boolean(entry);
  if(entry){
   if(entry.fingerprint!==fingerprint)fail('OPERATION_CONFLICT');
  }else{
   if(faults?.failWrite)fail('WRITE_UNCONFIRMED');
   // Store a defensive clone. Client-provided bytes and the validation Buffer
   // are not exposed as references to the in-memory private record.
   entry={fingerprint,content:Buffer.from(image.content),sha256:image.sha256,
    format:image.format,contentType:image.contentType,bytes:image.bytes,
    width:image.width,height:image.height};
   records.set(operationId,entry);
   if(faults?.loseAcknowledgment)fail('ACK_UNCONFIRMED_REUSE_SAME_OPERATION_ID');
  }
  if(faults?.readUnavailable)fail('READ_UNCONFIRMED_REUSE_SAME_OPERATION_ID');
  if(faults?.corruptStoredBytes&&entry.content.length)entry.content[0]^=0xff;
  // A storage "success" alone is never confirmation. Re-read identical
  // payload bytes and metadata, and ensure no public key / URL is returned.
  const fetched=Buffer.from(entry.content);
  if(!readbackEqual(fetched,entry)||!fetched.equals(image.content)||
     entry.fingerprint!==fingerprint)fail('READBACK_INTEGRITY_MISMATCH');
  return Object.freeze({ok:true,privateOnly:true,replayed,sha256:entry.sha256,
   bytes:entry.bytes,width:entry.width,height:entry.height,
   format:entry.format,contentType:entry.contentType});
 }
 return Object.freeze({saveAndVerify});
}
