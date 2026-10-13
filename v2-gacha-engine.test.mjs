import test from 'node:test';
import assert from 'node:assert/strict';
import {drawGacha,GachaError,selectRarity} from './v2-gacha-engine.mjs';
const event={active:true,startsAt:0,endsAt:999999,weights:[{id:'N',weight:90},{id:'UR',weight:10}]};
function mockStore(){
  const state={balance:2,draws:new Map(),prizes:[{id:'n-1'},{id:'n-2'}]};
  return {state,transaction:async fn=>{
    const tx={
      findDraw:async(a,e,k)=>state.draws.get(a+e+k),
      getEvent:async()=>event,
      getDrawBalanceForUpdate:async()=>state.balance,
      reservePrizeForUpdate:async()=>state.prizes.shift(),
      decrementDrawBalance:async()=>{state.balance--},
      insertDraw:async d=>{state.draws.set(d.accountId+d.eventId+d.idempotencyKey,d)}
    };return fn(tx);
  }};
}
const args={session:{verified:true,accountId:'member-1'},eventId:'anniversary',idempotencyKey:'unique-request-12345',now:1000,rng:()=>0};
test('secure weighted selection boundaries',()=>{assert.equal(selectRarity(event.weights,()=>0),'N');assert.equal(selectRarity(event.weights,()=>99),'UR');assert.throws(()=>selectRarity(event.weights,()=>100),GachaError)});
test('repeated request returns original result without another draw',async()=>{const store=mockStore();const a=await drawGacha({...args,store});const b=await drawGacha({...args,store});assert.equal(a.prizeId,b.prizeId);assert.equal(b.replayed,true);assert.equal(store.state.balance,1)});
test('reject unauthenticated and exhausted draws',async()=>{const store=mockStore();await assert.rejects(drawGacha({...args,store,session:{verified:false}}),{code:'unauthenticated'});await drawGacha({...args,store});await drawGacha({...args,store,idempotencyKey:'unique-request-99999'});await assert.rejects(drawGacha({...args,store,idempotencyKey:'unique-request-88888'}),{code:'no_draws_remaining'})});
