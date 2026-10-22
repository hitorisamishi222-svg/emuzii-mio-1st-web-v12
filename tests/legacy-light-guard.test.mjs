import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api-enroll-lite.js';
import {sessionCookie} from '../bridge.js';

const legacySecret='legacy-test-secret-'.repeat(4);
const lightSecret='light-test-secret-'.repeat(4);
const id='MIO-W-0123456789abcdef01234567';
const token='a'.repeat(64);
function request(method,cookie){
 return {method,headers:{cookie,host:'example.invalid'},body:{name:'test'}};
}
function response(){
 const result={headers:{},statusCode:200,body:null};
 return {
  result,
  setHeader(key,value){result.headers[key]=value;return this},
  status(code){result.statusCode=code;return this},
  json(data){result.body=data;return this}
 };
}
test('signed legacy session blocks light enrollment on GET and POST without database calls',async()=>{
 const old=Object.fromEntries(['VERCEL_ENV','MIO_LIGHT_REGISTRATION_OPEN','MIO_LIGHT_SESSION_SECRET','MIO_REGISTRATION_DATABASE_URL','APPS_SCRIPT_SECRET'].map(k=>[k,process.env[k]]));
 try{
  process.env.VERCEL_ENV='production';
  process.env.MIO_LIGHT_REGISTRATION_OPEN='enabled';
  process.env.MIO_LIGHT_SESSION_SECRET=lightSecret;
  process.env.MIO_REGISTRATION_DATABASE_URL='not-connected';
  process.env.APPS_SCRIPT_SECRET=legacySecret;
  const cookie=sessionCookie(id,token,legacySecret).split(';')[0];
  const g=response();await handler(request('GET',cookie),g);
  assert.equal(g.result.statusCode,200);
  assert.equal(g.result.body.legacyRegistration,true);
  assert.equal(g.result.body.access,'legacy');
  const p=response();await handler(request('POST',cookie),p);
  assert.equal(p.result.statusCode,409);
  assert.equal(p.result.body.legacyRegistration,true);
 }finally{
  for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }
});
test('tampered legacy session cannot claim identity and fails closed against duplicate registration',async()=>{
 const old=Object.fromEntries(['VERCEL_ENV','MIO_LIGHT_REGISTRATION_OPEN','MIO_LIGHT_SESSION_SECRET','MIO_REGISTRATION_DATABASE_URL','APPS_SCRIPT_SECRET'].map(k=>[k,process.env[k]]));
 try{
  process.env.VERCEL_ENV='production';
  process.env.MIO_LIGHT_REGISTRATION_OPEN='enabled';
  process.env.MIO_LIGHT_SESSION_SECRET=lightSecret;
  process.env.MIO_REGISTRATION_DATABASE_URL='not-connected';
  process.env.APPS_SCRIPT_SECRET=legacySecret;
  const cookie=sessionCookie(id,token,legacySecret).split(';')[0]+'bad';
  const g=response();await handler(request('GET',cookie),g);
  assert.equal(g.result.statusCode,200);
  assert.equal(g.result.body.registered,false);
  assert.equal(g.result.body.legacyRegistration,true);
  assert.equal(g.result.body.legacyPending,false);
  const p=response();await handler(request('POST',cookie),p);
  assert.equal(p.result.statusCode,409);
 }finally{
  for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }
});
