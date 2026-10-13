import test from 'node:test';
import assert from 'node:assert/strict';
import {drawGacha} from './v2-gacha-engine.mjs';
import {createDemoGachaStore} from './v2-gacha-demo-store.mjs';
const eventId='anniversary';
function fixture(balance=1,prizeCount=3) {
 return createDemoGachaStore({
 event:{active:true,startsAt:0,endsAt:999999,weights:[{id:'N',weight:1}]},
 balances:{[JSON.stringify(['member',eventId])]:balance},
 prizes:{[JSON.stringify([eventId,'N'])]:Array.from({length:prizeCount},(_,i)=>({id:'prize-'+i}))}
 });
}
const base={session:{verified:true,accountId:'member'},eventId,now:100,rng:()=>0};
test('concurrent requests with the same key consume one balance and one prize',async()=>{
 const store=fixture();
 const requests=Array.from({length:20},()=>drawGacha({...base,store,idempotencyKey:'same-key-1234567890'}));
 const results=await Promise.all(requests);
 assert.equal(new Set(results.map(x=>x.prizeId)).size,1);
 assert.equal(store.state.balances.get(JSON.stringify(['member',eventId])),0);
 assert.equal(store.state.draws.size,1);
});
test('different simultaneous keys cannot overspend a single draw',async()=>{
 const store=fixture();
 const results=await Promise.allSettled(Array.from({length:20},(_,i)=>drawGacha({...base,store,idempotencyKey:'different-key-'+String(i).padStart(16,'0')})));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,19);
 assert.equal(store.state.draws.size,1);
 assert.equal(store.state.balances.get(JSON.stringify(['member',eventId])),0);
});
test('prize shortage rolls back balance and draw',async()=>{
 const store=fixture(1,0);
 await assert.rejects(drawGacha({...base,store,idempotencyKey:'no-prize-123456789'}),{code:'prize_unavailable'});
 assert.equal(store.state.draws.size,0);
 assert.equal(store.state.balances.get(JSON.stringify(['member',eventId])),1);
});
