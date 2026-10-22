/**
 * Staging-only, read-only GAS identity preflight for participant passkeys.
 * Never uses name, IP, loginId, or a public request flag as identity proof.
 * This cannot authenticate a user by itself; v210 still requires fresh step-up.
 *
 * GAS v12/v1.9.1 does NOT expose the v212 attestation fields below.
 * Therefore production must remain fail-closed until actual GAS deployment
 * is audited and safely updated with server-derived attestations.
 */
import {readSession,hash,bridge} from './bridge.js';
const MIO_ID=/^MIO-[0-9]{4}$/;
const WEB_ID=/^MIO-W-[a-f0-9]{24}$/;
const TOKEN_HASH=/^[a-f0-9]{64}$/;
export class GasIdentityDenied extends Error {
  constructor(code){super(code);this.name='GasIdentityDenied';this.code=code}
}
const deny=code=>{throw new GasIdentityDenied(code)};

/** For authenticated GAS results only, after BRIDGE_SECRET and tokenHash verification. */
export function requireGasIdentityAttestation(status,webId){
  if(!WEB_ID.test(webId||'')||status?.ok!==true||
     status.participantId!==webId||status.status!=='承認済み')
    deny('GAS_APPROVAL_NOT_VERIFIED');
  if(!MIO_ID.test(status.integratedParticipantId||'')||
     status.identityLinked!==true||status.attendanceLinked!==true)
    deny('GAS_MIO_LINK_NOT_VERIFIED');
  // Missing and revoked device statuses fail closed, including legacy GAS v12.
  if(status.deviceActive!==true)deny('GAS_DEVICE_NOT_VERIFIED');
  return status.integratedParticipantId;
}

/**
 * getCookieHeader must be a trusted server request accessor.
 * statusRequest may be replaced by a stub only in isolated tests;
 * the default uses bridge().
 * Caller must not accept statusRequest or sessionSecret from an HTTP body.
 */
export function createGasIdentitySessionResolver({
  getCookieHeader,sessionSecret,statusRequest=bridge
}={}){
  if(typeof getCookieHeader!=='function'||
     typeof sessionSecret!=='string'||sessionSecret.length<32||
     typeof statusRequest!=='function')deny('GAS_RESOLVER_NOT_CONFIGURED');
  return async function resolveSession(){
    const signed=readSession(await getCookieHeader(),sessionSecret);
    if(!signed||!WEB_ID.test(signed.id))deny('SESSION_NOT_VERIFIED');
    const tokenHash=hash(signed.token);
    if(!TOKEN_HASH.test(tokenHash))deny('SESSION_NOT_VERIFIED');
    // Only the trusted GAS bridge supplies this state, after its own approval check.
    const status=await statusRequest('status',{
      participantId:signed.id,tokenHash
    });
    const mioId=requireGasIdentityAttestation(status,signed.id);
    return {mioId,browserId:signed.id,tokenHash,active:true};
  };
}
