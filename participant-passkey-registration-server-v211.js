/**
 * Server-only first-passkey registration facade.
 * Bind MIO-ID and browser token to a trusted session, never to req.body.
 * verifyStepUp is a server-only, single-use verifier (NOT a boolean).
 * Staging only: production GAS mapping and actual step-up are not wired.
 */
import {createBootstrapVerifier} from './participant-bootstrap-guard-v210.js';
import {beginParticipantPasskeyRegistration,finishParticipantPasskeyRegistration} from './participant-passkey-core-v204.js';
export class RegistrationSessionDenied extends Error{
  constructor(code){super(code);this.name='RegistrationSessionDenied'}
}
const MIO=/^MIO-[0-9]{4}$/;
const HASH=/^[a-f0-9]{64}$/;
const BROWSER=/^MIO-W-[a-f0-9]{24}$/;
function checkedSession(session){
  if(!MIO.test(session?.mioId||'')||!HASH.test(session?.tokenHash||'')||
    !BROWSER.test(session?.browserId||'')||session?.active!==true)
    throw new RegistrationSessionDenied('SESSION_NOT_VERIFIED');
  return {mioId:session.mioId,browserTokenHash:session.tokenHash};
}
export function createServerPasskeyRegistration({
  db,webauthn,rpID,origin,rpName,resolveSession,verifyStepUp
}={}){
  if(typeof resolveSession!=='function'||typeof verifyStepUp!=='function'||
    typeof db?.connect!=='function'||!webauthn)
    throw new RegistrationSessionDenied('TRUSTED_DEPENDENCIES_REQUIRED');
  // Bind the *same resolved session* to bootstrap and core. The untrusted
  // client supplies only its WebAuthn response on completion.
  async function execute(operation,response){
    const session=await resolveSession();
    const input=checkedSession(session);
    const verifyBootstrap=createBootstrapVerifier({
      db,resolveSession:async()=>session,verifyStepUp
    });
    const ctx={db,webauthn,rpID,origin,rpName,verifyBootstrap};
    return operation==='begin'?
      beginParticipantPasskeyRegistration(input,ctx):
      finishParticipantPasskeyRegistration({...input,response},ctx);
  }
  return Object.freeze({
    begin:()=>execute('begin'),
    finish:response=>execute('finish',response)
  });
}
