import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyDeviceGrant} from '../device-grant-verifier.js';
import {validateAndConsumeDeviceGrant,createGrantTestStore} from '../device-grant-consumer.js';
const secret='test-only-secret-with-at-least-32-characters';
const now=Date.parse('2026-10-25T08:30:00Z');
function makeGrant(overrides={}) {
  const grant={webId:'MIO-W-'+'a'.repeat(24),masterId:'MIO-0010',
    deviceProofHash:'b'.repeat(64),nonce:'c'.repeat(32),
    expiresAt:now+60000,scope:'device-enroll',issuer:'authenticated-admin',...overrides};
  const data=JSON.stringify({webId:grant.webId,masterId:grant.masterId,
    deviceProofHash:grant.deviceProofHash,nonce:grant.nonce,expiresAt:grant.expiresAt,
    scope:grant.scope,issuer:grant.issuer});
  return {grant,signature:createHmac('sha256',secret).update(data).digest('base64url')};
}
test('valid signed short-lived grant is accepted',()=>{
  assert.equal(verifyDeviceGrant({...makeGrant(),secret,now})?.masterId,'MIO-0010');
});
test('tampered signature or identity is rejected',()=>{
  const valid=makeGrant();
  assert.equal(verifyDeviceGrant({...valid,signature:'x',secret,now}),null);
  assert.equal(verifyDeviceGrant({...valid,grant:{...valid.grant,masterId:'MIO-0018'},secret,now}),null);
});
test('expired and excessively long grants are rejected',()=>{
  for(const offset of [-1,300001]) {
    const signed=makeGrant({expiresAt:now+offset});
    assert.equal(verifyDeviceGrant({...signed,secret,now}),null);
  }
});
test('missing durable store fails closed',async()=>{
  assert.deepEqual(await validateAndConsumeDeviceGrant({...makeGrant(),secret,now}),
    {ok:false,reason:'DURABLE_STORE_REQUIRED'});
});
test('same grant cannot be consumed twice in test store',async()=>{
  const store=createGrantTestStore(),args={...makeGrant(),secret,now,store};
  assert.equal((await validateAndConsumeDeviceGrant(args)).ok,true);
  assert.deepEqual(await validateAndConsumeDeviceGrant(args),
    {ok:false,reason:'GRANT_ALREADY_USED'});
});
