import {createHmac} from 'node:crypto';

/**
 * A lost-cookie recovery must NOT mint a new Web-ID. This returns a token only.
 * GAS looks up the operator-approved *existing* Web-ID from a one-time grant.
 * Derivation allows the same browser retry to rebind the very same token.
 */
export function recoveryToken(retryKey,issuedAt,secret,now=Date.now()){
  if(typeof retryKey!=='string'||!/^[a-f0-9]{64}$/.test(retryKey)||
     !Number.isSafeInteger(issuedAt)||typeof secret!=='string'||secret.length<32||
     !Number.isSafeInteger(now))return null;
  const age=now-issuedAt;
  if(age < -60000 || age > 15*60*1000)return null;
  return createHmac('sha256',secret)
    .update('mio-verified-recovery-token-v2:'+issuedAt+':'+retryKey)
    .digest('hex');
}
