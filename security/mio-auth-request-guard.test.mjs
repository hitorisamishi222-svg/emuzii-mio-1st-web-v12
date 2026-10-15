import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAuthRequest} from './mio-auth-request-guard.mjs';
const origin='https://preview.example.com';
const request={method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json','content-length':'128'}};
const check=r=>checkAuthRequest(r,{trustedOrigin:origin});
test('accepts same-origin POST JSON request',()=>assert.equal(check(request).ok,true));
test('rejects cross-origin and missing origin',()=>{
 assert.equal(check({...request,headers:{...request.headers,origin:'https://evil.example'}}).status,403);
 assert.equal(check({...request,headers:{'content-type':'application/json'}}).status,403);
});
test('rejects cross-site fetch metadata',()=>assert.equal(check({...request,headers:{...request.headers,'sec-fetch-site':'cross-site'}}).status,403));
test('rejects non-POST method',()=>assert.equal(check({...request,method:'GET'}).status,405));
test('rejects non-JSON payload',()=>assert.equal(check({...request,headers:{...request.headers,'content-type':'text/plain'}}).status,415));
test('rejects oversized content length',()=>assert.equal(check({...request,headers:{...request.headers,'content-length':'5000'}}).status,413));
test('requires an explicit trusted HTTPS origin',()=>assert.throws(()=>checkAuthRequest(request,{trustedOrigin:'http://preview.example.com'})));
