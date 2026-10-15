import test from 'node:test';
import assert from 'node:assert/strict';
import {createInMemorySessionStore} from './mio-session-store.mjs';
import {createPostgresIdentifierStore} from './mio-postgres-identifier-store.mjs';
import {drawGachaTransaction} from './mio-gacha-transaction.mjs';
const accountId='123e4567-e89b-42d3-a456-426614174000';
test('integration: rename preserves both device sessions and same account identity',async()=>{
 const sessions=createInMemorySessionStore();
 const phone=sessions.create(accountId,'iPhone'),android=sessions.create(accountId,'Android');
 const queries=[];
 const pool={
  query:async(sql,args)=>({rowCount:1,rows:[{account_id:accountId}]}),
  connect:async()=>({query:async(sql,args=[])=>{
   queries.push(sql);
   if(sql.startsWith('SELECT login_id'))return {rowCount:1,rows:[{login_id:'OldMio_2026'}]};
   return {rowCount:1,rows:[]};
  },release:()=>{}})
 };
 const ids=createPostgresIdentifierStore(pool);
 assert.equal(await ids.resolve('OldMio_2026'),accountId);
 assert.equal((await ids.changeLoginId(accountId,'NewMio_2026')).changed,true);
 assert.equal(await ids.resolve('NewMio_2026'),accountId);
 assert.equal(sessions.lookup(phone.token).accountId,accountId);
 assert.equal(sessions.lookup(android.token).accountId,accountId);
 assert.equal(sessions.list(accountId).length,2);
 assert.equal(queries.includes('COMMIT'),true);
});
test('integration: gacha replay does not spend second right after device switch',async()=>{
 let remaining=1;const stored=new Map();
 const pool={connect:async()=>({query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT account_id'))return {rowCount:1,rows:[{account_id:accountId}]};
  if(sql.startsWith('SELECT draw_id'))return stored.has(args[1])?{rowCount:1,rows:[stored.get(args[1])]}:{rowCount:0,rows:[]};
  if(sql.startsWith('UPDATE mio_gacha_balances')){
   if(remaining===0)return {rowCount:0,rows:[]};
   remaining--;return {rowCount:1,rows:[{remaining}]};
  }
  if(sql.startsWith('INSERT INTO mio_gacha_draws')){stored.set(args[2],{draw_id:args[0],prize_code:args[3]});return {rowCount:1,rows:[]}}
  return {rowCount:0,rows:[]};
 },release:()=>{}})};
 const sessions=createInMemorySessionStore();
 const phone=sessions.create(accountId,'iPhone'),android=sessions.create(accountId,'Android');
 assert.equal(sessions.lookup(phone.token).accountId,sessions.lookup(android.token).accountId);
 const args={accountId,requestKey:'one-draw-across-devices-2026',selectPrize:()=> 'PRIZE-01'};
 const first=await drawGachaTransaction(pool,args);
 const replay=await drawGachaTransaction(pool,args);
 const newAttempt=await drawGachaTransaction(pool,{...args,requestKey:'another-draw-across-devices'});
 assert.equal(first.status,'drawn');assert.equal(replay.status,'replayed');
 assert.equal(replay.drawId,first.drawId);assert.equal(newAttempt.status,'no_rights');
 assert.equal(remaining,0);
});
