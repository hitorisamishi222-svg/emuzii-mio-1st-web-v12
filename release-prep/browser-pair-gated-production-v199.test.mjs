import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import create from '../api-browser-pair-create.js';
import claim from '../api-browser-pair-claim.js';
import {sessionCookie,readSession,hash} from '../bridge.js';
import {pairReleaseEnabled} from '../pair-release-gate.js';

const cfg={secret:process.env.APPS_SCRIPT_SECRET,url:process.env.APPS_SCRIPT_URL,gate:process.env.MIO_PAIR_AUTH_RELEASE};
process.env.APPS_SCRIPT_SECRET='v'.repeat(48);
process.env.APPS_SCRIPT_URL='https://script.google.com/macros/s/TEST/exec';
delete process.env.MIO_PAIR_AUTH_RELEASE;
const id='MIO-W-'+'a'.repeat(24),token='f'.repeat(64),key='9'.repeat(64);
const cookie=sessionCookie(id,token,process.env.APPS_SCRIPT_SECRET).split(';')[0];
const req=(body={},ck=cookie)=>({method:'POST',headers:{host:'demo.test',origin:'https://demo.test',cookie:ck},body});
const res=()=>({statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(x){this.body=x;return this}});
const oldFetch=globalThis.fetch;
async function useServer(reply,fn){
 const prev=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,opts)=>{
  calls++;
  const d=JSON.parse(opts.body);
  assert.equal(d.secret,process.env.APPS_SCRIPT_SECRET);
  return {ok:true,json:async()=>typeof reply==='function'?reply(d):reply};
 };
 try{await fn(()=>calls)}finally{globalThis.fetch=prev}
}
test('pair routes remain disabled by default and do not contact Google Apps Script',async()=>{
 assert.equal(pairReleaseEnabled(),false);
 await useServer(()=>{throw Error('unexpected GAS call')},async count=>{
  for(const handler of [create,claim]){
   const r=res();await handler(req({key}),r);
   assert.equal(r.statusCode,503);assert.equal(r.headers['Set-Cookie'],undefined);
  }
  assert.equal(count(),0);
 });
});
test('invalid deployment flag values cannot turn on pairing',()=>{
 for(const val of ['1','true','ready','v1.9.3-ready','v1.9.4-ready ']){
  process.env.MIO_PAIR_AUTH_RELEASE=val;
  assert.equal(pairReleaseEnabled(),false);
 }
 delete process.env.MIO_PAIR_AUTH_RELEASE;
});
test('approved source can mint 3-minute link only after deliberate release',async()=>{
 process.env.MIO_PAIR_AUTH_RELEASE='v1.9.4-ready';
 await useServer(d=>{
  assert.equal(d.action,'pair_create');
  assert.equal(d.participantId,id);
  assert.equal(d.tokenHash,hash(token));
  assert.match(d.pairHash,/^[a-f0-9]{64}$/);
  return {ok:true,participantId:id,expiresInSeconds:180};
 },async count=>{
  const r=res();await create(req(),r);
  assert.equal(r.statusCode,200);
  assert.equal(r.body.expiresInSeconds,180);
  assert.match(r.body.url,/\/browser-connect\.html#key=[a-f0-9]{64}$/);
  assert.equal(count(),1);
 });
 delete process.env.MIO_PAIR_AUTH_RELEASE;
});
test('approved claim creates HttpOnly cookie for the verified session only',async()=>{
 process.env.MIO_PAIR_AUTH_RELEASE='v1.9.4-ready';
 await useServer(d=>{
  assert.equal(d.action,'pair_claim');
  assert.equal(d.pairHash,hash(key));
  return {ok:true,verified:true,linked:true,participantId:d.participantId,status:'承認済み'};
 },async count=>{
  const r=res();await claim(req({key},''),r);
  assert.equal(r.statusCode,200);
  assert.ok(readSession(r.headers['Set-Cookie'],process.env.APPS_SCRIPT_SECRET));
  assert.equal(count(),1);
 });
 delete process.env.MIO_PAIR_AUTH_RELEASE;
});
test('rejected or unsupported pairing never generates a cookie',async()=>{
 process.env.MIO_PAIR_AUTH_RELEASE='v1.9.4-ready';
 await useServer(d=>({ok:true,verified:false,linked:false,participantId:d.participantId,status:'承認待ち'}),async()=>{
  const r=res();await claim(req({key},''),r);
  assert.equal(r.statusCode,409);
  assert.equal(r.headers['Set-Cookie'],undefined);
 });
 delete process.env.MIO_PAIR_AUTH_RELEASE;
});
test('cross-site origin cannot access new browser pairing endpoints',async()=>{
 process.env.MIO_PAIR_AUTH_RELEASE='v1.9.4-ready';
 for(const handler of [create,claim]){
  const incoming=req({key});
  incoming.headers.origin='https://attacker.example';
  const r=res();await handler(incoming,r);
  assert.equal(r.statusCode,403);
  assert.equal(r.headers['Set-Cookie'],undefined);
 }
 delete process.env.MIO_PAIR_AUTH_RELEASE;
});
test('staged release retains original registration, attendance and gacha APIs',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const vercel=JSON.parse(read('vercel.json'));
 for(const [src,dest] of [
  ['/api/register','/api-register.js'],
  ['/api/status','/api-status.js'],
  ['/api/checkin','/api-checkin.js'],
  ['/api/gacha','/api-gacha.js']
 ])assert(vercel.routes.some(x=>x.src===src&&x.dest===dest));
 assert(vercel.routes.some(x=>x.src==='/api/browser-pair/create'));
 assert(vercel.routes.some(x=>x.src==='/api/browser-pair/claim'));
 assert.match(read('index.html'),/id="browserPair"[^>]+hidden/);
 assert.match(read('app.js'),/browserPair'\)\.hidden=d\.status!=='承認済み'/);
 assert.match(read('pair-release-gate.js'),/MIO_PAIR_AUTH_RELEASE/);
});
process.on('exit',()=>{
 globalThis.fetch=oldFetch;
 for(const [name,val] of [['APPS_SCRIPT_SECRET',cfg.secret],['APPS_SCRIPT_URL',cfg.url],['MIO_PAIR_AUTH_RELEASE',cfg.gate]]){
  if(val===undefined)delete process.env[name];else process.env[name]=val;
 }
});
