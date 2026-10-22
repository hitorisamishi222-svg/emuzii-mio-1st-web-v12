/**
 * Real SimpleWebAuthn registration verification against ephemeral ES256 keys.
 * NOTE: genuine WebAuthn cryptographic verification by library; synthetic
 * software authenticator, NOT a real iPhone/Android biometric test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {participantWebauthnV208 as webauthn} from '../participant-webauthn-server-v208.js';
import {syntheticRegistration} from './helpers/participant-registration-fixture-v217.mjs';
const rpID='mio-staging.test',origin='https://'+rpID;
const challenge=()=>randomBytes(32).toString('base64url');
async function inspect(response,expectedChallenge){
  return webauthn.verifyRegistrationResponse({
    response,expectedChallenge,expectedOrigin:origin,
    expectedRPID:rpID,requireUserVerification:true
  });
}
async function mustDeny(response,expectedChallenge){
  try{
    const result=await inspect(response,expectedChallenge);
    assert.equal(result.verified,false,'invalid registration must not verify');
  }catch(error){
    if(error?.name==='AssertionError')throw error;
  }
}
test('none attestation with valid ES256 public key is verified',async()=>{
  const nonce=challenge();
  const proof=await inspect(syntheticRegistration({challenge:nonce,format:'none'}),nonce);
  assert.equal(proof.verified,true);
  assert.ok(proof.registrationInfo?.credential?.publicKey?.length>0);
  assert.equal(proof.registrationInfo.credential.counter,0);
});
test('packed self-attestation ES256 signature verifies cryptographically',async()=>{
  const nonce=challenge();
  const proof=await inspect(syntheticRegistration({challenge:nonce}),nonce);
  assert.equal(proof.verified,true);
  assert.ok(proof.registrationInfo?.credential?.id);
});
test('tampered packed attestation signature is rejected',async()=>{
  const nonce=challenge();
  await mustDeny(syntheticRegistration({challenge:nonce,brokenSignature:true}),nonce);
});
test('packed self-attestation with unrelated private key is rejected',async()=>{
  const nonce=challenge();
  await mustDeny(syntheticRegistration({challenge:nonce,differentSigningKey:true}),nonce);
});
test('origin mismatch is rejected',async()=>{
  const nonce=challenge();
  await mustDeny(syntheticRegistration({challenge:nonce,origin:'https://evil.example'}),nonce);
});
test('RP ID mismatch is rejected',async()=>{
  const nonce=challenge();
  await mustDeny(syntheticRegistration({challenge:nonce,rpID:'evil.example'}),nonce);
});
test('user verification UV missing is rejected',async()=>{
  const nonce=challenge();
  await mustDeny(syntheticRegistration({challenge:nonce,uv:false}),nonce);
});
test('user presence UP missing is rejected',async()=>{
  const nonce=challenge();
  await mustDeny(syntheticRegistration({challenge:nonce,up:false}),nonce);
});
test('challenge mismatch is rejected',async()=>{
  const nonce=challenge();
  await mustDeny(syntheticRegistration({challenge:challenge()}),nonce);
});
test('WebAuthn operation type mismatch is rejected',async()=>{
  const nonce=challenge();
  await mustDeny(syntheticRegistration({challenge:nonce,clientType:'webauthn.get'}),nonce);
});
test('raw credential id mismatch is rejected',async()=>{
  const nonce=challenge();
  await mustDeny(syntheticRegistration({challenge:nonce,rawIdMismatch:true}),nonce);
});
