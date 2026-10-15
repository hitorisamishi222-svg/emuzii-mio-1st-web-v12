import test from 'node:test';
import assert from 'node:assert/strict';
import {registerAccountTransaction} from './mio-postgres-registration.mjs';
function mock({conflictAt=0,failBalance=false}={}){
 const queries=[];let claimCount=0;
 const pool={connect:async()=>({query:async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.startsWith('INSERT INTO mio_identifiers')){claimCount++;return {rowCount:claimCount===conflictAt?0:1,rows:[{identifier_key:args[0]}]}}
  if(failBalance&&sql.startsWith('INSERT INTO mio_gacha_balances'))throw Error('balance insert failed');
  return {rowCount:1,rows:[]};
 },release:()=>{queries.push({sql:'RELEASE'})}})};
 return {pool,queries};
}
const args={mioId:'MIO-TEST-0001',loginId:'TestUser_2026',password:'Strong-Example-Password-2026'};
test('registers account and both identifiers atomically',async()=>{
 const m=mock(),result=await registerAccountTransaction(m.pool,args);
 assert.match(result.accountId,/^[0-9a-f-]{36}$/);
 assert.equal(m.queries.filter(x=>x.sql.startsWith('INSERT INTO mio_identifiers')).length,2);
 assert.equal(m.queries.some(x=>x.sql==='COMMIT'),true);
 assert.equal(m.queries.at(-1).sql,'RELEASE');
 const accountInsert=m.queries.find(x=>x.sql.startsWith('INSERT INTO mio_accounts'));
 assert.notEqual(accountInsert.args[3],args.password);
 assert.equal(JSON.stringify(m.queries).includes(args.password),false);
});
test('duplicate MIO-ID rolls back',async()=>{
 const m=mock({conflictAt:1});
 await assert.rejects(registerAccountTransaction(m.pool,args),/already registered/);
 assert.equal(m.queries.some(x=>x.sql==='ROLLBACK'),true);
 assert.equal(m.queries.some(x=>x.sql==='COMMIT'),false);
});
test('duplicate login ID rolls back',async()=>{
 const m=mock({conflictAt:2});
 await assert.rejects(registerAccountTransaction(m.pool,args),/already registered/);
 assert.equal(m.queries.some(x=>x.sql==='ROLLBACK'),true);
});
test('failure creating rights rolls back all registration',async()=>{
 const m=mock({failBalance:true});
 await assert.rejects(registerAccountTransaction(m.pool,args),/balance insert failed/);
 assert.equal(m.queries.some(x=>x.sql==='ROLLBACK'),true);
});
test('invalid IDs rejected before opening DB transaction',async()=>{
 const m=mock();
 await assert.rejects(registerAccountTransaction(m.pool,{...args,loginId:'abc'}));
 await assert.rejects(registerAccountTransaction(m.pool,{...args,mioId:'TestUser_2026'}));
 assert.equal(m.queries.length,0);
});
