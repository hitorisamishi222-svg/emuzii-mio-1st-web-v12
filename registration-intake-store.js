import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {put,list} from '@vercel/blob';

// Interim intake is isolated from Apps Script, participants, check-in and gacha.
// It does not assert that an applicant is approved or linked to an MIO ID.
const PREFIX='mio-registration-intake/v1/';
const pathname=id=>PREFIX+id+'.json';
const validId=id=>/^MIO-W-[a-f0-9]{24}$/.test(id||'');
const digest=x=>createHash('sha256').update(x).digest('hex');
const key=secret=>createHmac('sha256',secret).update('mio-intake-blob-encryption-v1').digest();
const blobHost=url=>{
 try{const u=new URL(url);return u.protocol==='https:'&&/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname)}
 catch{return false}
};
function seal(record,secret){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);
 const enc=Buffer.concat([cipher.update(JSON.stringify(record),'utf8'),cipher.final()]);
 return JSON.stringify({v:1,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),data:enc.toString('base64url')});
}
function unseal(text,secret){
 const obj=JSON.parse(text);
 if(obj.v!==1||typeof obj.iv!=='string'||typeof obj.tag!=='string'||typeof obj.data!=='string')throw Error('INVALID_INTAKE');
 const iv=Buffer.from(obj.iv,'base64url'),tag=Buffer.from(obj.tag,'base64url');
 if(iv.length!==12||tag.length!==16)throw Error('INVALID_INTAKE');
 const decipher=createDecipheriv('aes-256-gcm',key(secret),iv);decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(obj.data,'base64url')),decipher.final()]).toString('utf8'));
}
function equalHash(a,b){
 if(!/^[a-f0-9]{64}$/.test(a||'')||!/^[a-f0-9]{64}$/.test(b||''))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
async function retrieve(url,secret){
 if(!blobHost(url))throw Error('INTAKE_URL_INVALID');
 const r=await fetch(url,{method:'GET',cache:'no-store',signal:AbortSignal.timeout(7000)});
 if(!r.ok||Number(r.headers.get('content-length')||0)>5000)throw Error('INTAKE_UNAVAILABLE');
 const text=await r.text();
 if(text.length>5000)throw Error('INTAKE_INVALID');
 return unseal(text,secret);
}
export async function loadIntake(id,token,secret){
 if(!validId(id))return null;
 if(!process.env.BLOB_READ_WRITE_TOKEN)throw Error('INTAKE_STORAGE_MISSING');
 const path=pathname(id);
 const result=await list({prefix:path,limit:3});
 const blobs=(result.blobs||[]).filter(x=>x.pathname===path);
 if(blobs.length===0)return null;
 if(blobs.length!==1)throw Error('INTAKE_AMBIGUOUS');
 const record=await retrieve(blobs[0].url,secret);
 if(record?.participantId!==id||!equalHash(record.tokenHash,digest(token)))throw Error('INTAKE_IDENTITY_INVALID');
 return record;
}
export async function saveIntake({id,token,name,memberClaim},secret){
 if(!validId(id)||!/^[a-f0-9]{64}$/.test(token||'')||typeof name!=='string'||!name.trim()||name.length>40)throw Error('INVALID_INTAKE');
 if(!process.env.BLOB_READ_WRITE_TOKEN)throw Error('INTAKE_STORAGE_MISSING');
 const existing=await loadIntake(id,token,secret);
 if(existing){
   if(existing.name!==name||existing.participantId!==id)throw Error('INTAKE_RETRY_CONFLICT');
   return existing;
 }
 const record={v:1,participantId:id,tokenHash:digest(token),name,memberClaim:!!memberClaim,status:'仮受付済み（承認待ち）',createdAt:new Date().toISOString()};
 let saved;
 try{
  saved=await put(pathname(id),seal(record,secret),{access:'public',contentType:'application/json',addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:60});
 }catch(error){
  // A lost HTTP response can retry the same id; never overwrite a prior application.
  const retried=await loadIntake(id,token,secret);
  if(retried&&retried.name===name)return retried;
  throw error;
 }
 if(!saved?.url||!blobHost(saved.url))throw Error('INTAKE_SAVE_INVALID');
 const verified=await retrieve(saved.url,secret);
 if(verified?.participantId!==id||!equalHash(verified.tokenHash,digest(token))||verified.name!==name)throw Error('INTAKE_VERIFY_FAILED');
 return verified;
}
