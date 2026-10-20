import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyIdentityState} from '../registration-legacy-guard.js';
import {issueRegistrationAttempt} from '../registration-attempt.js';
import {sessionCookie} from '../bridge.js';
const key='a'.repeat(64);
const identity={id:'MIO-W-0123456789abcdef01234567',token:'b'.repeat(64)};
const cookie=s=>s.split(';')[0];
test('unrelated cookies do not block enrollment',()=>{
 assert.equal(legacyIdentityState('',key),null);
 assert.equal(legacyIdentityState('other_session=xyz',key),null);
});
test('signed legacy session blocks duplicate enrollment',()=>{
 assert.equal(legacyIdentityState(cookie(sessionCookie(identity.id,identity.token,key)),key),'registered');
});
test('signed pending legacy attempt blocks duplicate enrollment',()=>{
 assert.equal(legacyIdentityState(cookie(issueRegistrationAttempt({...identity,name:'singer',loginId:''},key)),key),'pending');
});
test('unknown secret and invalid legacy cookies fail closed',()=>{
 const original=cookie(sessionCookie(identity.id,identity.token,key));
 assert.equal(legacyIdentityState(original,undefined),'unverified');
 assert.equal(legacyIdentityState(original,'x'.repeat(64)),'unverified');
 assert.equal(legacyIdentityState('mio_session=invalid',key),'unverified');
});
test('unrelated cookie name substrings are ignored',()=>{
 assert.equal(legacyIdentityState('prefix_mio_session=invalid',key),null);
 assert.equal(legacyIdentityState('mio_session_extra=invalid',key),null);
});
