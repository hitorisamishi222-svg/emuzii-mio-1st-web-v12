// Isolated Node.js authentication primitives. NOT a login endpoint or persistent store.
// Password hashes use scrypt with per-password random salt and bounded parameters.
// The database adapter, abuse limits, CSRF and WebAuthn verification are not implemented here.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
const PREFIX = 'scrypt-v1';
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('invalid password length');
  const salt = randomBytes(32);
  const hash = await scrypt(password, salt, 64, PARAMS);
  return [PREFIX, salt.toString('base64url'), hash.toString('base64url')].join('$');
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string' || password.length > 1024) return false;
  const parts = encoded.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const salt = Buffer.from(parts[1], 'base64url');
  const expected = Buffer.from(parts[2], 'base64url');
  if (salt.length !== 32 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, 64, PARAMS);
  return timingSafeEqual(actual, expected);
}
export function createSessionSecret() { return randomBytes(32).toString('base64url'); }
export function sessionTokenDigest(secret) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('invalid session token');
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}
// Store only the digest in the database; issue the secret in an HttpOnly cookie.
// Cookie issuance, revocation and authorization MUST be enforced server-side.
