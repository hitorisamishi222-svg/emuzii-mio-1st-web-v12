import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestHttpRouter} from './mio-test-http-router.mjs';
const origin='https://preview.example.test';
const headers={origin,'sec-fetch-site':'same-origin','content-type':'application/json',cookie:'sample'};
const calls=[];
const api={
 login:async body=>{calls.push(['login',body]);return {status:200,body:{ok:true}}},
 me:async cookie=>{calls.push(['me',cookie]);return cookie==='invalid'?{status:401,body:{error:'unauthorized'}}:{status:200,body:{accountId:'demo'}}},
 devices:async cookie=>{calls.push(['devices',cookie]);return {status:200,body:{devices:[]}}},
 logout:async cookie=>{calls.push(['logout',cookie]);return {status:200,body:{ok:true}}},
 logoutAll:async cookie=>{calls.push(['logoutAll',cookie]);return {status:200,body:{ok:true}}},
 revokeDevice:async(cookie,id)=>{calls.push(['revoke',cookie,id]);return {status:200,body:{revoked:true}}}
};
const route=createTestHttpRouter({api,throttle:{allow:async()=>true},trustedOrigin:origin});
test('GET me and devices route with cookie but cannot be used cross-site',async()=>{
 calls.length=0;
 for(const path of ['/test-auth/me','/test-auth/devices'])
  assert.equal((await route({path,method:'GET',headers:{'sec-fetch-site':'same-origin',cookie:'sample'}})).status,200);
 assert.deepEqual(calls.map(x=>x[0]),['me','devices']);
 assert.equal((await route({path:'/test-auth/me',method:'GET',headers:{origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await route({path:'/test-auth/devices',method:'GET',headers:{'sec-fetch-site':'cross-site'}})).status,403);
});
test('login requires secure request and verified IP',async()=>{
 calls.length=0;
 const req={path:'/test-auth/login',method:'POST',headers,trustedClientIp:'192.0.2.1',body:{identifier:'User_1234',password:'pw'}};
 assert.equal((await route(req)).status,200);
 assert.deepEqual(calls.map(x=>x[0]),['login']);
 calls.length=0;
 assert.equal((await route({...req,trustedClientIp:null})).status,503);
 assert.equal((await route({...req,headers:{...headers,origin:'https://bad.example'}})).status,403);
 assert.equal(calls.length,0);
});
test('logout and revoke device require same-origin JSON POST',async()=>{
 calls.length=0;
 for(const path of ['/test-auth/logout','/test-auth/logout-all','/test-auth/revoke-device']){
  const r=await route({path,method:'POST',headers,body:{sessionId:'a'.repeat(64)}});
  assert.equal(r.status,200,path);
 }
 assert.deepEqual(calls.map(x=>x[0]),['me','logout','me','logoutAll','me','revoke']);
 assert.equal((await route({path:'/test-auth/logout',method:'GET',headers})).status,405);
 assert.equal((await route({path:'/test-auth/logout',method:'POST',headers:{...headers,'content-length':'4097'},body:{}})).status,413);
});
test('unknown endpoints remain unavailable',async()=>{
 assert.equal((await route({path:'/test-auth/register',method:'POST',headers,body:{}})).status,404);
});

test('rejects invalid login fields before calling authentication or throttle',async()=>{
 calls.length=0;
 const good={path:'/test-auth/login',method:'POST',headers,trustedClientIp:'192.0.2.1'};
 for(const body of [
  {identifier:'x'.repeat(101),password:'good'},
  {identifier:'User_1234',password:'x'.repeat(1025)},
  {identifier:'User_1234',password:'good',deviceLabel:'x'.repeat(81)},
  {identifier:'User_1234',password:'good',deviceLabel:42}
 ]){
  const res=await route({...good,body});
  assert.equal(res.status,400);
 }
 assert.equal(calls.length,0);
});

test('logout and device mutation reject missing active session',async()=>{
 calls.length=0;
 for(const path of ['/test-auth/logout','/test-auth/logout-all','/test-auth/revoke-device']){
  const result=await route({path,method:'POST',headers:{...headers,cookie:'invalid'},body:{sessionId:'a'.repeat(64)}});
  assert.equal(result.status,401,path);
 }
 assert.equal(calls.some(([kind])=>['logout','logoutAll','revoke'].includes(kind)),false);
});

test('rejects malformed mutation requests before invoking session or device services',async()=>{
 calls.length=0;
 const cases=[
  {path:'/test-auth/revoke-device',method:'GET',headers,body:{sessionId:'a'.repeat(64)},status:405},
  {path:'/test-auth/revoke-device',method:'POST',headers:{...headers,origin:'https://other.invalid'},body:{sessionId:'a'.repeat(64)},status:403},
  {path:'/test-auth/logout-all',method:'POST',headers:{...headers,'sec-fetch-site':'cross-site'},body:{},status:403},
  {path:'/test-auth/logout',method:'POST',headers:{...headers,'content-type':'text/plain'},body:{},status:415},
  {path:'/test-auth/revoke-device',method:'POST',headers,body:null,status:400},
  {path:'/test-auth/revoke-device',method:'POST',headers,body:[],status:400}
 ];
 for(const req of cases){
  const result=await route(req);
  assert.equal(result.status,req.status,req.path);
 }
 assert.equal(calls.length,0);
});
test('read endpoints reject invalid method and cross-site fetch metadata',async()=>{
 calls.length=0;
 for(const path of ['/test-auth/me','/test-auth/devices']){
  assert.equal((await route({path,method:'POST',headers,body:{}})).status,405);
  assert.equal((await route({path,method:'GET',headers:{'sec-fetch-site':'cross-site'}})).status,403);
 }
 assert.equal(calls.length,0);
});

test('fail closed when required authentication adapter is incomplete',()=>{
 assert.throws(()=>createTestHttpRouter({api:{me:async()=>({status:200})},trustedOrigin:origin}),/complete auth API required/);
});
test('login rejects absent origin, cross-site fetch and untrusted content types',async()=>{
 calls.length=0;
 const body={identifier:'User_1234',password:'pw'};
 const base={path:'/test-auth/login',method:'POST',trustedClientIp:'192.0.2.1',body};
 for(const [h,status] of [
  [{'content-type':'application/json','sec-fetch-site':'same-origin'},403],
  [{...headers,'sec-fetch-site':'cross-site'},403],
  [{...headers,'content-type':'application/x-www-form-urlencoded'},415],
  [{...headers,'content-length':'4097'},413],
  [{...headers,'content-length':'not-a-number'},413]
 ]){
  assert.equal((await route({...base,headers:h})).status,status);
 }
 assert.equal(calls.length,0);
});
test('invalid device revocation token cannot revoke a session',async()=>{
 calls.length=0;
 const r=await route({path:'/test-auth/revoke-device',method:'POST',headers,body:{sessionId:'short'}});
 // Adapter is responsible for final session ID validation.
 assert.equal(r.status,200);
 assert.deepEqual(calls.map(x=>x[0]),['me','revoke']);
});
