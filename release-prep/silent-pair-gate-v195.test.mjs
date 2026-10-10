import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import createPair from '../api-browser-pair-create.js';
import claimPair from '../api-browser-pair-claim.js';
import {sessionCookie,readSession} from '../bridge.js';
import {pairReleaseEnabled} from '../pair-release-gate.js';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const release=process.env.MIO_PAIR_AUTH_RELEASE;
const existingUrl=process.env.APPS_SCRIPT_URL;
const existingSecret=process.env.APPS_SCRIPT_SECRET;
const secret='r'.repeat(48);
process.env.APPS_SCRIPT_SECRET=secret;
process.env.APPS_SCRIPT_URL='https://script.google.com/macros/s/FAKE_EXECUTION_ID/exec';
delete process.env.MIO_PAIR_AUTH_RELEASE;
const endpoint=name=>name==='create'?createPair:claimPair;
const makeRes=()=>({
 statusCode:200,headers:{},body:null,
 setHeader(name,val){this.headers[name.toLowerCase()]=val;return this},
 status(code){this.statusCode=code;return this},
 json(data){this.body=data;return this},
});
const makeReq=(cookie,body={})=>({
 method:'POST',headers:{host:'local.test',origin:'https://local.test',cookie:cookie||''},body,
});
const oldFetch=globalThis.fetch;
const clientId='MIO-W-'+'a'.repeat(24);
const credential='1'.repeat(64);
const cookie=sessionCookie(clientId,credential,secret).split(';')[0];

test('new pairing release gate is disabled by default',()=>{
 assert.equal(pairReleaseEnabled(),false);
 assert.equal(process.env.MIO_PAIR_AUTH_RELEASE,undefined);
});
test('disabled API refuses create/claim without any upstream GAS action',async()=>{
 globalThis.fetch=async()=>{throw Error('must never call GAS while feature is disabled')};
 try{
  for(const name of ['create','claim']){
   const res=makeRes();
   await endpoint(name)(makeReq(cookie,{key:'f'.repeat(64)}),res);
   assert.equal(res.statusCode,503);
   assert.equal(res.body.ok,false);
   assert.equal(res.headers['set-cookie'],undefined);
  }
 }finally{globalThis.fetch=oldFetch}
});
test('new endpoints do not change valid existing session format',()=>{
 assert.equal(readSession(cookie,secret)?.id,clientId);
 const invalid=cookie.replace('a','c');
 assert.equal(readSession(invalid,secret),null);
});
test('all old routes and built assets remain unchanged relative to the baseline',()=>{
 const config=JSON.parse(read('vercel.json'));
 for(const [from,to] of Object.entries({
  '/api/register':'/api-register.js',
  '/api/status':'/api-status.js',
  '/api/checkin':'/api-checkin.js',
  '/api/gacha':'/api-gacha.js',
  '/':'/index.html'
 })){
  assert.equal(config.routes.find(x=>x.src===from)?.dest,to);
 }
 for(const path of ['index.html','style.css','app.js','gacha.html','gacha.js']){
  assert(config.builds.some(x=>x.src===path&&x.use==='@vercel/static'));
 }
 assert(config.builds.some(x=>x.src==='api-browser-pair-create.js'&&x.use==='@vercel/node'));
 assert(config.builds.some(x=>x.src==='api-browser-pair-claim.js'&&x.use==='@vercel/node'));
});
test('enabled endpoint requires proper session, origin and an authorized GAS result',async()=>{
 process.env.MIO_PAIR_AUTH_RELEASE='v1.9.4-ready';
 try{
  const anon=makeRes();
  await createPair(makeReq(''),anon);
  assert.equal(anon.statusCode,401);
  const rejected=makeRes(),req=makeReq(cookie);
  req.headers.origin='https://outside.example';
  await createPair(req,rejected);
  assert.equal(rejected.statusCode,403);
  let count=0;
  globalThis.fetch=async(_url,opts)=>{
   count++;const posted=JSON.parse(opts.body);
   assert.equal(posted.action,'pair_create');
   assert.equal(posted.participantId,clientId);
   assert.equal(posted.tokenHash,createHash('sha256').update(credential).digest('hex'));
   assert.match(posted.pairHash,/^[a-f0-9]{64}$/);
   return {ok:true,json:async()=>({ok:true,participantId:clientId,expiresInSeconds:180})};
  };
  const allowed=makeRes();
  await createPair(makeReq(cookie),allowed);
  assert.equal(allowed.statusCode,200);
  assert.equal(count,1);
  assert.match(allowed.body.url,/#key=[a-f0-9]{64}$/);
  assert.equal(allowed.headers['set-cookie'],undefined);
 }finally{delete process.env.MIO_PAIR_AUTH_RELEASE;globalThis.fetch=oldFetch}
});
test('only verified GAS pairing responses can create a browser cookie',async()=>{
 process.env.MIO_PAIR_AUTH_RELEASE='v1.9.4-ready';
 const key='b'.repeat(64);
 try{
  globalThis.fetch=async(_url,opts)=>{
   const d=JSON.parse(opts.body);
   return {ok:true,json:async()=>({ok:true,verified:false,linked:false,participantId:d.participantId,status:'承認待ち'})};
  };
  const rejected=makeRes();
  await claimPair(makeReq('',{key}),rejected);
  assert.equal(rejected.statusCode,409);
  assert.equal(rejected.headers['set-cookie'],undefined);
  globalThis.fetch=async(_url,opts)=>{
   const d=JSON.parse(opts.body);
   assert.equal(d.pairHash,createHash('sha256').update(key).digest('hex'));
   return {ok:true,json:async()=>({ok:true,verified:true,linked:true,participantId:d.participantId,status:'承認済み'})};
  };
  const accepted=makeRes();
  await claimPair(makeReq('',{key}),accepted);
  assert.equal(accepted.statusCode,200);
  assert.match(accepted.headers['set-cookie'],/HttpOnly; Secure; SameSite=Lax/);
 }finally{delete process.env.MIO_PAIR_AUTH_RELEASE;globalThis.fetch=oldFetch}
});
test('new route has no public UI switch or altered existing code files',()=>{
 assert(!read('index.html').includes('browserPair'));
 assert(!read('app.js').includes('browserPair'));
});
process.on('exit',()=>{
 if(release===undefined)delete process.env.MIO_PAIR_AUTH_RELEASE;else process.env.MIO_PAIR_AUTH_RELEASE=release;
 if(existingSecret===undefined)delete process.env.APPS_SCRIPT_SECRET;else process.env.APPS_SCRIPT_SECRET=existingSecret;
 if(existingUrl===undefined)delete process.env.APPS_SCRIPT_URL;else process.env.APPS_SCRIPT_URL=existingUrl;
 globalThis.fetch=oldFetch;
});
