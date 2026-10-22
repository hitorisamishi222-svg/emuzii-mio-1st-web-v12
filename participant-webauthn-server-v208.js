/**
 * Server-only, isolated participant WebAuthn adapter.
 * Rejects response credential ID mismatch with the credential ID embedded
 * in the attested authentication data. Some upstream versions accept
 * mismatching IDs unless the relying-party layer checks them explicitly.
 *
 * Staging ONLY. Does not alter gallery-admin WebAuthn.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse as upstreamVerifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';

function canonicalCredentialId(id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{16,1024}$/.test(id))
    return null;
  try{
    const decoded=Buffer.from(id,'base64url');
    if(decoded.length<12||decoded.toString('base64url')!==id)return null;
    return id;
  }catch{return null}
}
async function verifyParticipantRegistrationResponse(options){
  const response=options?.response;
  const claimed=canonicalCredentialId(response?.id);
  const raw=canonicalCredentialId(response?.rawId);
  if(!claimed||raw!==claimed)
    return {verified:false};
  const verified=await upstreamVerifyRegistrationResponse(options);
  if(verified?.verified!==true)return verified;
  const attested=canonicalCredentialId(verified?.registrationInfo?.credential?.id);
  if(attested!==claimed)return {verified:false};
  return verified;
}
export const participantWebauthnV208=Object.freeze({
  generateRegistrationOptions,
  verifyRegistrationResponse:verifyParticipantRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
});
