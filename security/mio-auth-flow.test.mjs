import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthFlow} from './mio-auth-flow.mjs';
import {createInMemorySessionStore} from './mio-session-store.mjs';
import {hashPassword} from './mio-auth-crypto.mjs';
const id='123e4567-e89b-42d3-a456-426614174000';
const password='Strong-Example-Password-2026';
async function setup(){
 const hash=await hashPassword(password);
 const db={query:async()=>({rowCount:1,rows:[{account_id:id,password_hash:hash}]})};
 const memory=createInMemorySessionStore();
 const sessions={
  create:async(account,label)=>memory.create(account,label),
  lookup:async(token)=>memory.lookup(token),
  revoke:async(account,sid)=>memory.revoke(account,sid),
  revokeAll:async(account)=>memory.revokeAll(account)
 };
 return {flow:createAuthFlow(db,{sessions}),memory};
}
function header(cookie){return cookie.split(';')[0]}
test('login issues secure cookie and current session resolves',async()=>{
 const {flow}=await setup(),r=await flow.login({identifier:'TestUser_2026',password,deviceLabel:'iPhone'});
 assert.match(r.setCookie,/HttpOnly/);
 assert.equal((await flow.current(header(r.setCookie))).accountId,id);
});
test('logout only current device',async()=>{
 const {flow}=await setup(),a=await flow.login({identifier:'TestUser_2026',password,deviceLabel:'iPhone'}),b=await flow.login({identifier:'TestUser_2026',password,deviceLabel:'Android'});
 const result=await flow.logout(header(a.setCookie));
 assert.match(result.setCookie,/Max-Age=0/);
 assert.equal(await flow.current(header(a.setCookie)),null);
 assert.equal((await flow.current(header(b.setCookie))).accountId,id);
});
test('logout all revokes both devices',async()=>{
 const {flow}=await setup(),a=await flow.login({identifier:'TestUser_2026',password}),b=await flow.login({identifier:'TestUser_2026',password});
 const result=await flow.logoutAll(header(a.setCookie));
 assert.equal(result.revoked,2);
 assert.equal(await flow.current(header(a.setCookie)),null);
 assert.equal(await flow.current(header(b.setCookie)),null);
});
test('invalid cookies cannot authenticate',async()=>{
 const {flow}=await setup();
 assert.equal(await flow.current('unrelated=abc'),null);
 assert.match((await flow.logout('invalid')).setCookie,/Max-Age=0/);
});
