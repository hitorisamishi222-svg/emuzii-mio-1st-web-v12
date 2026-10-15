import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionSecret} from './mio-auth-crypto.mjs';
import {makeSessionCookie,expireSessionCookie,readSessionCookie} from './mio-session-cookie.mjs';
test('session cookie uses secure host-only HttpOnly attributes',()=>{
 const token=createSessionSecret(),cookie=makeSessionCookie(token);
 assert.match(cookie,/^__Host-mio_session=/);
 assert.match(cookie,/; Path=\//);
 assert.match(cookie,/; Secure;/);
 assert.match(cookie,/; HttpOnly;/);
 assert.match(cookie,/; SameSite=Lax$/);
 assert.equal(readSessionCookie('__Host-mio_session='+token),token);
});
test('expired cookie removes browser session',()=>{
 const cookie=expireSessionCookie();
 assert.match(cookie,/Max-Age=0/);assert.match(cookie,/HttpOnly/);
});
test('invalid token is rejected before cookie issue',()=>{
 assert.throws(()=>makeSessionCookie('short'));
 assert.throws(()=>makeSessionCookie('bad; injection'));
});
test('duplicate cookies are rejected',()=>{
 const token=createSessionSecret();
 assert.equal(readSessionCookie('__Host-mio_session='+token+'; __Host-mio_session='+token),null);
});
test('malformed cookie headers are rejected',()=>{
 assert.equal(readSessionCookie(null),null);
 assert.equal(readSessionCookie('unrelated=abc'),null);
 assert.equal(readSessionCookie('__Host-mio_session=bad'),null);
});
