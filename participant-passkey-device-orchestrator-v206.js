/**
 * STAGING ONLY. Server-side WebAuthn -> scoped one-use grant -> browser operation.
 * Never expose the grant or accept injected verifier/callback from an HTTP body.
 * Caller must resolve actor identity and target from trusted server state.
 * Not connected to production routes or GAS.
 */
import {finishParticipantPasskeyAuthentication} from './participant-passkey-core-v204.js';
import {issueVerifiedOperationGrant,runVerifiedDeviceOperation} from './participant-verified-operation-v205.js';

const OPERATIONS=new Set(['link-browser','revoke-browser','list-browsers']);
const BROWSER=/^MIO-W-[a-f0-9]{24}$/;
const HASH=/^[a-f0-9]{64}$/;
const MIO=/^MIO-[0-9]{4}$/;

export async function verifyPasskeyAndRunDeviceOperation({
  mioId, actorBrowserId, actorTokenHash, operation,
  browserId, tokenHash, targetBrowserId, response
}, {db,webauthn,rpID,origin}={}){
  if(!MIO.test(mioId||'')||!BROWSER.test(actorBrowserId||'')||
     !HASH.test(actorTokenHash||'')||!OPERATIONS.has(operation))
    throw Error('INVALID_OPERATION_CONTEXT');
  const target=operation==='link-browser'?browserId:
    operation==='revoke-browser'?targetBrowserId:null;
  if(operation!=='list-browsers'&&!BROWSER.test(target||''))
    throw Error('INVALID_OPERATION_TARGET');
  if(operation==='link-browser'&&!HASH.test(tokenHash||''))
    throw Error('INVALID_BROWSER_TOKEN');
  // The raw grant exists only in this server-side call frame.
  let grant=null;
  await finishParticipantPasskeyAuthentication(
    {mioId,browserTokenHash:actorTokenHash,response},
    {db,webauthn,rpID,origin,
      onVerified:async(client,proof)=>{
        if(proof.mioId!==mioId||proof.browserTokenHash!==actorTokenHash)
          throw Error('VERIFIED_CONTEXT_MISMATCH');
        grant=await issueVerifiedOperationGrant(client,{
          mioId,actorBrowserId,actorTokenHash,operation,targetBrowserId:target
        });
        return {ok:true};
      }
    }
  );
  if(!grant)throw Error('GRANT_NOT_ISSUED');
  return runVerifiedDeviceOperation({
    db,grant,actorBrowserId,actorTokenHash,mioId,operation,
    browserId,tokenHash,targetBrowserId
  });
}
