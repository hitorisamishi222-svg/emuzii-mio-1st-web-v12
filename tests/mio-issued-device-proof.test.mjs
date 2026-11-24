import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {makeDeviceChallenge,deviceKeyThumbprint,deviceSigningPayload,verifyDeviceSignature,confirmedOneTimeDeviceProof} from '../mio-issued-device-proof.mjs';
const h=s=>createHash('sha256').update(s).digest('hex');
test('non-exportable device private key signs a fresh challenge; server verifies P-256 signature',async()=>{
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 assert.equal(pair.privateKey.extractable,false);
 const jwk=await webcrypto.subtle.exportKey('jwk',pair.publicKey);
 const nonce=makeDeviceChallenge(),requestHash=h('claim:MIO-ONCE-only-when-issuer-verified');
 const payload=deviceSigningPayload({purpose:'claim',nonce,requestHash});
 const signature=Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,payload)).toString('base64url');
 const verified=verifyDeviceSignature({jwk,purpose:'claim',nonce,requestHash,signature});
 assert.equal(verified.keyThumbprint,deviceKeyThumbprint(jwk));
 const serverCommit={serverCommit:true,purpose:'claim',nonce,request_hash:requestHash,expires_at:'2027-01-01'};
 const proof=confirmedOneTimeDeviceProof({verification:verified,committedChallenge:serverCommit,now:new Date('2026-11-24')});
 assert.equal(proof.trusted,true);assert.equal(proof.fresh,true);
 assert.throws(()=>confirmedOneTimeDeviceProof({verification:verified,committedChallenge:{...serverCommit,serverCommit:false}}),/CHALLENGE_NOT_CONSUMED/);
 assert.throws(()=>verifyDeviceSignature({jwk,purpose:'room',nonce,requestHash,signature}),/DEVICE_SIGNATURE_REJECTED/);
});
test('the signature from one browser key never authenticates another key',async()=>{
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const other=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const nonce=makeDeviceChallenge(),requestHash=h('read:member-room');
 const payload=deviceSigningPayload({purpose:'room',nonce,requestHash});
 const signature=Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,payload)).toString('base64url');
 const jwk=await webcrypto.subtle.exportKey('jwk',other.publicKey);
 assert.throws(()=>verifyDeviceSignature({jwk,purpose:'room',nonce,requestHash,signature}),/DEVICE_SIGNATURE_REJECTED/);
});
test('invalid or expired nonce and private JWK are rejected',async()=>{
 const rHash=h('x');
 assert.throws(()=>deviceSigningPayload({purpose:'claim',nonce:'short',requestHash:rHash}),/INVALID_CHALLENGE/);
 assert.throws(()=>deviceKeyThumbprint({kty:'EC',crv:'P-256',x:'',y:'',d:'secret'}),/INVALID_DEVICE_PUBLIC_KEY/);
 assert.throws(()=>confirmedOneTimeDeviceProof({verification:{signatureVerified:true,purpose:'claim',nonce:'x',requestHash:rHash,keyThumbprint:'x'},committedChallenge:{serverCommit:true,purpose:'claim',nonce:'x',request_hash:rHash,expires_at:'2020-01-01'}}),/CHALLENGE_NOT_CONSUMED/);
});
