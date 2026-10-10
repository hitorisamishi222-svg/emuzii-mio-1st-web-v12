import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import status from '../api-status.js';
import checkin from '../api-checkin.js';
import gacha from '../api-gacha.js';
import {hash,readSession,sessionCookie} from '../bridge.js';

const secret='s'.repeat(48),id='MIO-W-'+'a'.repeat(24),token='b'.repeat(64);
const saved={secret:process.env.APPS_SCRIPT_SECRET,url:process.env.APPS_SCRIPT_URL};
process.env.APPS_SCRIPT_SECRET=secret;
process.env.APPS_SCRIPT_URL='https://script.google.com/macros/s/FAKE_SCRIPT/exec';
const cookie=sessionCookie(id,token,secret).split(';')[0];
const oldFetch=globalThis.fetch;
function response(){return {code:200,headers:{},data:null,
 setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},
 status(n){this.code=n;return this},
 json(x){this.data=x;return this}
}}
function request(body={},session=cookie){return {method:'POST',
 headers:{host:'local.test',origin:'https://local.test',cookie:session},
 body};}
async function withGas(reply,action){
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async (_url,opts)=>{
  calls++;
  const payload=JSON.parse(opts.body);
  assert.equal(payload.action,action);
  assert.equal(payload.participantId,id);
  assert.equal(payload.tokenHash,hash(token));
  assert.equal(payload.secret,secret);
  return {ok:true,json:async()=>typeof reply==='function'?reply(payload):reply};
 };
 return {run:async fn=>{try{await fn()}finally{globalThis.fetch=previous}},called:()=>calls};
}
test('signed session uses same secure HttpOnly 90-day cookie',()=>{
 const set=sessionCookie(id,token,secret);
 assert.match(set,/HttpOnly; Secure; SameSite=Lax; Max-Age=7776000/);
 assert.deepEqual(readSession(set,secret),{id,token});
});
test('approved status refreshes same original signed identity',async()=>{
 const mock=await withGas({ok:true,participantId:id,status:'承認済み',name:'Sample'},'status');
 await mock.run(async()=>{const res=response();await status(request(),res);
 assert.equal(res.code,200);
 assert.equal(res.data.status,'承認済み');
 const renewed=res.headers['set-cookie'];
 assert.match(renewed,/Max-Age=7776000/);
 assert.deepEqual(readSession(renewed,secret),{id,token});
 assert.equal(mock.called(),1)});
});
test('pending and rejected status are visible but never renew login cookie',async()=>{
 for(const state of ['承認待ち','却下']){
  const mock=await withGas({ok:true,participantId:id,status:state},'status');
  await mock.run(async()=>{const res=response();await status(request(),res);
    assert.equal(res.code,200);
    assert.equal(res.data.status,state);
    assert.equal(res.headers['set-cookie'],undefined);
  });
 }
});
test('missing and invalid cookies are denied before any GAS contact',async()=>{
 let called=false;const prev=globalThis.fetch;
 globalThis.fetch=async()=>{called=true;throw Error('no GAS allowed')};
 try{
  const parts=cookie.split('.');
 const forged=parts[0]+'.'+(parts[1][0]==='a'?'b':'a')+parts[1].slice(1);
 for(const invalid of ['',forged]){
   const res=response();await status(request({},invalid),res);
   assert.equal(res.code,401);assert.equal(res.headers['set-cookie'],undefined);
  }
  assert.equal(called,false);
 }finally{globalThis.fetch=prev}
});
test('GAS identity mismatch cannot renew cookie',async()=>{
 const mock=await withGas({ok:true,participantId:'MIO-W-'+'c'.repeat(24),status:'承認済み'},'status');
 await mock.run(async()=>{const res=response();await status(request(),res);
 assert.equal(res.code,502);assert.equal(res.headers['set-cookie'],undefined)});
});
test('failed, unauthorized and unavailable GAS never renews a cookie',async()=>{
 for(const ans of [
  {ok:false,error:'unauthorized'},
  {ok:false,error:'server error'}
 ]){
  const mock=await withGas(ans,'status');
  await mock.run(async()=>{const res=response();await status(request(),res);
    assert.equal(res.code,502);assert.equal(res.headers['set-cookie'],undefined);
  });
 }
});
test('approved successful checkin refreshes cookie without changing attendance rules',async()=>{
 const mock=await withGas({ok:true,participantId:id,message:'確認済み'},'checkin');
 await mock.run(async()=>{const res=response();await checkin(request({day:1,keyword:'a'}),res);
 assert.equal(res.code,200);
 assert.deepEqual(readSession(res.headers['set-cookie'],secret),{id,token});
 assert.equal(mock.called(),1)});
});
test('invalid checkin, refused GAS checkin never issue new cookie',async()=>{
 const invalid=response();await checkin(request({day:0,keyword:'a'}),invalid);
 assert.equal(invalid.code,400);assert.equal(invalid.headers['set-cookie'],undefined);
 const mock=await withGas({ok:false,error:'承認待ち'},'checkin');
 await mock.run(async()=>{const res=response();await checkin(request({day:1,keyword:'a'}),res);
 assert.equal(res.code,409);assert.equal(res.headers['set-cookie'],undefined)});
});
test('successful gacha catalog renews cookie without changing action payload',async()=>{
 const mock=await withGas({ok:true,participantId:id,catalog:[]},'catalog');
 await mock.run(async()=>{const res=response();await gacha(request({action:'catalog'}),res);
 assert.equal(res.code,200);
 assert.deepEqual(readSession(res.headers['set-cookie'],secret),{id,token})});
});
test('denied and malformed gacha requests cannot renew session',async()=>{
 const bad=response();await gacha(request({action:'draw',drawId:'bad',mode:'通常'}),bad);
 assert.equal(bad.code,400);assert.equal(bad.headers['set-cookie'],undefined);
 const mock=await withGas({ok:false,error:'unauthorized'},'catalog');
 await mock.run(async()=>{const res=response();await gacha(request({action:'catalog'}),res);
 assert.equal(res.code,409);assert.equal(res.headers['set-cookie'],undefined)});
});
test('no changes to registration, gacha draws, event UI or GAS',()=>{
 const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
 const app=read('app.js');
 assert.match(app,/post\('\/api\/status'\)/);
 const reg=read('api-register.js');
 assert.match(reg,/makeIdentity\(\)/);
 const gachaSrc=read('api-gacha.js');
 assert.match(gachaSrc,/drawId:body.drawId,mode:body.mode/);
});
process.on('exit',()=>{globalThis.fetch=oldFetch;
 for(const [name,value] of [['APPS_SCRIPT_SECRET',saved.secret],['APPS_SCRIPT_URL',saved.url]]){
 if(value===undefined)delete process.env[name];else process.env[name]=value;
 }});
