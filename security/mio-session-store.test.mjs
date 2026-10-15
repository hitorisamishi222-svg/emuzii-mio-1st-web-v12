import test from 'node:test';
import assert from 'node:assert/strict';
import {createInMemorySessionStore} from './mio-session-store.mjs';
test('two devices can stay logged in independently',()=>{
 const s=createInMemorySessionStore(),iphone=s.create('mio-1','iPhone'),android=s.create('mio-1','Android');
 assert.equal(s.list('mio-1').length,2);
 assert.equal(s.lookup(iphone.token).accountId,'mio-1');
 assert.equal(s.lookup(android.token).accountId,'mio-1');
});
test('revoke one device without logging out another',()=>{
 const s=createInMemorySessionStore(),iphone=s.create('mio-1','iPhone'),android=s.create('mio-1','Android');
 assert.equal(s.revoke('mio-1',android.sessionId),true);
 assert.equal(s.lookup(android.token),null);
 assert.equal(s.lookup(iphone.token).accountId,'mio-1');
 assert.equal(s.list('mio-1').length,1);
});
test('one account cannot revoke another account session',()=>{
 const s=createInMemorySessionStore(),other=s.create('mio-2','Other');
 assert.equal(s.revoke('mio-1',other.sessionId),false);
 assert.equal(s.lookup(other.token).accountId,'mio-2');
});
test('expired sessions cannot be used or listed',()=>{
 let now=1000;const s=createInMemorySessionStore({now:()=>now,ttlMs:500}),a=s.create('mio-1','iPhone');
 now=1500;assert.equal(s.lookup(a.token),null);assert.equal(s.list('mio-1').length,0);
});
test('revoke all affects only target account',()=>{
 const s=createInMemorySessionStore(),a=s.create('mio-1','A'),b=s.create('mio-1','B'),c=s.create('mio-2','C');
 assert.equal(s.revokeAll('mio-1'),2);
 assert.equal(s.lookup(a.token),null);assert.equal(s.lookup(b.token),null);
 assert.equal(s.lookup(c.token).accountId,'mio-2');
});
test('unknown and malformed session tokens are rejected',()=>{
 const s=createInMemorySessionStore();
 assert.equal(s.lookup('invalid'),null);assert.equal(s.lookup(null),null);
});
