import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import create from '../api-browser-pair-create.js';
import claim from '../api-browser-pair-claim.js';
import {sessionCookie,readSession} from '../bridge.js';

const secret='s'.repeat(40),host='test.example';
process.env.APPS_SCRIPT_SECRET=secret;
process.env.APPS_SCRIPT_URL='https://script.google.com/macros/s/TEST/exec';
const makeResponse=()=>({
 code:200,headers:{},body:null,
 setHeader(k,v){this.headers[k]=v;return this},
 status(n){this.code=n;return this},
 json(v){this.body=v;return this}
});
const makeReq=(body={},cookie='')=>({method:'POST',headers:{host,origin:'https://'+host,cookie},body});
const oldFetch=globalThis.fetch;
const withBridge=async(answer,run)=>{
 globalThis.fetch=async(url,opts)=>{
  assert.match(url,/script\.google\.com/);
  const d=JSON.parse(opts.body);
  assert.equal(d.secret,secret);
  return {ok:true,json:async()=>typeof answer==='function'?answer(d):answer};
 };
 try{return await run()}finally{globalThis.fetch=oldFetch}
};
const nameId='MIO-W-'+'a'.repeat(24),rawToken='1'.repeat(64);
const sourceCookie=sessionCookie(nameId,rawToken,secret).split(';')[0];
test('link issue requires a signed browser cookie',async()=>{
 const res=makeResponse();
 await create(makeReq(),res);
 assert.equal(res.code,401);
 assert.equal(res.body.ok,false);
});
test('link issue requests approved source proof and returns one-time secret to owner',async()=>{
 const res=makeResponse();
 await withBridge(d=>{
  assert.equal(d.action,'pair_create');
  assert.equal(d.participantId,nameId);
  assert.equal(d.tokenHash,createHash('sha256').update(rawToken).digest('hex'));
  assert.match(d.pairHash,/^[a-f0-9]{64}$/);
  return {ok:true,participantId:nameId};
 },async()=>create(makeReq({},sourceCookie),res));
 assert.equal(res.code,200);
 assert.match(res.body.url,/\/browser-connect\.html#key=[a-f0-9]{64}$/);
 assert.equal(res.body.expiresInSeconds,180);
 assert.equal(res.headers['Set-Cookie'],undefined);
});
test('wrong-origin browser cannot issue a link',async()=>{
 const res=makeResponse(),req=makeReq({},sourceCookie);
 req.headers.origin='https://attacker.example';
 await create(req,res);
 assert.equal(res.code,403);
});
test('claim establishes a signed HttpOnly cookie only after GAS confirms MIO pairing',async()=>{
 const res=makeResponse(),key='f'.repeat(64);
 await withBridge(d=>{
  assert.equal(d.action,'pair_claim');
  assert.equal(d.pairHash,createHash('sha256').update(key).digest('hex'));
  assert.match(d.participantId,/^MIO-W-[a-f0-9]{24}$/);
  return {ok:true,verified:true,linked:true,participantId:d.participantId,status:'承認済み'};
 },async()=>claim(makeReq({key}),res));
 assert.equal(res.code,200);
 assert.equal(res.body.linked,true);
 assert.match(res.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
 assert.ok(readSession(res.headers['Set-Cookie'],secret));
});
test('unverified claim cannot set a login cookie',async()=>{
 const res=makeResponse(),key='a'.repeat(64);
 await withBridge(d=>({ok:true,verified:false,linked:false,participantId:d.participantId,status:'承認待ち'}),
  async()=>claim(makeReq({key}),res));
 assert.equal(res.code,409);
 assert.equal(res.headers['Set-Cookie'],undefined);
});
test('claim reuses an existing pending cookie instead of creating a separate user',async()=>{
 const res=makeResponse(),key='b'.repeat(64);
 await withBridge(d=>{
  assert.equal(d.participantId,nameId);
  assert.equal(d.tokenHash,createHash('sha256').update(rawToken).digest('hex'));
  return {ok:true,verified:true,linked:true,participantId:nameId,status:'承認済み'};
 },async()=>claim(makeReq({key},sourceCookie),res));
 assert.equal(res.code,200);
 assert.equal(res.headers['Set-Cookie'],undefined);
});
test('invalid link and cross-origin claims are denied',async()=>{
 const bad=makeResponse();
 await claim(makeReq({key:'x'}),bad);
 assert.equal(bad.code,400);
 const origin=makeReq({key:'f'.repeat(64)});
 origin.headers.origin='https://attacker.example';
 const cross=makeResponse();
 await claim(origin,cross);
 assert.equal(cross.code,403);
});
