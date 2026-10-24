import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeRecoveryHandler} from '../api-recovery.js';
import {recoveryToken} from '../recovery-token.js';
import {verifiedRecoveryResult} from '../recovery-result-gate.js';

const secret='test-only-secret-must-not-be-shared-aaaaaaaa';
const digest=s=>createHash('sha256').update(s).digest('hex');
const grant='MIO-R1-'+'a'.repeat(64),grantHash=digest(grant),retryKey='b'.repeat(64);
const webId='MIO-W-'+'1'.repeat(24),masterId='MIO-0010';
const now=Date.now();
const body={grant,retryKey,retryIssuedAt:now};
const priorRelease=process.env.MIO_RECOVERY_RELEASE;
process.env.MIO_RECOVERY_RELEASE='verified-gas-recovery-v2';
process.on('exit',()=>{
  if(priorRelease===undefined)delete process.env.MIO_RECOVERY_RELEASE;
  else process.env.MIO_RECOVERY_RELEASE=priorRelease;
});
function response(){
  return {code:200,headers:{},body:undefined,
    status(n){this.code=n;return this},
    setHeader(k,v){this.headers[k]=v},
    json(v){this.body=v;return this}};
}
function fakeGas(){
  const grants=new Map([[grantHash,{webId,masterId,approved:true,used:false,tokenHash:null}]]);
  const stats={writes:0,calls:0};
  const bridge=async(action,payload)=>{
    stats.calls++;
    assert.equal(action,'recover');
    assert.deepEqual(Object.keys(payload).sort(),['grantHash','tokenHash']);
    const g=grants.get(payload.grantHash);
    if(!g||!g.approved)throw Error('not approved');
    if(g.used && g.tokenHash!==payload.tokenHash)throw Error('different token replay');
    if(!g.used){g.used=true;g.tokenHash=payload.tokenHash;stats.writes++}
    return {ok:true,verified:true,recoveryApproved:true,recoveryConsumed:true,
      recoveryTokenBound:true,boundTokenHash:g.tokenHash,status:'承認済み',
      participantId:g.webId,approvedWebId:g.webId,
      integratedParticipantId:g.masterId,approvedMasterId:g.masterId};
  };
  return {bridge,grants,stats};
}
function make(mockBridge){
  const gas=fakeGas();
  const handler=makeRecoveryHandler({
    prepare:()=>({secret}),bridge:mockBridge||gas.bridge,hash:digest,
    sessionCookie:(id,token)=>`mio_session=mock.${id}.${digest(token)}`,
    recoveryToken,verifiedRecoveryResult
  });
  return {gas,handler};
}
async function invoke(handler,params=body){
  const res=response();await handler({body:params},res);return res;
}

test('approved recovery creates cookie for existing Web-ID',async()=>{
  const {gas,handler}=make();const r=await invoke(handler);
  assert.equal(r.code,200);assert.deepEqual(r.body,{ok:true,recovered:true});
  assert.match(r.headers['Set-Cookie'],new RegExp('mio_session=mock\\.'+webId+'\\.'));
  assert.equal(gas.stats.writes,1);
});
test('same retry after lost HTTP response makes no second write',async()=>{
  const {gas,handler}=make();const a=await invoke(handler),b=await invoke(handler);
  assert.equal(a.code,200);assert.equal(b.code,200);
  assert.equal(a.headers['Set-Cookie'],b.headers['Set-Cookie']);
  assert.equal(gas.stats.writes,1);
});
test('same grant, different token cannot take over',async()=>{
  const {gas,handler}=make();assert.equal((await invoke(handler)).code,200);
  const r=await invoke(handler,{...body,retryKey:'c'.repeat(64)});
  assert.equal(r.code,409);assert.equal(r.headers['Set-Cookie'],undefined);
  assert.equal(gas.stats.writes,1);
});
test('unknown grant fails with no cookie',async()=>{
  const {handler}=make();const r=await invoke(handler,{...body,grant:'MIO-R1-'+'c'.repeat(64)});
  assert.equal(r.code,409);assert.equal(r.headers['Set-Cookie'],undefined);
});
test('unapproved grant cannot modify GAS',async()=>{
  const {gas,handler}=make();gas.grants.get(grantHash).approved=false;
  assert.equal((await invoke(handler)).code,409);assert.equal(gas.stats.writes,0);
});
test('invalid grant fails before GAS call',async()=>{
  const {gas,handler}=make();assert.equal((await invoke(handler,{...body,grant:'bad'})).code,400);
  assert.equal(gas.stats.calls,0);
});
test('invalid or expired retry data fails before GAS call',async()=>{
  const {gas,handler}=make();
  assert.equal((await invoke(handler,{...body,retryKey:'x'})).code,409);
  assert.equal((await invoke(handler,{...body,retryIssuedAt:now-16*60*1000})).code,409);
  assert.equal(gas.stats.calls,0);
});
test('disabled release refuses before GAS call',async()=>{
  const {gas,handler}=make();delete process.env.MIO_RECOVERY_RELEASE;
  try{assert.equal((await invoke(handler)).code,503);assert.equal(gas.stats.calls,0)}
  finally{process.env.MIO_RECOVERY_RELEASE='verified-gas-recovery-v2'}
});
test('different GAS-bound token hash fails with no cookie',async()=>{
  const {handler}=make(async()=>({ok:true,verified:true,recoveryApproved:true,recoveryConsumed:true,
    recoveryTokenBound:true,boundTokenHash:'f'.repeat(64),status:'承認済み',
    participantId:webId,approvedWebId:webId,integratedParticipantId:masterId,approvedMasterId:masterId}));
  const r=await invoke(handler);assert.equal(r.code,409);assert.equal(r.headers['Set-Cookie'],undefined);
});
test('inconsistent approved identities fail with no cookie',async()=>{
  const gas=fakeGas();
  const {handler}=make(async(a,p)=>({...await gas.bridge(a,p),approvedMasterId:'MIO-9999'}));
  const r=await invoke(handler);assert.equal(r.code,409);assert.equal(r.headers['Set-Cookie'],undefined);
});
test('missing operator approval fails with no cookie',async()=>{
  const gas=fakeGas();
  const {handler}=make(async(a,p)=>({...await gas.bridge(a,p),recoveryApproved:false}));
  const r=await invoke(handler);assert.equal(r.code,409);assert.equal(r.headers['Set-Cookie'],undefined);
});
test('GAS error does not expose internal secret',async()=>{
  const {handler}=make(async()=>{throw Error('DO_NOT_EXPOSE_PRIVATE_SECRET')});
  const r=await invoke(handler);assert.equal(r.code,409);assert.equal(r.headers['Set-Cookie'],undefined);
  assert.doesNotMatch(JSON.stringify(r.body),/DO_NOT_EXPOSE_PRIVATE_SECRET/);
});
test('client nickname and arbitrary target IDs cannot override approved target',async()=>{
  const {handler}=make();
  const r=await invoke(handler,{...body,name:'別人',participantId:'MIO-W-'+'f'.repeat(24),masterId:'MIO-9999'});
  assert.equal(r.code,200);
  assert.match(r.headers['Set-Cookie'],new RegExp('mio_session=mock\\.'+webId+'\\.'));
});
