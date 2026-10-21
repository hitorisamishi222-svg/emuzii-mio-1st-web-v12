import test from 'node:test';
import assert from 'node:assert/strict';
import {issueVerifiedOperationGrant,createVerifiedGrantConsumer} from '../participant-verified-operation-v205.js';
const mioId='MIO-0039',actorBrowserId='MIO-W-'+'1'.repeat(24),targetBrowserId='MIO-W-'+'2'.repeat(24);
const actorTokenHash='a'.repeat(64);
const scope={mioId,actorBrowserId,actorTokenHash,operation:'link-browser',targetBrowserId};
function fakeDB(){
  const grants=new Map();const calls=[];let failIssue=false;
  const c={
    async query(sql,p=[]){
      calls.push(sql);
      if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rowCount:0,rows:[]};
      if(sql.startsWith('INSERT INTO mio_verified_operation_grants_v205')){
        if(failIssue)throw Error('storage failed');
        grants.set(p[0],{mioId:p[1],actorBrowserId:p[2],actorTokenHash:p[3],operation:p[4],targetBrowserId:p[5],used:false});
        return {rowCount:1,rows:[{grant_hash:p[0]}]};
      }
      if(sql.startsWith('UPDATE mio_verified_operation_grants_v205')){
        const r=grants.get(p[0]);
        if(!r||r.used||r.mioId!==p[1]||r.actorBrowserId!==p[2]||r.actorTokenHash!==p[3]||r.operation!==p[4]||r.targetBrowserId!==p[5])
          return {rowCount:0,rows:[]};
        r.used=true;return {rowCount:1,rows:[{mio_id:r.mioId,method:'webauthn-uv'}]};
      }
      throw Error('unexpected SQL '+sql);
    },release(){calls.push('RELEASE')}
  };
  return {c,db:{async connect(){return c}},grants,calls,setFail(){failIssue=true}};
}
async function setup(){
  const f=fakeDB();const grant=await issueVerifiedOperationGrant(f.c,scope);
  return {f,grant,consumer:createVerifiedGrantConsumer({db:f.db,grant,actorBrowserId,actorTokenHash})};
}
const request={mioId,operation:'link-browser',targetBrowserId};
test('grant issued only with valid scope; no plaintext persisted',async()=>{
  const {f,grant}=await setup();
  assert.match(grant,/^[a-f0-9]{64}$/);assert.equal(f.grants.size,1);
  assert.equal(f.grants.has(grant),false);
});
test('missing target is rejected before database write',async()=>{
  const f=fakeDB();
  await assert.rejects(issueVerifiedOperationGrant(f.c,{...scope,targetBrowserId:null}),/INVALID_GRANT_TARGET/);
  assert.equal(f.calls.length,0);
});
test('unknown operation rejected before database write',async()=>{
  const f=fakeDB();
  await assert.rejects(issueVerifiedOperationGrant(f.c,{...scope,operation:'approve-gacha'}),/INVALID_GRANT_SCOPE/);
});
test('matching grant is consumed and returns internal verified ownership',async()=>{
  const {consumer}=await setup();const p=await consumer(request);
  assert.equal(p.mioId,mioId);assert.equal(p.method,'webauthn-uv');
  assert.equal(p.actorBrowserId,actorBrowserId);
});
test('same grant cannot be consumed twice even with fresh consumer',async()=>{
  const {f,grant,consumer}=await setup();await consumer(request);
  const other=createVerifiedGrantConsumer({db:f.db,grant,actorBrowserId,actorTokenHash});
  await assert.rejects(other(request),/GRANT_EXPIRED_USED_OR_MISMATCHED/);
});
test('wrong participant cannot consume grant',async()=>{
  const {consumer}=await setup();
  await assert.rejects(consumer({...request,mioId:'MIO-0001'}),/GRANT_EXPIRED_USED_OR_MISMATCHED/);
});
test('wrong target cannot consume grant',async()=>{
  const {consumer}=await setup();
  await assert.rejects(consumer({...request,targetBrowserId:actorBrowserId}),/GRANT_EXPIRED_USED_OR_MISMATCHED/);
});
test('wrong operation cannot consume grant',async()=>{
  const {consumer}=await setup();
  await assert.rejects(consumer({...request,operation:'revoke-browser'}),/GRANT_EXPIRED_USED_OR_MISMATCHED/);
});
test('wrong actor browser cannot consume grant',async()=>{
  const {f,grant}=await setup();
  const consumer=createVerifiedGrantConsumer({db:f.db,grant,actorBrowserId:targetBrowserId,actorTokenHash});
  await assert.rejects(consumer(request),/GRANT_EXPIRED_USED_OR_MISMATCHED/);
});
test('wrong actor token cannot consume grant',async()=>{
  const {f,grant}=await setup();
  const consumer=createVerifiedGrantConsumer({db:f.db,grant,actorBrowserId,actorTokenHash:'b'.repeat(64)});
  await assert.rejects(consumer(request),/GRANT_EXPIRED_USED_OR_MISMATCHED/);
});
test('missing/invalid grant fails closed',async()=>{
  const f=fakeDB();
  assert.throws(()=>createVerifiedGrantConsumer({db:f.db,grant:'fake',actorBrowserId,actorTokenHash}),/INVALID_GRANT/);
});
test('database error prevents issuing a grant',async()=>{
  const f=fakeDB();f.setFail();
  await assert.rejects(issueVerifiedOperationGrant(f.c,scope),/storage failed/);
  assert.equal(f.grants.size,0);
});
