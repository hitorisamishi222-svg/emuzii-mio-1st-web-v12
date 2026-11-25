// Isolated Preview claim endpoint. Production stays fail-closed until the
// separate release gates and legacy API authorization integration are done.
import pg from 'pg';
import {createClaimApi, pgChallengeStore, pgLimiter} from './mio-claim-api-vnext.mjs';
import {claimIssuedAccess} from './mio-level-registration-vnext.mjs';
import {codeDigest} from './mio-level-access-vnext.mjs';
import {isSyntheticPreview, isSyntheticTestId} from './mio-level-preview-scope.mjs';

const {Pool} = pg;
let pool;
function database() {
  if (!isSyntheticPreview(process.env, {host: process.env.VERCEL_URL, origin: `https://${process.env.VERCEL_URL}`}))
    throw Error('PREVIEW_SCOPE_REQUIRED');
  if (!process.env.MIO_LEVEL_ACCESS_PEPPER || process.env.MIO_LEVEL_ACCESS_PEPPER.length < 48)
    throw Error('CONFIG_REQUIRED');
  if (!pool) pool = new Pool({connectionString: process.env.MIO_LEVEL_DATABASE_URL,
    ssl: {rejectUnauthorized: true}, max: 6, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000, application_name: 'mio-recovery-preview'});
  return pool;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex,nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const host = String(req.headers.host || '');
  const origin = String(req.headers.origin || '');
  if (!isSyntheticPreview(process.env, {host, origin}))
    return res.status(503).json({ok:false,error:'PREVIEW_ONLY'});
  if (req.method !== 'POST') {res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '') ||
      Number(req.headers['content-length'] || 0) > 12000)
    return res.status(400).json({ok:false,error:'INVALID_REQUEST'});
  const db = database();
  const pepper = process.env.MIO_LEVEL_ACCESS_PEPPER;
  const url = `https://${host}`;
  const api = createClaimApi({db, store:pgChallengeStore(db), limiter:pgLimiter(db),
    origin:url, pepper, enabled:true, clock:Date.now,
    claimIssuedAccess: async args => {
      const digest = codeDigest(args.code, pepper);
      const row = (await db.query("SELECT master_id FROM mio_level_invites_v1 WHERE code_hash=$1 AND status='issued'",[digest])).rows[0];
      if (!row || !isSyntheticTestId(row.master_id)) throw Error('PREVIEW_SYNTHETIC_ID_REQUIRED');
      return claimIssuedAccess(args);
    }});
  const forwarded = String(req.headers['x-forwarded-for'] || 'preview-client').split(',')[0].trim();
  const out = await api({method:req.method, requestOrigin:origin,
    contentType:req.headers['content-type'], body:req.body,
    clientId:forwarded || 'preview-client'});
  for (const [key,value] of Object.entries(out.headers || {})) res.setHeader(key,value);
  return res.status(out.status).json(out.body);
}
