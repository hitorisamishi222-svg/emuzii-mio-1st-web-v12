import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoginRoute} from './mio-login-route.mjs';
const origin='https://preview.example.com';
const body={identifier:'TestUser_2026',password:'sample-password'};
const request={method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json'},trustedClientIp:'192.0.2.10',body};
function setup(allowed=true){
 const calls=[];
 const api={login:async b=>{calls.push(['login',b]);return {status:200,body:{accountId:'test'}}}};
 const throttle={allow:async key=>{calls.push(['limit',key]);return allowed}};
 return {route:createLoginRoute({api,throttle,trustedOrigin:origin}),calls};
}
test('valid request runs limiter before authentication',async()=>{
 const {route,calls}=setup();
 assert.equal((await route(request)).status,200);
 assert.deepEqual(calls.map(x=>x[0]),['limit','login']);
});
test('cross-site request rejected before limiter',async()=>{
 const {route,calls}=setup();
 assert.equal((await route({...request,headers:{...request.headers,origin:'https://evil.example'}})).status,403);
 assert.equal(calls.length,0);
});
test('rate limited request never reaches password check',async()=>{
 const {route,calls}=setup(false);
 const result=await route(request);
 assert.equal(result.status,429);
 assert.deepEqual(calls.map(x=>x[0]),['limit']);
});
test('missing trusted IP fails closed',async()=>{
 const {route,calls}=setup();
 assert.equal((await route({...request,trustedClientIp:null})).status,503);
 assert.equal(calls.length,0);
});
test('malformed payload rejected before limiter',async()=>{
 const {route,calls}=setup();
 assert.equal((await route({...request,body:{identifier:'TestUser_2026'}})).status,400);
 assert.equal(calls.length,0);
});
test('shared limiter required at construction',()=>{
 assert.throws(()=>createLoginRoute({api:{login:async()=>{}},trustedOrigin:origin}));
});

test('oversized JSON request is rejected before authentication and limiter',async()=>{
 const {route,calls}=setup();
 const response=await route({...request,headers:{...request.headers,'content-length':'4097'}});
 assert.equal(response.status,413);
 assert.equal(calls.length,0);
});
test('missing Origin header is rejected before authentication and limiter',async()=>{
 const {route,calls}=setup();
 const {origin:unused,...headers}=request.headers;
 const response=await route({...request,headers});
 assert.equal(response.status,403);
 assert.equal(calls.length,0);
});
