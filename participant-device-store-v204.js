/**
 * MIO v2.0.4 — staging only. Postgres-backed, max-5 verified browser links.
 *
 * TRUST BOUNDARY: This module MUST NOT be called directly by a public HTTP
 * handler with user-supplied ownershipProof. verifyOwnership is a trusted
 * server-side verifier that independently validates and CONSUMES a fresh
 * WebAuthn/passkey assertion or a strongly approved old-device pairing proof.
 * Never infer ownership from MIO-ID, IP, ColorSing name or browser ID alone.
 *
 * No current production route imports this file. Does not touch GAS or gacha.
 */
export const MAX_APPROVED_BROWSERS = 5;
const MIO_ID = /^MIO-[0-9]{4}$/;
const BROWSER_ID = /^MIO-W-[a-f0-9]{24}$/;
const TOKEN_HASH = /^[a-f0-9]{64}$/;
const METHODS = new Set(['webauthn-uv', 'approved-device-pairing']);

export class LinkError extends Error {
  constructor(code){super(code);this.name='LinkError';this.code=code;}
}

function ids(payload, hasTarget = false){
  if (!MIO_ID.test(payload?.mioId || '')) throw new LinkError('INVALID_MIO_ID');
  const browser = hasTarget ? payload.targetBrowserId : payload.browserId;
  if (!BROWSER_ID.test(browser || '')) throw new LinkError('INVALID_BROWSER_ID');
  if (!hasTarget && !TOKEN_HASH.test(payload?.tokenHash || '')) throw new LinkError('INVALID_TOKEN_HASH');
}

async function validateVerifiedOwnership(mioId, operation, targetBrowserId, verifyOwnership) {
  if (typeof verifyOwnership !== 'function') throw new LinkError('VERIFIER_REQUIRED');
  // Verification happens on the trusted server, never through a caller-supplied flag.
  const proof = await verifyOwnership({mioId, operation, targetBrowserId});
  if (!proof || proof.mioId !== mioId || proof.userVerified !== true ||
      proof.challengeConsumed !== true || !METHODS.has(proof.method))
    throw new LinkError('VERIFICATION_REQUIRED');
  if (proof.actorBrowserId != null && !BROWSER_ID.test(proof.actorBrowserId))
    throw new LinkError('INVALID_ACTOR');
  return {method:proof.method, actorBrowserId:proof.actorBrowserId || null};
}

async function inTransaction(db, operation){
  if (!db || typeof db.connect !== 'function') throw new LinkError('DATABASE_REQUIRED');
  const client = await db.connect();
  let started = false;
  try {
    await client.query('BEGIN'); started = true;
    const result = await operation(client);
    await client.query('COMMIT'); started = false;
    return result;
  } catch(err) {
    if(started) await client.query('ROLLBACK').catch(()=>{});
    throw err;
  } finally { client.release(); }
}

async function lockParticipant(c,mioId){
  // Serializes all v204 writes for the same MIO-ID across concurrent requests.
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 20261021))',[mioId]);
}

export async function linkVerifiedBrowser(payload,{db,verifyOwnership}={}){
  ids(payload);
  const {mioId,browserId,tokenHash}=payload;
  const verifier = await validateVerifiedOwnership(mioId,'link-browser',browserId,verifyOwnership);
  return inTransaction(db,async c=>{
    await lockParticipant(c,mioId);
    const existing = await c.query(
      'SELECT mio_id,browser_id,token_hash,status FROM mio_browser_links_v204 WHERE browser_id=$1 FOR UPDATE',
      [browserId]
    );
    if(existing.rows.length){
      const row=existing.rows[0];
      if(row.mio_id!==mioId || row.token_hash!==tokenHash)
        throw new LinkError('BROWSER_ALREADY_BOUND');
      if(row.status!=='active') throw new LinkError('BROWSER_REVOKED');
      return {linked:true,created:false,browserId,mioId};
    }
    const count=await c.query(
      "SELECT count(*)::integer AS count FROM mio_browser_links_v204 WHERE mio_id=$1 AND status='active'",
      [mioId]
    );
    if(Number(count.rows[0]?.count||0)>=MAX_APPROVED_BROWSERS)
      throw new LinkError('BROWSER_LIMIT_REACHED');
    const inserted=await c.query(
      `INSERT INTO mio_browser_links_v204
        (mio_id,browser_id,token_hash,status,verified_method)
       VALUES($1,$2,$3,'active',$4)
       ON CONFLICT (browser_id) DO NOTHING RETURNING browser_id`,
      [mioId,browserId,tokenHash,verifier.method]
    );
    // Concurrent insertion against a different MIO-ID is fail-closed.
    if(inserted.rowCount!==1) throw new LinkError('BROWSER_ALREADY_BOUND');
    await c.query(
      `INSERT INTO mio_browser_link_audit_v204
       (mio_id,browser_id,action,actor_browser_id,verification_method)
       VALUES($1,$2,'linked',$3,$4)`,
      [mioId,browserId,verifier.actorBrowserId,verifier.method]
    );
    return {linked:true,created:true,browserId,mioId};
  });
}

export async function revokeVerifiedBrowser(payload,{db,verifyOwnership}={}){
  ids(payload,true);
  const {mioId,targetBrowserId}=payload;
  const verifier=await validateVerifiedOwnership(mioId,'revoke-browser',targetBrowserId,verifyOwnership);
  return inTransaction(db,async c=>{
    await lockParticipant(c,mioId);
    const count=await c.query(
      "SELECT count(*)::integer AS count FROM mio_browser_links_v204 WHERE mio_id=$1 AND status='active'",
      [mioId]
    );
    const target=await c.query(
      'SELECT status FROM mio_browser_links_v204 WHERE mio_id=$1 AND browser_id=$2 FOR UPDATE',
      [mioId,targetBrowserId]
    );
    if(!target.rows.length) throw new LinkError('BROWSER_NOT_FOUND');
    if(target.rows[0].status!=='active')return {revoked:true,already:true,mioId,browserId:targetBrowserId};
    if(Number(count.rows[0]?.count||0)<=1) throw new LinkError('LAST_BROWSER_RECOVERY_REQUIRED');
    const update=await c.query(
      `UPDATE mio_browser_links_v204 SET status='revoked',revoked_at=now()
       WHERE mio_id=$1 AND browser_id=$2 AND status='active' RETURNING browser_id`,
      [mioId,targetBrowserId]
    );
    if(update.rowCount!==1)throw new LinkError('REVOKE_CONFLICT');
    await c.query(
      `INSERT INTO mio_browser_link_audit_v204
       (mio_id,browser_id,action,actor_browser_id,verification_method)
       VALUES($1,$2,'revoked',$3,$4)`,
      [mioId,targetBrowserId,verifier.actorBrowserId,verifier.method]
    );
    return {revoked:true,already:false,mioId,browserId:targetBrowserId};
  });
}

export async function listVerifiedBrowsers(mioId,{db,verifyOwnership}={}){
  if(!MIO_ID.test(mioId || ''))throw new LinkError('INVALID_MIO_ID');
  await validateVerifiedOwnership(mioId,'list-browsers',null,verifyOwnership);
  if(!db || typeof db.query !== 'function')throw new LinkError('DATABASE_REQUIRED');
  const out=await db.query(
    `SELECT browser_id,verified_method,linked_at FROM mio_browser_links_v204
     WHERE mio_id=$1 AND status='active' ORDER BY linked_at ASC,browser_id ASC`,
    [mioId]
  );
  return {mioId,devices:out.rows.map(r=>({browserId:r.browser_id,method:r.verified_method,linkedAt:r.linked_at}))};
}
