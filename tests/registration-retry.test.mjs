import test from 'node:test';
import assert from 'node:assert/strict';
import register from '../api-register.js';
import {readRegistrationAttempt} from '../registration-attempt.js';

const SECRET='isolated-test-only-hmac-key-minimum-32-chars';
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const NAME='新規参加者テスト';
const RETRY_ISSUED_AT=Date.now();

function req(cookie='',overrides={}){
  return {
    method:'POST',
    headers:{host:HOST,origin:'https://'+HOST,cookie},
    body:{name:NAME,loginId:'',retryIssuedAt:RETRY_ISSUED_AT,...overrides}
  };
}
function res(){
  return {
    statusCode:null,body:null,headers:{},
    setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
    status(n){this.statusCode=n;return this;},
    json(body){this.body=body;return this;}
  };
}
function mockProd(){
  const keys=['VERCEL_ENV','APPS_SCRIPT_SECRET','APPS_SCRIPT_URL','MIO_REGISTRATION_RELEASE'];
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  process.env.VERCEL_ENV='production';
  process.env.APPS_SCRIPT_SECRET=SECRET;
  process.env.APPS_SCRIPT_URL='https://script.google.com/macros/s/SYNTHETIC_TEST_ONLY/exec';
  process.env.MIO_REGISTRATION_RELEASE='verified-gas-identity-20261016';
  return ()=>keys.forEach(k=>{if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]});
}

test('an ambiguous timeout reuses the exact same identity without duplicating GAS writes',async()=>{
  const restore=mockProd();
  const fetchBefore=globalThis.fetch;
  const posts=[];
  try{
    globalThis.fetch=async (url,opts)=>{
      assert.equal(url,process.env.APPS_SCRIPT_URL);
      const data=JSON.parse(opts.body);
      assert.equal(data.secret,SECRET);
      posts.push(data);
      if(posts.length===1)throw Error('synthetic timeout AFTER a possible server save');
      return {ok:true,async json(){return {
        ok:true,verified:true,participantId:data.participantId,
        status:'承認待ち',loginId:'MIO-TEST-0001'
      };}};
    };
    const first=res();
    await register(req(),first);
    assert.equal(first.statusCode,502);
    assert.equal(posts.length,1);
    const pendingCookie=first.headers['set-cookie'];
    assert.equal(typeof pendingCookie,'string');
    const parsed=readRegistrationAttempt(pendingCookie.split(';')[0],SECRET);
    assert.equal(parsed?.id,posts[0].participantId);

    const second=res();
    await register(req(pendingCookie.split(';')[0]),second);
    assert.equal(second.statusCode,201);
    assert.equal(second.body.status,'承認待ち');
    assert.equal(second.body.participantId,posts[0].participantId);
    assert.equal(posts[1].participantId,posts[0].participantId);
    assert.equal(posts[1].tokenHash,posts[0].tokenHash);
    assert.ok(Array.isArray(second.headers['set-cookie']));
    assert.match(second.headers['set-cookie'][0],/^mio_session=/);
    assert.match(second.headers['set-cookie'][1],/^mio_registration_attempt=;/);

    const currentCookie=second.headers['set-cookie'][0].split(';')[0];
    const repeat=res();
    await register(req(currentCookie),repeat);
    assert.equal(repeat.statusCode,409);
    assert.equal(posts.length,2);
  } finally {globalThis.fetch=fetchBefore;restore();}
});

test('an in-flight signed registration cannot be reassigned to a different name',async()=>{
  const restore=mockProd(),fetchBefore=globalThis.fetch;
  let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;throw Error('synthetic timeout')};
    const a=res();await register(req(),a);
    assert.equal(a.statusCode,502);
    const b=res();await register(req(a.headers['set-cookie'].split(';')[0],{name:'別の参加者'}),b);
    assert.equal(b.statusCode,409);
    assert.equal(calls,1);
  }finally{globalThis.fetch=fetchBefore;restore();}
});

test('release gate still blocks all registration writes before any GAS call',async()=>{
  const restore=mockProd(),fetchBefore=globalThis.fetch;
  delete process.env.MIO_REGISTRATION_RELEASE;
  let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;throw Error('must not call GAS')};
    const response=res();await register(req(),response);
    assert.equal(response.statusCode,503);
    assert.equal(calls,0);
    assert.equal(response.headers['set-cookie'],undefined);
  }finally{globalThis.fetch=fetchBefore;restore();}
});

