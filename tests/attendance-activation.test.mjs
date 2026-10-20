import test from 'node:test';
import assert from 'node:assert/strict';
import {readLightSession,setLightSessionCookie} from '../registration-light-session.js';
import handler from '../api-activate-attendance.js';

const identity={id:'MIO-W-0123456789abcdef01234567',token:'b'.repeat(64)};
const key='test-session-secret-'+('z'.repeat(64));
function response(){
 const headers={};
 return {headers,setHeader(k,v){headers[k]=v},status(c){this.code=c;return this},json(obj){this.body=obj;return this}};
}
test('light signed cookie is valid only with its signing key',()=>{
 const cookie=setLightSessionCookie(identity.id,identity.token,key).split(';')[0];
 assert.deepEqual(readLightSession(cookie,key),identity);
 assert.equal(readLightSession(cookie,key+'different'),null);
 assert.equal(readLightSession('mio_light_session=invalid',key),null);
});
test('attendance activation is disabled unless explicitly verified',async()=>{
 const old=process.env.MIO_ATTENDANCE_ACTIVATION,env=process.env.VERCEL_ENV;
 try{
  process.env.MIO_ATTENDANCE_ACTIVATION='disabled';
  process.env.VERCEL_ENV='production';
  const res=response();
  await handler({method:'POST',headers:{}},res);
  assert.equal(res.code,503);
  assert.equal(res.body.ok,false);
  assert.equal(res.headers['Set-Cookie'],undefined);
 }finally{
  if(old===undefined)delete process.env.MIO_ATTENDANCE_ACTIVATION;else process.env.MIO_ATTENDANCE_ACTIVATION=old;
  if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;
 }
});
test('activation never accepts GET requests or sets session on GET',async()=>{
 const res=response();
 await handler({method:'GET',headers:{}},res);
 assert.equal(res.code,405);
 assert.equal(res.headers.Allow,'POST');
 assert.equal(res.headers['Set-Cookie'],undefined);
});
