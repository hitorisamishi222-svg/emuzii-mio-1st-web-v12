/**
 * MIO v2.1.5 - STAGING ONLY.
 * One fresh step-up at begin(), one WebAuthn credential proof at finish().
 * The step-up is bound to the short-lived, single-use registration challenge
 * and the same independently verified MIO/browser session at both endpoints.
 *
 * NOT a public API. Trusted callbacks must be server-side fixed functions.
 * Existing v211 facade is retained for compatibility; this supersedes it.
 */
import {createBootstrapVerifier} from './participant-bootstrap-guard-v210.js';
import {createRegistrationContinuity} from './participant-registration-continuity-v214.js';
import {
  beginParticipantPasskeyRegistration,
  finishParticipantPasskeyRegistration
} from './participant-passkey-core-v204.js';

const MIO=/^MIO-[0-9]{4}$/;
const BROWSER=/^MIO-W-[a-f0-9]{24}$/;
const HASH=/^[a-f0-9]{64}$/;

function checkedSession(session){
  if(!MIO.test(session?.mioId||'')||
     !BROWSER.test(session?.browserId||'')||
     !HASH.test(session?.tokenHash||'')||
     session?.active!==true)
    throw Error('CONTINUOUS_SESSION_NOT_VERIFIED');
  return {mioId:session.mioId,browserTokenHash:session.tokenHash};
}
export function createContinuousServerPasskeyRegistration({
  db,webauthn,rpID,origin,rpName,resolveSession,verifyStepUp
}={}){
  if(typeof db?.connect!=='function'||
     typeof resolveSession!=='function'||
     typeof verifyStepUp!=='function'||
     typeof webauthn?.generateRegistrationOptions!=='function'||
     typeof webauthn?.verifyRegistrationResponse!=='function')
    throw Error('CONTINUOUS_TRUSTED_DEPENDENCIES_REQUIRED');
  const continuity=createRegistrationContinuity({db});
  const base={db,webauthn,rpID,origin,rpName};
  return Object.freeze({
    async begin(){
      const session=await resolveSession();
      const input=checkedSession(session);
      let approvedMethod=null;
      const guard=createBootstrapVerifier({
        db,resolveSession:async()=>session,verifyStepUp
      });
      const beginResult=await beginParticipantPasskeyRegistration(input,{
        ...base,
        verifyBootstrap:async({mioId})=>{
          const p=await guard({mioId});
          approvedMethod=p.method;
          return p;
        }
      });
      if(!approvedMethod)throw Error('CONTINUOUS_STEP_UP_MISSING');
      await continuity.stage({
        session,challenge:beginResult.options.challenge,method:approvedMethod
      });
      return beginResult;
    },
    async finish(response){
      // Verify GAS identity and session again; cannot use a different browser.
      const session=await resolveSession();
      const input=checkedSession(session);
      // A verified one-time bootstrap is bound to exactly this response
      // challenge. It is NOT fresh step-up, and grants no privileges alone.
      const proof=await continuity.verify({session,response});
      return finishParticipantPasskeyRegistration({...input,response},{
        ...base,
        verifyBootstrap:async({mioId})=>{
          if(proof.mioId!==mioId||proof.browserId!==session.browserId||
             proof.tokenHash!==session.tokenHash||
             proof.userVerified!==true||proof.consumed!==true)
            throw Error('CONTINUOUS_PROOF_MISMATCH');
          return {mioId,userVerified:true,deviceApproved:true,method:proof.method};
        }
      });
    }
  });
}
