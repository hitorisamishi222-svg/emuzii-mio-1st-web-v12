import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthApiHandlers} from './mio-auth-api-adapter.mjs';
function setup(){
 const calls=[];
 const flow={
  login:async data=>{calls.push(['login',data]);if(data.password==='wrong')throw Error('invalid credentials');return {accountId:'account-1',setCookie:'__Host-mio_session=example; HttpOnly; Secure'}},
  current:async header=>{calls.push(['me',header]);return header==='valid'?{accountId:'account-1',deviceLabel:'iPhone'}:null},
  logout:async header=>{calls.push(['logout',header]);return {setCookie:'__Host-mio_session=; Max-Age=0'}},
  logoutAll:async header=>{calls.push(['logoutAll',header]);return {setCookie:'__Host-mio_session=; Max-Age=0',revoked:2}}
 };
 return {api:createAuthApiHandlers(null,{flow}),calls};
}
test('login returns only account identity and secure cookie header',async()=>{
 const {api}=setup(),r=await api.login({identifier:'TestUser_2026',password:'good',deviceLabel:'iPhone'});
 assert.equal(r.status,200);assert.equal(r.body.accountId,'account-1');
 assert.match(r.headers['Set-Cookie'],/HttpOnly/);assert.equal(r.headers['Cache-Control'],'no-store');
 assert.equal(JSON.stringify(r.body).includes('good'),false);
});
test('wrong password returns 401 without a cookie',async()=>{
 const {api}=setup(),r=await api.login({identifier:'TestUser_2026',password:'wrong'});
 assert.equal(r.status,401);assert.equal(r.headers,undefined);
});
test('invalid login body returns 400',async()=>{
 const {api}=setup();assert.equal((await api.login(null)).status,400);
 assert.equal((await api.login([])).status,400);
});
test('me returns 401 when session missing',async()=>{
 const {api}=setup();assert.equal((await api.me('invalid')).status,401);
 assert.equal((await api.me('valid')).body.accountId,'account-1');
});
test('logout and logoutAll clear cookie',async()=>{
 const {api}=setup(),a=await api.logout('valid'),b=await api.logoutAll('valid');
 assert.match(a.headers['Set-Cookie'],/Max-Age=0/);
 assert.equal(b.body.revoked,2);assert.match(b.headers['Set-Cookie'],/Max-Age=0/);
});

test('rate limited login returns 429 without invoking password verification',async()=>{
 const {calls}=setup();
 const flow={login:async()=>{throw Error('must not run')}};
 const api=createAuthApiHandlers(null,{flow,throttle:{allow:async()=>false}});
 const r=await api.login({identifier:'TestUser_2026',password:'good'});
 assert.equal(r.status,429);assert.equal(r.headers['Retry-After'],'900');
 assert.equal(calls.length,0);
});
test('allowed login passes through shared throttle',async()=>{
 const keys=[],flow={login:async()=>({accountId:'account-1',setCookie:'secure-cookie'})};
 const api=createAuthApiHandlers(null,{flow,throttle:{allow:async key=>{keys.push(key);return true}}});
 const r=await api.login({identifier:'TestUser_2026',password:'good'});
 assert.equal(r.status,200);assert.deepEqual(keys,['testuser_2026']);
});

test('device listing requires an authenticated account',async()=>{
 const flow={devices:async h=>h==='valid'?[{sessionId:'a'.repeat(64),deviceLabel:'iPhone'}]:null};
 const api=createAuthApiHandlers(null,{flow});
 assert.equal((await api.devices('valid')).body.devices.length,1);
 assert.equal((await api.devices('invalid')).status,401);
});
test('selected device revocation rejects malformed ID',async()=>{
 const flow={revokeDevice:async()=>{throw Error('must not be called')}};
 const api=createAuthApiHandlers(null,{flow});
 assert.equal((await api.revokeDevice('valid','bad')).status,400);
});
test('selected device revocation requires authorization',async()=>{
 const flow={revokeDevice:async h=>h==='valid'?true:null};
 const api=createAuthApiHandlers(null,{flow});
 assert.equal((await api.revokeDevice('invalid','a'.repeat(64))).status,401);
 assert.equal((await api.revokeDevice('valid','a'.repeat(64))).body.revoked,true);
});

test('malformed credentials are rejected before throttle or password verification',async()=>{
 const calls=[];
 const api=createAuthApiHandlers(null,{flow:{login:async()=>{calls.push('login');throw Error('must not run')}},throttle:{allow:async()=>{calls.push('limit');return true}}});
 for(const body of [{identifier:'user'},{identifier:'',password:'test'},{identifier:'user',password:42},{identifier:'user',password:''}]){
  assert.equal((await api.login(body)).status,400);
 }
 assert.deepEqual(calls,[]);
});

test('case and surrounding spaces cannot bypass shared login rate limiter',async()=>{
 const keys=[];
 const flow={login:async()=>({accountId:'test',setCookie:'cookie'})};
 const throttle={allow:async key=>{keys.push(key);return true}};
 const api=createAuthApiHandlers(null,{flow,throttle});
 await api.login({identifier:' TestUser_2026 ',password:'good'});
 await api.login({identifier:'testuser_2026',password:'good'});
 assert.deepEqual(keys,['testuser_2026','testuser_2026']);
});
