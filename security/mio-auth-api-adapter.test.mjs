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
