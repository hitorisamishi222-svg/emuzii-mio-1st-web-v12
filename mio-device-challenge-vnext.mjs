// Isolated candidate for PR #101. No production wiring.
import {createHash,createPublicKey,randomBytes,verify} from 'node:crypto';
const sha = x => createHash('sha256').update(x).digest('hex');
const b64 = /^[A-Za-z0-9_-]{43}$/;
function canonicalKey(jwk){
 if(!jwk || jwk.kty!=='EC'||jwk.crv!=='P-256'||'d' in jwk || !b64.test(jwk.x)||!b64.test(jwk.y)) throw Error('INVALID_KEY');
 const key={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
 for(const v of [key.x,key.y]) if(Buffer.from(v,'base64url').toString('base64url')!==v) throw Error('INVALID_KEY');
 createPublicKey({key,format:'jwk'}); return key;
}
export function bindingForClaim(name,code){
 if(typeof name!=='string'||typeof code!=='string'||!/^MIO-ACCESS-[a-f0-9]{40}$/.test(code))throw Error('INVALID_CLAIM');
 const normalized=name.normalize('NFKC').trim().replace(/\s+/gu,' ');
 if(!normalized||normalized.length>80||/[\u0000-\u001f\u007f]/u.test(normalized))throw Error('INVALID_CLAIM');
 return sha(JSON.stringify(['mio-claim-v1',normalized,code]));
}
// store.put(record), store.take(id): take MUST atomically delete and return one record across workers.
// The store is trusted server-only; the caller must rate-limit challenge and claim endpoints.
export function createChallengeService({store,origin,clock=Date.now,ttlMs=120000}){
 if(!/^https:\/\//.test(origin)||new URL(origin).origin!==origin||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>300000)throw Error('INVALID_CONFIG');
 return {
 async issue({binding,publicJwk}){
  if(typeof binding!=='string'||!/^[a-f0-9]{64}$/.test(binding))throw Error('INVALID_BINDING');
  const key=canonicalKey(publicJwk),id=randomBytes(32).toString('base64url'),expiresAt=clock()+ttlMs;
  const fingerprint='sha256:'+sha(JSON.stringify(key));
  const message=JSON.stringify(['mio-device-v1',origin,id,binding,fingerprint,expiresAt]);
  await store.put({id,message,binding,fingerprint,publicJwk:key,expiresAt});
  return {id,message,expiresAt};
 },
 async consume({id,binding,signature}){
  if(typeof id!=='string'||!b64.test(id))throw Error('INVALID_CHALLENGE');
  const record=await store.take(id);
  if(!record||record.expiresAt<=clock()||record.binding!==binding)throw Error('INVALID_CHALLENGE');
  if(typeof signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(signature))throw Error('INVALID_SIGNATURE');
  const raw=Buffer.from(signature,'base64url');
  if(raw.length!==64||raw.toString('base64url')!==signature||!verify('sha256',Buffer.from(record.message),{key:createPublicKey({key:record.publicJwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},raw))throw Error('INVALID_SIGNATURE');
  return {source:'server-verified-signature',fresh:true,fingerprint:record.fingerprint,publicJwk:record.publicJwk};
 }
 };
}
