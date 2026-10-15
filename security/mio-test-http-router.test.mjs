import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestHttpRouter} from './mio-test-http-router.mjs';
const origin='https://preview.example.test';
const headers={origin,'sec-fetch-site':'same-origin','content-type':'application/json',cookie:'sample'};
const calls=[];
const api={
 login:async body=>{calls.push(['login',body]);return {status:200,body:{ok:true}}},
 me:async cookie=>{calls.push(['me',cookie]);return {status:200,body:{accountId:'demo'}}},
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
 assert.deepEqual(calls.map(x=>x[0]),['logout','logoutAll','revoke']);
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
