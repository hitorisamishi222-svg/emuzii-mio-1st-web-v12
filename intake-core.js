import {createHmac} from 'node:crypto';

export const INTAKE_SCHEMA = 'mio_intake_v1';
export const INTAKE_KINDS = new Set(['new', 'device-change']);

// This switch is entirely separate from MIO_REGISTRATION_RELEASE.
// No fallback to the production GAS or gallery database is permitted.
export function intakeConfiguration(env = process.env) {
  const stage = env.VERCEL_ENV;
  if (stage !== 'preview' && stage !== 'production') return null;
  if (env.MIO_INTAKE_RELEASE !== 'isolated-intake-' + stage + '-v1') return null;
  if (env.MIO_INTAKE_DB_SCOPE !== 'mio-intake-only-v1') return null;
  const connectionString = env.MIO_INTAKE_DATABASE_URL || '';
  const pepper = env.MIO_INTAKE_RATE_SECRET || '';
  if (!connectionString || pepper.length < 32) return null;
  if (connectionString === env.GALLERY_DATABASE_URL ||
      connectionString === env.MIO_TEST_DATABASE_URL ||
      connectionString === env.DATABASE_URL) return null;
  try {
    const u = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(u.protocol) ||
        !u.hostname || !u.password || u.username !== 'mio_intake_writer' ||
        decodeURIComponent(u.pathname) !== '/mio_intake' ||
        u.searchParams.get('sslmode') === 'disable') return null;
    return {connectionString, pepper, stage};
  } catch {return null;}
}

export function validateApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  // Honeypot: never persist spam fields or distinguish spammers by error text.
  if (body.website) return null;
  if (body.consent !== true || !INTAKE_KINDS.has(body.kind) || typeof body.nickname !== 'string' ||
      typeof body.requestKey !== 'string' ||
      !/^[a-f0-9]{32}$/.test(body.requestKey)) return null;
  const nickname = body.nickname.trim().normalize('NFKC');
  if (!nickname || nickname.length > 40 ||
      /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(nickname)) return null;
  return {kind:body.kind, nickname, requestKey:body.requestKey};
}

export function allowedRequest(req) {
  if (req.method !== 'POST') return false;
  const host = String(req.headers?.host || '').toLowerCase();
  // Only the existing MIO Vercel project is eligible. Do not trust arbitrary preview domains.
  if (!(host === 'emuzii-mio-1st-web-v12.vercel.app' ||
        /^emuzii-mio-1st-web-v12-[a-z0-9-]+\.vercel\.app$/.test(host))) return false;
  const origin = String(req.headers?.origin || '');
  if (origin !== 'https://' + host) return false;
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.['content-type'] || ''))) return false;
  const len = Number(req.headers?.['content-length'] || 0);
  if (!Number.isFinite(len) || len < 0 || len > 2048) return false;
  try {return Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8') <= 2048;}
  catch {return false;}
}

export function requesterDigest(ip, pepper) {
  const value = String(ip || '').trim();
  if (!value || value.length > 100 || /[^a-zA-Z0-9.:]/.test(value)) return null;
  return createHmac('sha256', pepper).update('mio-intake-v1:' + value).digest('hex');
}

export function requestKeyDigest(key, pepper) {
  return createHmac('sha256', pepper).update('mio-intake-idempotency:' + key).digest('hex');
}