test('read-only availability can never open a preview or a disabled release',async()=>{
  const restore=mockProd();
  try{
    const query={method:'GET',headers:{host:HOST},body:{}};
    const ready=res();await register(query,ready);
    assert.equal(ready.statusCode,200);
    assert.equal(ready.body.registrationOpen,true);
    delete process.env.MIO_REGISTRATION_RELEASE;
    const paused=res();await register(query,paused);
    assert.equal(paused.statusCode,200);
    assert.equal(paused.body.registrationOpen,false);
    process.env.MIO_REGISTRATION_RELEASE='verified-gas-identity-20261016';
    process.env.VERCEL_ENV='preview';
    const preview=res();await register(query,preview);
    assert.equal(preview.statusCode,200);
    assert.equal(preview.body.registrationOpen,false);
  }finally{restore();}
});

test('lost HTTP response AND lost Set-Cookie still retries with identical GAS identity',async()=>{
  const restore=mockProd(),fetchBefore=globalThis.fetch;
  const posts=[];
  const sameKey='b'.repeat(64);
  try{
    globalThis.fetch=async (_url,options)=>{
      const d=JSON.parse(options.body);posts.push(d);
      if(posts.length===1)throw Error('synthetic dropped response including cookie');
      return {ok:true,async json(){return {
        ok:true,verified:true,participantId:d.participantId,
        status:'承認待ち',loginId:''
      }}};
    };
    const first=res();
    await register(req('',{retryKey:sameKey}),first);
    assert.equal(first.statusCode,502);
    // No Set-Cookie from the first request is delivered to the browser!
    const retry=res();
    await register(req('',{retryKey:sameKey}),retry);
    assert.equal(retry.statusCode,201);
    assert.equal(posts.length,2);
    assert.equal(posts[0].participantId,posts[1].participantId);
    assert.equal(posts[0].tokenHash,posts[1].tokenHash);
  }finally{globalThis.fetch=fetchBefore;restore();}
});

test('invalid or short browser retry keys never call GAS',async()=>{
  const restore=mockProd(),fetchBefore=globalThis.fetch;
  let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;throw Error('should not call GAS')};
    const result=res();
    await register(req('',{retryKey:'12345'}),result);
    assert.equal(result.statusCode,400);
    assert.equal(calls,0);
    assert.equal(result.headers['set-cookie'],undefined);
  }finally{globalThis.fetch=fetchBefore;restore();}
});

test('a signed pending cookie remains authoritative when browser storage is cleared',async()=>{
  const restore=mockProd(),fetchBefore=globalThis.fetch;
  const posts=[];
  try{
    globalThis.fetch=async (_url,options)=>{
      const data=JSON.parse(options.body);posts.push(data);
      if(posts.length===1)throw Error('ambiguous write');
      return {ok:true,async json(){return {ok:true,verified:true,participantId:data.participantId,status:'承認待ち'};}};
    };
    const first=res();
    await register(req('',{retryKey:'a'.repeat(64)}),first);
    assert.equal(first.statusCode,502);
    const second=res();
    await register(req(first.headers['set-cookie'].split(';')[0],{retryKey:'b'.repeat(64)}),second);
    assert.equal(second.statusCode,201);
    assert.equal(posts.length,2);
    assert.equal(posts[0].participantId,posts[1].participantId);
    assert.equal(posts[0].tokenHash,posts[1].tokenHash);
  }finally{globalThis.fetch=fetchBefore;restore();}
});

test('expired retry keys fail closed before GAS call and never issue credentials',async()=>{
  const restore=mockProd(),previousFetch=globalThis.fetch;
  let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;throw Error('should not reach GAS')};
    const response=res();
    await register(req('',{retryKey:'a'.repeat(64),retryIssuedAt:Date.now()-16*60*1000}),response);
    assert.equal(response.statusCode,409);
    assert.equal(calls,0);
    assert.equal(response.headers['set-cookie'],undefined);
  }finally{globalThis.fetch=previousFetch;restore();}
});

test('retry key without issuance timestamp fails before accessing GAS',async()=>{
  const restore=mockProd(),previousFetch=globalThis.fetch;
  let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;throw Error('should not reach GAS')};
    const response=res();
    await register(req('',{retryKey:'a'.repeat(64),retryIssuedAt:undefined}),response);
    assert.equal(response.statusCode,400);
    assert.equal(calls,0);
  }finally{globalThis.fetch=previousFetch;restore();}
});
