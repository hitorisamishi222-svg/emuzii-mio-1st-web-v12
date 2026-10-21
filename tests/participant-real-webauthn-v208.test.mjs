/**
 * CI cryptographic WebAuthn authentication vectors: genuine ECDSA P-256
 * signatures verified by @simplewebauthn/server v13, never mock verify().
 * Synthetic authenticator is software in CI; not an iPhone Face ID test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,createSign,randomBytes} from 'node:crypto';
import {participantWebauthnV208 as webauthn} from '../participant-webauthn-server-v208.js';

const rpID='mio-staging.test';
const origin='https://'+rpID;
const hash=v=>createHash('sha256').update(v).digest();
const b64=v=>Buffer.from(v).toString('base64url');

function createAuthenticator(){
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const jwk=publicKey.export({format:'jwk'});
  const x=Buffer.from(jwk.x,'base64url'),y=Buffer.from(jwk.y,'base64url');
  // COSE_Key EC2/P-256/ES256 CBOR: {1:2,3:-7,-1:1,-2:x,-3:y}.
  const cose=Buffer.concat([Buffer.from([0xa5,0x01,0x02,0x03,0x26,0x20,0x01,0x21,0x58,0x20]),x,Buffer.from([0x22,0x58,0x20]),y]);
  const id=b64(randomBytes(32));
  return {id,privateKey,credential:{id,publicKey:new Uint8Array(cose),counter:0,transports:['internal']}};
}

function signAssertion(a,{challenge,siteOrigin=origin,siteRPID=rpID,up=true,uv=true,counter=1,tamperSignature=false}={}){
  const clientData=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin:siteOrigin,crossOrigin:false}));
  const authData=Buffer.alloc(37);
  hash(siteRPID).copy(authData,0);
  authData[32]=(up?0x01:0)|(uv?0x04:0);
  authData.writeUInt32BE(counter,33);
  const signature=createSign('SHA256').update(Buffer.concat([authData,hash(clientData)])).sign(a.privateKey);
  if(tamperSignature)signature[signature.length-1]^=1;
  return {id:a.id,rawId:a.id,type:'public-key',response:{clientDataJSON:b64(clientData),authenticatorData:b64(authData),signature:b64(signature),userHandle:null},clientExtensionResults:{}};
}
async function verify(a,response,expectedChallenge,extra={}){
  return webauthn.verifyAuthenticationResponse({
    response,expectedChallenge,expectedOrigin:origin,expectedRPID:rpID,
    credential:a.credential,requireUserVerification:true,...extra
  });
}
const challenge=()=>b64(randomBytes(32));

test('real P-256 signature passes SimpleWebAuthn verifier with UV and matching RP',async()=>{
  const a=createAuthenticator(),nonce=challenge();
  const result=await verify(a,signAssertion(a,{challenge:nonce}),nonce);
  assert.equal(result.verified,true);
  assert.equal(result.authenticationInfo.newCounter,1);
  assert.equal(result.authenticationInfo.userVerified,true);
});
test('altered signature fails cryptographic verification',async()=>{
  const a=createAuthenticator(),nonce=challenge();
  await assert.rejects(verify(a,signAssertion(a,{challenge:nonce,tamperSignature:true}),nonce));
});
test('wrong origin rejected even with a valid ECDSA signature',async()=>{
  const a=createAuthenticator(),nonce=challenge();
  await assert.rejects(verify(a,signAssertion(a,{challenge:nonce,siteOrigin:'https://evil.example'}),nonce),/origin/i);
});
test('wrong RP ID rejected even with a valid signature',async()=>{
  const a=createAuthenticator(),nonce=challenge();
  await assert.rejects(verify(a,signAssertion(a,{challenge:nonce,siteRPID:'wrong.example'}),nonce),/RP ID|rpId/i);
});
test('UV missing rejected even when UP is set and signature valid',async()=>{
  const a=createAuthenticator(),nonce=challenge();
  await assert.rejects(verify(a,signAssertion(a,{challenge:nonce,uv:false}),nonce),/User verification required/i);
});
test('user presence missing rejected even when UV is set and signature valid',async()=>{
  const a=createAuthenticator(),nonce=challenge();
  await assert.rejects(verify(a,signAssertion(a,{challenge:nonce,up:false}),nonce),/User not present/i);
});
test('old counter rejected even with valid signature',async()=>{
  const a=createAuthenticator(),nonce=challenge();a.credential.counter=5;
  await assert.rejects(verify(a,signAssertion(a,{challenge:nonce,counter:5}),nonce),/counter/i);
});
test('different challenge rejected even with valid signature',async()=>{
  const a=createAuthenticator(),nonce=challenge();
  await assert.rejects(verify(a,signAssertion(a,{challenge:challenge()}),nonce),/challenge/i);
});
test('different stored authenticator public key rejects the signature',async()=>{
  const a=createAuthenticator(),unrelated=createAuthenticator(),nonce=challenge();
  await assert.rejects(verify(a,signAssertion(a,{challenge:nonce}),nonce,{credential:{...unrelated.credential,id:a.id}}));
});
