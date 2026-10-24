import {createHmac} from 'node:crypto';

// A short-lived, server-derived browser identity makes an ambiguous network
// timeout retryable without creating another Web-ID. Never persist raw tokens.
export function recoveryIdentity(retryKey, issuedAt, secret) {
  if(typeof retryKey !== 'string' || !/^[a-f0-9]{64}$/.test(retryKey) ||
     !Number.isSafeInteger(issuedAt) || typeof secret !== 'string') return null;
  const age = Date.now() - issuedAt;
  if(age < -60000 || age > 15 * 60 * 1000) return null;
  const material = issuedAt + ':' + retryKey;
  const make = purpose => createHmac('sha256', secret)
    .update('mio-verified-recovery-v1:' + purpose + ':' + material).digest('hex');
  return {id: 'MIO-W-' + make('id').slice(0, 24), token: make('token')};
}
