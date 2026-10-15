import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresIdentifierStore} from './mio-postgres-identifier-store.mjs';
const accountId='123e4567-e89b-42d3-a456-426614174000';
function mock({conflict=false,missing=false,retireMissing=false}={}){
 const queries=[],client={async query(sql,args=[]){
  queries.push({sql,args});
  if(sql.startsWith('SELECT login_id'))return {rowCount:missing?0:1,rows:[{login_id:'OldMio_2026'}]};
  if(sql.startsWith('INSERT'))return {rowCount:conflict?0:1,rows:[{identifier_key:args[0]}]};
  if(sql.startsWith('UPDATE mio_identifiers'))return {rowCount:retireMissing?0:1,rows:[{identifier_key:args[0]}]};
  return {rowCount:1,rows:[]};
 },release(){queries.push({sql:'RELEASE'})}};
 return {queries,pool:{connect:async()=>client,query:async()=>({rowCount:0,rows:[]})}};
}
test('ID change claims new ID and retires previous one in transaction',async()=>{
 const m=mock(),s=createPostgresIdentifierStore(m.pool);
 const r=await s.changeLoginId(accountId,'NewMio_2026');
 assert.equal(r.changed,true);assert.equal(m.queries[0].sql,'BEGIN');
 assert.equal(m.queries.some(x=>x.sql.includes("kind='retired_login_id'")),true);
 assert.equal(m.queries.some(x=>x.sql==='COMMIT'),true);
 assert.equal(m.queries.at(-1).sql,'RELEASE');
});
test('duplicate or retired ID rejects and rolls back',async()=>{
 const m=mock({conflict:true}),s=createPostgresIdentifierStore(m.pool);
 await assert.rejects(s.changeLoginId(accountId,'NewMio_2026'),/already used/);
 assert.equal(m.queries.some(x=>x.sql==='ROLLBACK'),true);
 assert.equal(m.queries.some(x=>x.sql==='COMMIT'),false);
});
test('missing old mapping rolls back instead of losing history',async()=>{
 const m=mock({retireMissing:true}),s=createPostgresIdentifierStore(m.pool);
 await assert.rejects(s.changeLoginId(accountId,'NewMio_2026'),/mapping missing/);
 assert.equal(m.queries.some(x=>x.sql==='ROLLBACK'),true);
});
test('same ID only updates casing without alias reallocation',async()=>{
 const m=mock(),s=createPostgresIdentifierStore(m.pool);
 const r=await s.changeLoginId(accountId,'OLDMIO_2026');
 assert.equal(r.changed,false);
 assert.equal(m.queries.some(x=>x.sql.startsWith('INSERT')),false);
});
test('invalid login ID fails before opening transaction',async()=>{
 const m=mock(),s=createPostgresIdentifierStore(m.pool);
 await assert.rejects(s.changeLoginId(accountId,'short'));
 assert.equal(m.queries.length,0);
});
test('missing account rolls back and releases connection',async()=>{
 const m=mock({missing:true}),s=createPostgresIdentifierStore(m.pool);
 await assert.rejects(s.changeLoginId(accountId,'NewMio_2026'),/not found/);
 assert.equal(m.queries.some(x=>x.sql==='ROLLBACK'),true);
 assert.equal(m.queries.at(-1).sql,'RELEASE');
});
