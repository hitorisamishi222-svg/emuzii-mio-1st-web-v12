// Development-only serialized in-memory test store. Never use for real draws.
export function createDemoGachaStore({event,balances={},prizes={}}){
 const state={event,balances:new Map(Object.entries(balances)),prizes:new Map(Object.entries(prizes).map(([k,v])=>[k,[...v]])),draws:new Map()};
 let queue=Promise.resolve();
 return {state,transaction(fn){
  const run=async()=>{
   const snapshot={balances:new Map(state.balances),prizes:new Map([...state.prizes].map(([k,v])=>[k,[...v]])),draws:new Map(state.draws)};
   const tx={
    findDraw:async(a,e,k)=>state.draws.get(JSON.stringify([a,e,k])),
    getEvent:async()=>state.event,
    getDrawBalanceForUpdate:async(a,e)=>state.balances.get(JSON.stringify([a,e]))??0,
    reservePrizeForUpdate:async(e,r)=>state.prizes.get(JSON.stringify([e,r]))?.shift()??null,
    decrementDrawBalance:async(a,e)=>{const k=JSON.stringify([a,e]);state.balances.set(k,state.balances.get(k)-1)},
    insertDraw:async d=>{const k=JSON.stringify([d.accountId,d.eventId,d.idempotencyKey]);if(state.draws.has(k))throw Error('duplicate_key');state.draws.set(k,d)}
   };
   try{return await fn(tx)}catch(err){state.balances=snapshot.balances;state.prizes=snapshot.prizes;state.draws=snapshot.draws;throw err}
  };
  const pending=queue.then(run,run);queue=pending.then(()=>{},()=>{});return pending;
 }};
}
