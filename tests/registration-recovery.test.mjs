import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {issueRegistrationAttempt,readRegistrationAttempt,clearRegistrationAttempt,identityFromRetryKey} from '../registration-attempt.js';
import {readSession,sessionCookie} from '../bridge.js';

const secret='unit-test-secret-with-sufficient-entropy-'+randomBytes(32).toString('hex');
const identity={id:'MIO-W-0123456789abcdef01234567',token:'a'.repeat(64)};
const toCookie=header=>header.split(';')[0];

test('signed pending legacy registration is recognized',()=>{
 const cookie=toCookie(issueRegistrationAttempt({...identity,name:'test singer',loginId:''},secret));
 const restored=readRegistrationAttempt(cookie,secret);
 assert.equal(restored?.id,identity.id);
 assert.equal(restored?.name,'test singer');
});
test('pending legacy registration cannot be forged with another secret',()=>{
 const cookie=toCookie(issueRegistrationAttempt({...identity,name:'test singer',loginId:''},secret));
 assert.equal(readRegistrationAttempt(cookie,secret+'wrong'),null);
 assert.equal(readRegistrationAttempt(cookie.replace(/(mio_registration_attempt=[^.]+\.)(.)/,(_,prefix,c)=>prefix+(c==='A'?'B':'A')),secret),null);
});
test('legacy authenticated session is distinguished from pending attempt',()=>{
 const cookie=toCookie(sessionCookie(identity.id,identity.token,secret));
 assert.equal(readSession(cookie,secret)?.id,identity.id);
 assert.equal(readRegistrationAttempt(cookie,secret),null);
});
test('retry key derives a stable identity within time window',()=>{
 const retry=randomBytes(32).toString('hex'),issued=Date.now();
 assert.deepEqual(identityFromRetryKey(retry,secret,issued),identityFromRetryKey(retry,secret,issued));
 assert.equal(identityFromRetryKey(retry,secret,issued-16*60*1000),null);
 assert.equal(identityFromRetryKey(retry,secret,issued+2*60*1000),null);
});
test('expired or cleared pending cookie is rejected',()=>{
 const cookie=toCookie(issueRegistrationAttempt({...identity,name:'test singer',loginId:''},secret));
 assert.equal(readRegistrationAttempt(toCookie(clearRegistrationAttempt()),secret),null);
 assert.equal(readRegistrationAttempt(cookie+'; invalid=1',secret)?.id,identity.id);
});
