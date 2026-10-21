/**
 * Staging-only verified operation grant. Never expose raw grant to the browser.
 * The grant is created inside the same DB transaction that verifies WebAuthn UV.
 * The grant is scoped to MIO-ID, caller browser credential, operation and target.
 *
 * IMPORTANT: No public HTTP handler imports this module. Server-only secret
 * bearer grants MUST be kept in the backend and never derived from IP/name.
 */
import {createHash,randomBytes} from 'node:crypto';
import {LinkError,linkVerifiedBrowser,revokeVerifiedBrowser,listVerifiedBrowsers} from './participant-device-store-v204.js';

const ID=/^MIO-[0-9]{4}$/;
const BROWSER=/^MIO-W-[a-f0-9]{24}$/;
const HASH=/^[a-f0-9]{64}$/;
const OPS=new Set(['link-browser','revoke-browser','list-browsers']);
const digest=x=>createHash('sha256').update(x).digest('hex');
const err=code=>{throw new LinkError(code)};

function checkScope(scope){
  if(!ID.test(scope?.mioId||'')||!HASH.test(scope?.actorTokenHash||'')||
     !BROWSER.test(scope?.actorBrowserId||'')||!OPS.has(scope?.operation))
    err('INVALID_GRANT_SCOPE');
  if(scope.operation==='list-browsers'){
    if(scope.targetBrowserId!==null)err('INVALID_GRANT_TARGET');
  }else if(!BROWSER.test(scope.targetBrowserId||''))err('INVALID_GRANT_TARGET');
}

/**
 * Invoke ONLY inside finishParticipantPasskeyAuthentication(context.onVerified)
 * and use its existing client/transaction. This does not grant access by itself.
 * The operation target and caller identity MUST come from server-side context.
 */
export async function issueVerifiedOperationGrant(client,scope){
  checkScope(scope);
  const grant=randomBytes(32).toString('hex');
  const r=await client.query(`INSERT INTO mio_verified_operation_grants_v205
      (grant_hash,mio_id,actor_browser_id,actor_token_hash,operation,target_browser_id,method,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'webauthn-uv',now()+interval '90 seconds')
      RETURNING grant_hash`,
    [digest(grant),scope.mioId,scope.actorBrowserId,scope.actorTokenHash,
      scope.operation,scope.targetBrowserId]);
  if(r.rowCount!==1)err('GRANT_NOT_ISSUED');
  // Server-only return; never serialize to an HTTP response.
  return grant;
}

/**
 * The only exported grant consumer used by the internal operation wrapper.
 * db must be the trusted server-side Postgres Pool.
 */
export function createVerifiedGrantConsumer({db,grant,actorBrowserId,actorTokenHash}){
  if(!db||typeof db.connect!=='function')err('DATABASE_REQUIRED');
  if(typeof grant!=='string'||!/^[a-f0-9]{64}$/.test(grant))err('INVALID_GRANT');
  if(!BROWSER.test(actorBrowserId||'')||!HASH.test(actorTokenHash||''))err('INVALID_ACTOR');
  let attempted=false;
  return async ({mioId,operation,targetBrowserId})=>{
    if(attempted)err('GRANT_ALREADY_ATTEMPTED');
    attempted=true;
    if(!ID.test(mioId||'')||!OPS.has(operation))err('INVALID_GRANT_SCOPE');
    if(operation==='list-browsers' ? targetBrowserId!==null : !BROWSER.test(targetBrowserId||''))
      err('INVALID_GRANT_TARGET');
    const client=await db.connect();let tx=false;
    try{
      await client.query('BEGIN');tx=true;
      const r=await client.query(`UPDATE mio_verified_operation_grants_v205
        SET consumed_at=now()
        WHERE grant_hash=$1 AND mio_id=$2 AND actor_browser_id=$3
          AND actor_token_hash=$4 AND operation=$5
          AND target_browser_id IS NOT DISTINCT FROM $6
          AND consumed_at IS NULL AND expires_at>now()
        RETURNING mio_id,method`,
        [digest(grant),mioId,actorBrowserId,actorTokenHash,operation,targetBrowserId]);
      if(r.rowCount!==1)err('GRANT_EXPIRED_USED_OR_MISMATCHED');
      await client.query('COMMIT');tx=false;
      return {mioId,userVerified:true,challengeConsumed:true,method:r.rows[0].method,actorBrowserId};
    }catch(e){if(tx)await client.query('ROLLBACK').catch(()=>{});throw e}
    finally{client.release()}
  };
}

/**
 * Single-use internal dispatch. Not wired to public routes or GAS.
 * A successful WebAuthn assertion must have issued the server-held grant
 * for the same actor, MIO-ID, operation and exact target.
 */
export async function runVerifiedDeviceOperation({db,grant,actorBrowserId,actorTokenHash,
  mioId,operation,browserId,tokenHash,targetBrowserId}){
  if(!OPS.has(operation))err('INVALID_OPERATION');
  const verifyOwnership=createVerifiedGrantConsumer({db,grant,actorBrowserId,actorTokenHash});
  const ctx={db,verifyOwnership};
  if(operation==='link-browser')return linkVerifiedBrowser({mioId,browserId,tokenHash},ctx);
  if(operation==='revoke-browser')return revokeVerifiedBrowser({mioId,targetBrowserId},ctx);
  return listVerifiedBrowsers(mioId,ctx);
}
