/**
 * MIO v2.1.3 — STAGING ONLY. Server-controlled GAS -> passkey registration.
 * No production API imports this module; no URL, database, or GAS changes.
 *
 * Identity is derived from a signed legacy browser session and an authenticated
 * GAS status response. A fresh, trusted step-up is still required by v210.
 * Never accept statusRequest, verifyStepUp, or sessionSecret from req.body.
 */
import {createGasIdentitySessionResolver} from './participant-gas-identity-preflight-v212.js';
import {createServerPasskeyRegistration} from './participant-passkey-registration-server-v211.js';
import {participantWebauthnV208} from './participant-webauthn-server-v208.js';

export function createStagedGasPasskeyRegistration({
  db,getCookieHeader,sessionSecret,verifyStepUp,origin,rpID,rpName,
  statusRequest,webauthn=participantWebauthnV208
}={}){
  if(!db||typeof db.connect!=='function'||
     typeof getCookieHeader!=='function'||
     typeof verifyStepUp!=='function'||
     typeof rpID!=='string'||typeof origin!=='string'||
     !webauthn||typeof webauthn.generateRegistrationOptions!=='function'||
     typeof webauthn.verifyRegistrationResponse!=='function')
    throw Error('STAGING_TRUSTED_DEPENDENCIES_REQUIRED');
  const resolveSession=createGasIdentitySessionResolver({
    getCookieHeader,sessionSecret,statusRequest
  });
  return createServerPasskeyRegistration({
    db,webauthn,rpID,origin,rpName,resolveSession,verifyStepUp
  });
}
