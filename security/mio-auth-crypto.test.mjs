import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, createSessionSecret, sessionTokenDigest } from './mio-auth-crypto.mjs';
test('password is salted and verifies only correct password', async () => {
 const a = await hashPassword('Example-Password-2026!'), b = await hashPassword('Example-Password-2026!');
 assert.notEqual(a,b);
 assert.equal(await verifyPassword('Example-Password-2026!',a),true);
 assert.equal(await verifyPassword('wrong-password',a),false);
});
test('password hashing rejects short password', async () => {
 await assert.rejects(hashPassword('short'));
});
test('malformed hashes fail closed', async () => {
 assert.equal(await verifyPassword('anything','not-a-hash'),false);
 assert.equal(await verifyPassword('anything','scrypt-v1$abc$abc'),false);
});
test('session secrets are unique and only digests are stored', () => {
 const a=createSessionSecret(),b=createSessionSecret();
 assert.notEqual(a,b);assert.notEqual(sessionTokenDigest(a),sessionTokenDigest(b));
 assert.match(sessionTokenDigest(a),/^[a-f0-9]{64}$/);
});
test('invalid session secrets rejected',()=>assert.throws(()=>sessionTokenDigest('short')));
