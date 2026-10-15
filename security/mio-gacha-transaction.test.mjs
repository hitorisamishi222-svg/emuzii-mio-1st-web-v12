import test from 'node:test';
import assert from 'node:assert/strict';
import {drawGachaTransaction} from './mio-gacha-transaction.mjs';
const accountId='123e4567-e89b-42d3-a456-426614174000';
function fakePool({rights=1,existing=null,missingAccount=false,failInsert=false}={}){
 const state={rights,existing,queries:[],released:false,rolledBack:false,committed:false};
 return {state,connect:async()=>({query:async(sql,args=[])=>{
  state.queries.push({sql,args});
  if(sql==='BEGIN')return {rowCount:0,rows:[]};
  if(sql==='COMMIT'){state.committed=true;return {rowCount:0,rows:[]}}
  if(sql==='ROLLBACK'){state.rolledBack=true;return {rowCount:0,rows:[]}}
  if(sql.includes('FROM mio_accounts_v21'))return {rowCount:missingAccount?0:1,rows:[{account_id:accountId}]};
  if(sql.includes('SELECT draw_id'))return state.existing?{rowCount:1,rows:[state.existing]}:{rowCount:0,rows:[]};
  if(sql.startsWith('UPDATE mio_gacha_balances')){if(state.rights<=0)return {rowCount:0,rows:[]};state.rights--;return {rowCount:1,rows:[{remaining:state.rights}]}}
  if(sql.startsWith('INSERT INTO mio_gacha_draws')){if(failInsert)throw Error('insert failed');state.existing={draw_id:args[0],prize_code:args[3]};return {rowCount:1,rows:[]}}
  throw Error('unexpected query: '+sql);
 },release:()=>{state.released=true}})};
}
test('first draw decrements one right and records prize',async()=>{
 const pool=fakePool({rights:2});
 const r=await drawGachaTransaction(pool,{accountId,requestKey:'unique-request-0001',selectPrize:()=> 'PRIZE-A'});
 assert.equal(r.status,'drawn');assert.equal(r.remaining,1);assert.equal(pool.state.rights,1);
 assert.equal(pool.state.committed,true);assert.equal(pool.state.released,true);
});
test('duplicate request returns previous result without spending rights',async()=>{
 const pool=fakePool({rights:2,existing:{draw_id:'saved-draw',prize_code:'PRIZE-B'}});
 const r=await drawGachaTransaction(pool,{accountId,requestKey:'unique-request-0001',selectPrize:()=>{throw Error('must not draw')}});
 assert.equal(r.status,'replayed');assert.equal(pool.state.rights,2);
 assert.equal(pool.state.queries.some(q=>q.sql.startsWith('UPDATE')),false);
});
test('no remaining rights prevents draw',async()=>{
 const pool=fakePool({rights:0});
 const r=await drawGachaTransaction(pool,{accountId,requestKey:'unique-request-0001',selectPrize:()=>{throw Error('must not draw')}});
 assert.equal(r.status,'no_rights');assert.equal(pool.state.committed,true);
});
test('database failure rolls back and releases connection',async()=>{
 const pool=fakePool({rights:1,failInsert:true});
 await assert.rejects(drawGachaTransaction(pool,{accountId,requestKey:'unique-request-0001',selectPrize:()=> 'PRIZE-A'}),/insert failed/);
 assert.equal(pool.state.rolledBack,true);assert.equal(pool.state.released,true);
});
test('invalid requests never connect',async()=>{
 let connected=false;const pool={connect:async()=>{connected=true;throw Error('should not connect')}};
 await assert.rejects(drawGachaTransaction(pool,{accountId:'invalid',requestKey:'x',selectPrize:()=> 'A'}));
 assert.equal(connected,false);
});
