import test from 'node:test';
import assert from 'node:assert/strict';
import {createGasModel} from './support/gas-recovery-model.mjs';
const a='1'.repeat(64),b='2'.repeat(64);

test('existing ID and non-token history stay unchanged',async()=>{
  const m=createGasModel(),before=structuredClone(m.row);
  const r=await m.recover({grantHash:m.grantHash,tokenHash:a});
  assert.equal(r.participantId,before.webId);
  assert.deepEqual({...m.row,tokenHash:before.tokenHash},before);
  assert.equal(m.row.tokenHash,a);assert.equal(m.stats.tokenWrites,1);
});
test('parallel different-token requests cannot both succeed',async()=>{
  const m=createGasModel();
  const results=await Promise.allSettled([
    m.recover({grantHash:m.grantHash,tokenHash:a}),
    m.recover({grantHash:m.grantHash,tokenHash:b})
  ]);
  assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected']);
  assert.equal(m.row.tokenHash,a);assert.equal(m.stats.tokenWrites,1);
});
test('parallel identical retries finish once',async()=>{
  const m=createGasModel();
  const results=await Promise.all([
    m.recover({grantHash:m.grantHash,tokenHash:a}),
    m.recover({grantHash:m.grantHash,tokenHash:a})
  ]);
  assert.equal(results.length,2);assert.equal(m.stats.tokenWrites,1);
  assert.equal(m.stats.intentWrites,1);assert.equal(m.stats.completions,1);
});
test('interrupted after intent resumes only with same token',async()=>{
  const m=createGasModel(),request={grantHash:m.grantHash,tokenHash:a};
  await assert.rejects(m.recover(request,{failAfterIntent:true}));
  await assert.rejects(m.recover({...request,tokenHash:b}));
  assert.equal(m.row.tokenHash,'0'.repeat(64));
  assert.equal((await m.recover(request)).ok,true);
  assert.equal(m.stats.tokenWrites,1);assert.equal(m.stats.intentWrites,1);
});
test('interrupted after row binding resumes without second token write',async()=>{
  const m=createGasModel(),request={grantHash:m.grantHash,tokenHash:a};
  await assert.rejects(m.recover(request,{failAfterBind:true}));
  assert.equal(m.grant.used,false);assert.equal(m.row.tokenHash,a);
  assert.equal((await m.recover(request)).recoveryConsumed,true);
  assert.equal(m.stats.tokenWrites,1);assert.equal(m.stats.completions,1);
});
test('expired revoked and incorrect grants never write',async()=>{
  const m=createGasModel({now:1000,ttl:1000});
  await assert.rejects(m.recover({grantHash:m.grantHash,tokenHash:a},{at:2001}));
  m.grant.approved=false;
  await assert.rejects(m.recover({grantHash:m.grantHash,tokenHash:a},{at:1000}));
  await assert.rejects(m.recover({grantHash:b,tokenHash:a},{at:1000}));
  assert.equal(m.stats.tokenWrites,0);assert.equal(m.stats.intentWrites,0);
});
test('duplicated Web-ID or wrong approved MIO-ID blocks writes',async()=>{
  const m=createGasModel();m.rows.push({...m.row});
  await assert.rejects(m.recover({grantHash:m.grantHash,tokenHash:a}));
  assert.equal(m.stats.tokenWrites,0);
  m.rows.pop();m.grant.approvedMasterId='MIO-9999';
  await assert.rejects(m.recover({grantHash:m.grantHash,tokenHash:a}));
  assert.equal(m.stats.tokenWrites,0);
});
test('invalid token hashes fail closed',async()=>{
  const m=createGasModel();
  await assert.rejects(m.recover({grantHash:m.grantHash,tokenHash:'bad'}));
  assert.equal(m.stats.tokenWrites,0);
});
