import test from 'node:test';
import assert from 'node:assert/strict';
import {recordRecentIP,trustedEdgeIP,MAX_RECENT_IPS} from '../registration-ip-history-v203.js';
const browserId='MIO-W-0123456789abcdef01234567';
const secret='s'.repeat(64);
function mockDB({failOn}={}){
  const calls=[];
  const client={
    async query(sql,args=[]){calls.push({sql,args});if(failOn&&sql.includes(failOn))throw Error('simulated db failure');return {rows:[],rowCount:1}},
    release(){calls.push({sql:'RELEASE'})}
  };
  return {calls,db:{async connect(){return client}}};
}
test('accepts valid forwarded IP and ignores invalid values',()=>{
  assert.equal(trustedEdgeIP({headers:{'x-forwarded-for':'203.0.113.5'}}),'203.0.113.5');
  assert.equal(trustedEdgeIP({headers:{'x-forwarded-for':'2001:db8::7'}}),'2001:db8::7');
  assert.equal(trustedEdgeIP({headers:{'x-forwarded-for':'notanip'}}),null);
  assert.equal(MAX_RECENT_IPS,5);
});
test('rejects invalid ID before touching store',async()=>{
  const m=mockDB();const r=await recordRecentIP({headers:{'x-forwarded-for':'203.0.113.5'}},'MIO-0001',{secret,db:m.db});
  assert.equal(r.recorded,false);assert.equal(m.calls.length,0);
});
test('rejects missing secret or edge header without writes',async()=>{
  const m=mockDB();
  assert.equal((await recordRecentIP({headers:{'x-forwarded-for':'203.0.113.5'}},browserId,{secret:'a',db:m.db})).recorded,false);
  assert.equal((await recordRecentIP({headers:{}},browserId,{secret,db:m.db})).recorded,false);
  assert.equal(m.calls.length,0);
});
test('HMAC IP is stored; never a raw IP; preserves current + 4 others',async()=>{
  const m=mockDB();const r=await recordRecentIP({headers:{'x-forwarded-for':'203.0.113.5'}},browserId,{secret,db:m.db});
  assert.equal(r.recorded,true);
  assert.deepEqual(m.calls.map(c=>c.sql==='RELEASE'?'RELEASE':c.sql.includes('pg_advisory')?'LOCK':c.sql.trim().split(/\s+/)[0]),['BEGIN','LOCK','DELETE','INSERT','DELETE','COMMIT','RELEASE']);
  const insert=m.calls.find(c=>c.sql.startsWith('INSERT'));
  assert.equal(insert.args[0],browserId);assert.match(insert.args[1],/^[a-f0-9]{64}$/);
  assert.equal(insert.args[2],4);
  assert.equal(JSON.stringify(m.calls).includes('203.0.113.5'),false);
  const prune=m.calls.find(c=>c.sql.includes('OFFSET 4'));
  assert.ok(prune);assert.deepEqual(prune.args,[browserId,insert.args[1]]);
});
test('rolls back and releases connection on failed write',async()=>{
  const m=mockDB({failOn:'INSERT INTO'});
  await assert.rejects(recordRecentIP({headers:{'x-forwarded-for':'203.0.113.5'}},browserId,{secret,db:m.db}),/simulated/);
  assert.ok(m.calls.some(c=>c.sql==='ROLLBACK'));
  assert.equal(m.calls.at(-1).sql,'RELEASE');
});
test('six distinct IP observations retain only the newest five (simulated store)',async()=>{
  const rows=new Map();let tick=0;
  const db={async connect(){return {
    async query(sql,args=[]){
      if(sql.startsWith('INSERT INTO'))rows.set(args[1],++tick);
      if(sql.includes('OFFSET 4')){
        const [browser,current]=args;void browser;
        const toKeep=[...rows.entries()].filter(([h])=>h!==current)
          .sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]);
        for(const h of rows.keys())if(h!==current&&!toKeep.includes(h))rows.delete(h);
      }
      return {rows:[],rowCount:1};
    },release(){}
  }}};
  for(let n=1;n<=6;n++){
    const r=await recordRecentIP({headers:{'x-forwarded-for':`198.51.100.${n}`}},browserId,{db,secret});
    assert.equal(r.recorded,true);
  }
  assert.equal(rows.size,5);
  const expected=await import('node:crypto').then(m=>m.createHmac('sha256',secret).update('mio-ip-v203:').update('198.51.100.6').digest('hex'));
  assert.ok(rows.has(expected));
});
