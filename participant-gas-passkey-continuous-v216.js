/**
 * Staging-only GAS-backed passkey enrollment, using one initial step-up.
 * GAS must independently attest exact MIO-ID, approved browser and active
 * device. GAS v12 currently does not provide these fields: fail closed.
 * Server-provided callbacks only. Never mount this file as public API.
 */
import {createGasIdentitySessionResolver} from './participant-gas-identity-preflight-v212.js';
import {createContinuousServerPasskeyRegistration} from './participant-passkey-registration-continuous-v215.js';
import {participantWebauthnV208} from './participant-webauthn-server-v208.js';

export function createContinuousGasPasskeyRegistration({
  db,getCookieHeader,sessionSecret,verifyStepUp,origin,rpID,rpName,
  statusRequest,webauthn=participantWebauthnV208
}={}){
  if(typeof db?.connect!=='function'||typeof getCookieHeader!=='function'||
     typeof verifyStepUp!=='function'||
     typeof webauthn?.generateRegistrationOptions!=='function'||
     typeof webauthn?.verifyRegistrationResponse!=='function'||
     typeof rpID!=='string'||typeof origin!=='string')
    throw Error('CONTINUOUS_GAS_DEPENDENCIES_REQUIRED');
  const resolveSession=createGasIdentitySessionResolver({
    getCookieHeader,sessionSecret,statusRequest
  });
  return createContinuousServerPasskeyRegistration({
    db,webauthn,rpID,origin,rpName,resolveSession,verifyStepUp
  });
}
