// Isolated browser-device ECDSA P-256 proof verifier.
// The nonce MUST first be checked and atomically consumed by a server-side DB
// transaction; this module by itself NEVER authenticates a live HTTP request.
import { createHash, createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
const base64url = /^[A-Za-z0-9_-]+$/;
const hex64 = /^[a-f0-9]{64}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes generated with base64url

export const makeDeviceChallenge = () => randomBytes(32).toString('base64url');
export function deviceKeyThumbprint(jwk){
 if(!jwk || jwk.kty!=='EC' || jwk.crv!=='P-256' || 'd' in jwk ||
  typeof jwk.x!=='string' || typeof jwk.y!=='string' ||
  !base64url.test(jwk.x)||!base64url.test(jwk.y)||
  Buffer.from(jwk.x,'base64url').length!==32||Buffer.from(jwk.y,'base64url').length!==32)
  throw Error('INVALID_DEVICE_PUBLIC_KEY');
 // RFC 7638's lexicographically ordered EC JWK members.
 const canonical=JSON.stringify({crv:'P-256',kty:'EC',x:jwk.x,y:jwk.y});
 return 'sha256:'+createHash('sha256').update(canonical).digest('hex');
}
export function deviceSigningPayload({purpose,nonce,requestHash}){
 if(purpose!=='claim' && purpose!=='room')throw Error('INVALID_PROOF_PURPOSE');
 if(typeof nonce!=='string'||!CHALLENGE.test(nonce)||Buffer.from(nonce,'base64url').length!==32)throw Error('INVALID_CHALLENGE');
 if(typeof requestHash!=='string'||!hex64.test(requestHash))throw Error('INVALID_REQUEST_HASH');
 return Buffer.from('MIO-DEVICE-v1\n'+purpose+'\n'+nonce+'\n'+requestHash,'utf8');
}
export function verifyDeviceSignature({jwk,purpose,nonce,requestHash,signature}){
 const keyThumbprint=deviceKeyThumbprint(jwk);
 const message=deviceSigningPayload({purpose,nonce,requestHash});
 if(typeof signature!=='string'||!base64url.test(signature))throw Error('INVALID_DEVICE_SIGNATURE');
 const bytes=Buffer.from(signature,'base64url');
 if(bytes.length!==64)throw Error('INVALID_DEVICE_SIGNATURE');
 const key=createPublicKey({key:{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y},format:'jwk'});
 // WebCrypto ECDSA signatures are P1363 (r||s) rather than ASN.1 DER.
 if(!verifySignature('sha256',message,{key,dsaEncoding:'ieee-p1363'},bytes))throw Error('DEVICE_SIGNATURE_REJECTED');
 return {keyThumbprint,signatureVerified:true,purpose,nonce,requestHash};
}
export function confirmedOneTimeDeviceProof({verification,committedChallenge,now=new Date()}){
 // This must be assembled only by trusted API code *after* an atomic UPDATE
 // ... SET used_at=now() WHERE used_at IS NULL RETURNING ... succeeds.
 if(verification?.signatureVerified!==true||committedChallenge?.serverCommit!==true||
  committedChallenge?.purpose!==verification.purpose||
  committedChallenge?.nonce!==verification.nonce||
  committedChallenge?.request_hash!==verification.requestHash||
  !committedChallenge?.expires_at||new Date(committedChallenge.expires_at)<=now)
  throw Error('CHALLENGE_NOT_CONSUMED');
 return {trusted:true,fresh:true,keyThumbprint:verification.keyThumbprint};
}
