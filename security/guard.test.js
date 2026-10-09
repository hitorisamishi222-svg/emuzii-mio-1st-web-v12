import test from 'node:test';
import assert from 'node:assert/strict';
import {sameOrigin,secureJson,addSecurityHeaders,constantTimeEqual,fixedWindowLimit} from './guard.js';
test('cross-site POST is blocked',()=>{
 assert.equal(sameOrigin({headers:{origin:'https://evil.example','sec-fetch-site':'cross-site'}},'mio.example'),false);
 assert.equal(sameOrigin({headers:{origin:'https://mio.example','sec-fetch-site':'same-origin'}},'mio.example'),true);
 assert.equal(sameOrigin({headers:{}},'mio.example'),false);
});
test('JSON parser rejects non JSON, arrays, and oversized requests',()=>{
 assert.equal(secureJson({headers:{'content-type':'text/plain'},body:{}}).status,415);
 assert.equal(secureJson({headers:{'content-type':'application/json'},body:[]}).status,400);
 assert.equal(secureJson({headers:{'content-type':'application/json'},body:{x:'x'.repeat(200)}},{maxBytes:40}).status,413);
 assert.equal(secureJson({headers:{'content-type':'application/json; charset=utf-8'},body:{ok:true}}).ok,true);
});
test('security headers set',()=>{
 const values={};addSecurityHeaders({setHeader:(k,v)=>values[k]=v});
 assert.equal(values['X-Frame-Options'],'DENY');
 assert.equal(values['X-Content-Type-Options'],'nosniff');
});
test('constant time comparison handles mismatch',()=>{
 assert.equal(constantTimeEqual('secret','secret'),true);
 assert.equal(constantTimeEqual('secret','secret!'),false);
});
test('rate limiting requires durable store',async()=>{
 await assert.rejects(()=>fixedWindowLimit(null,{key:'api:1',limit:2,windowSeconds:60}));
 let count=0;
 const store={incrementWithExpiry:async()=>++count};
 assert.equal((await fixedWindowLimit(store,{key:'api:1',limit:2,windowSeconds:60})).allowed,true);
 assert.equal((await fixedWindowLimit(store,{key:'api:1',limit:2,windowSeconds:60})).allowed,true);
 assert.equal((await fixedWindowLimit(store,{key:'api:1',limit:2,windowSeconds:60})).allowed,false);
});
