// Server-side gacha ledger engine for an injected transactional store.
// The store MUST implement serializable transaction locking and durable persistence.
// Not connected to production data or endpoints.
import {randomInt} from 'node:crypto';
export class GachaError extends Error {
  constructor(code) { super(code); this.code=code; }
}
export function selectRarity(weights, rng=randomInt) {
  if (!Array.isArray(weights)||weights.length===0) throw new GachaError('invalid_weights');
  let total=0;
  for(const item of weights) {
    if(!item||typeof item.id!=='string'||!item.id||!Number.isSafeInteger(item.weight)||item.weight<=0) throw new GachaError('invalid_weights');
    total+=item.weight;
    if(!Number.isSafeInteger(total)) throw new GachaError('invalid_weights');
  }
  const roll=rng(total);
  if(!Number.isSafeInteger(roll)||roll<0||roll>=total) throw new GachaError('invalid_rng');
  let sum=0;
  for(const item of weights){sum+=item.weight;if(roll<sum)return item.id;}
  throw new GachaError('invalid_weights');
}
export async function drawGacha({store,session,eventId,idempotencyKey,now=Date.now(),rng=randomInt}) {
  if(!session?.verified||typeof session.accountId!=='string'||!session.accountId) throw new GachaError('unauthenticated');
  if(typeof eventId!=='string'||!eventId||eventId.length>100) throw new GachaError('invalid_event');
  if(typeof idempotencyKey!=='string'||!/^[-_a-zA-Z0-9]{16,128}$/.test(idempotencyKey)) throw new GachaError('invalid_idempotency_key');
  if(!store||typeof store.transaction!=='function') throw new GachaError('missing_store');
  return store.transaction(async tx=>{
    // The DB must enforce UNIQUE(accountId,eventId,idempotencyKey) and lock
    // the participant balance row before checking/decrementing.
    const previous=await tx.findDraw(session.accountId,eventId,idempotencyKey);
    if(previous)return {...previous,replayed:true};
    const event=await tx.getEvent(eventId);
    if(!event?.active||now<event.startsAt||now>=event.endsAt)throw new GachaError('event_closed');
    const remaining=await tx.getDrawBalanceForUpdate(session.accountId,eventId);
    if(!Number.isSafeInteger(remaining)||remaining<=0)throw new GachaError('no_draws_remaining');
    const rarity=selectRarity(event.weights,rng);
    const prize=await tx.reservePrizeForUpdate(eventId,rarity);
    if(!prize)throw new GachaError('prize_unavailable');
    const draw={accountId:session.accountId,eventId,idempotencyKey,rarity,prizeId:prize.id,createdAt:now};
    await tx.decrementDrawBalance(session.accountId,eventId);
    await tx.insertDraw(draw);
    return {...draw,replayed:false};
  });
}
