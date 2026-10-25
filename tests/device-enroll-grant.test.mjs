import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {verifyDeviceGrant} from '../device-grant-verifier.js';

const secret='local-test-only-secret-1234567890-abcdef';
const token='a'.repeat(64);
const webId='MIO-W-'+'b'.repeat(24);
const now=Date.now();
function sign(grant){return createHmac('sha256',secret).update(JSON.stringify(grant)).digest('base64url')}
function grant(overrides={}){return {webId,masterId:'MIO-0010',deviceProofHash:createHash('sha256').update(token).digest('hex'),nonce:'c'.repeat(64),expiresAt:now+60000,scope:'device-enroll',issuer:'authenticated-admin',...overrides}}

test('signed device grant binds one approved web identity and token hash',()=>{
 const g=grant();assert.deepEqual(verifyDeviceGrant({grant:g,signature:sign(g),secret,now}),{webId,masterId:g.masterId,deviceProofHash:g.deviceProofHash,nonce:g.nonce,expiresAt:g.expiresAt});
});
test('rejects modified account, token, scope and expiry',()=>{
 const g=grant();const sig=sign(g);
 for(const key of ['masterId','deviceProofHash','scope','nonce']){
  const bad={...g,[key]:key==='scope'?'other':key==='masterId'?'MIO-0018':'d'.repeat(64)};
  assert.equal(verifyDeviceGrant({grant:bad,signature:sig,secret,now}),null,key);
 }
 assert.equal(verifyDeviceGrant({grant:g,signature:sig,secret,now:now+120000}),null);
});
test('rejects malformed signature and missing server secret',()=>{
 const g=grant();assert.equal(verifyDeviceGrant({grant:g,signature:'not-a-signature',secret,now}),null);
 assert.equal(verifyDeviceGrant({grant:g,signature:sign(g),secret:'',now}),null);
});
