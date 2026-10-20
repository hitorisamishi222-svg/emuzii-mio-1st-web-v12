import {readSession} from './bridge.js';
import {readRegistrationAttempt} from './registration-attempt.js';

// Advisory duplicate-registration guard. Never grants authentication or privileges.
// Do not treat a present but unverifiable legacy cookie as a new participant.
export function legacyIdentityState(cookie,secret){
 const raw=String(cookie||'');
 const hasLegacyCookie=/(?:^|;\s*)(?:mio_session|mio_registration_attempt)=/.test(raw);
 if(!hasLegacyCookie)return null;
 if(typeof secret!=='string'||secret.length<32)return 'unverified';
 if(readSession(raw,secret))return 'registered';
 if(readRegistrationAttempt(raw,secret))return 'pending';
 return 'unverified';
}
