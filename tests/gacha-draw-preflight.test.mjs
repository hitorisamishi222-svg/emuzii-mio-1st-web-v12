import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightGachaDraw} from '../gacha-draw-preflight.js';

const participantId='MIO-W-'+'a'.repeat(24);
const request={drawId:'b'.repeat(32),mode:'通常'};
const identity={participantId,tokenHash:'c'.repeat(64)};
const catalog=()=>({
  ok:true,participantId,confirmed:true,festEntitled:false,festUnlocked:false,
  normalOpen:true,festOpen:false,used:0,remaining:4,nextOrdinal:1,
  webDrawsUsed:0,festAvailableFrom:5,
  normal:{ready:true,prizes:[],safetyRevision:'mio-crossmode-nodup-v1'},
  fest:{ready:false,prizes:[],safetyRevision:'mio-crossmode-nodup-v1'}
});
const recorded=()=>({
  ok:true,participantId,history:[{...request,prize:'翠央グッズ',ordinal:1,rarity:'R',image:''}]
});
const track=(handler)=>{
  const actions=[];
  return {actions,read:async(action,who)=>{actions.push(action);assert.deepEqual(who,identity);return handler(action)}};
};

test('valid catalog permits caller to proceed but performs no draw itself',async()=>{
  const t=track(()=>catalog());
  assert.deepEqual(await preflightGachaDraw(t.read,identity,request),{kind:'fresh'});
  assert.deepEqual(t.actions,['catalog']);
});

test('invalid catalog recovers matching history strictly read-only',async()=>{
  const t=track(action=>action==='catalog'?{...catalog(),festUnlocked:true}:recorded());
  const out=await preflightGachaDraw(t.read,identity,request);
  assert.equal(out.kind,'replayed');
  assert.equal(out.data.prize,'翠央グッズ');
  assert.equal(out.data.replayed,true);
  assert.deepEqual(t.actions,['catalog','history']);
});

test('invalid catalog and unknown draw must remain blocked',async()=>{
  const t=track(action=>action==='catalog'?{ok:false}: {...recorded(),history:[]});
  assert.deepEqual(await preflightGachaDraw(t.read,identity,request),{kind:'blocked'});
  assert.deepEqual(t.actions,['catalog','history']);
});

test('catalog timeout may recover an actual committed record',async()=>{
  const t=track(action=>{if(action==='catalog')throw Error('timeout');return recorded()});
  assert.equal((await preflightGachaDraw(t.read,identity,request)).kind,'replayed');
  assert.deepEqual(t.actions,['catalog','history']);
});

test('catalog outage and history outage cannot unlock new draws',async()=>{
  const t=track(()=>{throw Error('unavailable')});
  assert.deepEqual(await preflightGachaDraw(t.read,identity,request),{kind:'blocked'});
  assert.deepEqual(t.actions,['catalog','history']);
});

test('wrong participant response may not recover from even a matching drawId',async()=>{
  const t=track(action=>action==='catalog'?{...catalog(),participantId:'MIO-W-'+'z'.repeat(24)}:
    {...recorded(),participantId:'MIO-W-'+'d'.repeat(24)});
  assert.deepEqual(await preflightGachaDraw(t.read,identity,request),{kind:'blocked'});
  assert.deepEqual(t.actions,['catalog','history']);
});

test('history returns conflicting draw mode and cannot authorize reuse',async()=>{
  const t=track(action=>action==='catalog'?{ok:false}:{
    ...recorded(),history:[{drawId:request.drawId,mode:'ラキフェス',prize:'別景品',ordinal:2}]
  });
  assert.deepEqual(await preflightGachaDraw(t.read,identity,request),{kind:'blocked'});
});

test('all read-only recovery paths use only catalog/history actions',async()=>{
  for (const fail of [false,true]) {
    const t=track(action=>{
      if(action==='catalog'){if(fail)throw Error('failure');return {ok:false}}
      return recorded();
    });
    await preflightGachaDraw(t.read,identity,request);
    assert.equal(t.actions.includes('draw'),false);
  }
});

test('valid catalog cannot authorize a new draw when basic rights or admin gates are unavailable',async()=>{
  const scenarios=[
    ['membership unconfirmed', {confirmed:false}],
    ['zero remaining rights', {remaining:0}],
    ['normal gate closed', {normalOpen:false}],
    ['normal prizes not ready', {normal:{ready:false,prizes:[],safetyRevision:'mio-crossmode-nodup-v1'}}],
  ];
  for (const [label,overrides] of scenarios) {
    const base={...catalog(),...overrides};
    const t=track(action=>action==='catalog'?base:{...recorded(),history:[]});
    assert.deepEqual(await preflightGachaDraw(t.read,identity,request),
      {kind:'blocked',reason:'gate'},label);
    assert.deepEqual(t.actions,['catalog','history'],label);
  }
});

test('fifth-draw condition and fest-specific admin gate must all be met',async()=>{
  const fest={...catalog(),used:4,remaining:4,nextOrdinal:5,webDrawsUsed:4,
    festEntitled:true,festUnlocked:true,festOpen:true,fest:{ready:true,prizes:[],safetyRevision:'mio-crossmode-nodup-v1'}};
  const wanted={...request,mode:'ラキフェス'};
  for (const [label,overrides] of [
    ['admin gate closed',{festOpen:false}],
    ['not entitled',{festEntitled:false,festUnlocked:false}],
    ['not unlocked',{webDrawsUsed:3,festUnlocked:false}],
    ['prizes missing',{fest:{ready:false,prizes:[],safetyRevision:'mio-crossmode-nodup-v1'}}],
  ]) {
    const t=track(action=>action==='catalog'?{...fest,...overrides}:{...recorded(),history:[]});
    assert.deepEqual(await preflightGachaDraw(t.read,identity,wanted),
      {kind:'blocked',reason:'gate'},label);
    assert.deepEqual(t.actions,['catalog','history'],label);
  }
  const t=track(()=>fest);
  assert.deepEqual(await preflightGachaDraw(t.read,identity,wanted),{kind:'fresh'});
  assert.deepEqual(t.actions,['catalog']);
});

test('even when administrator closes a mode, already committed history can be replayed',async()=>{
  const t=track(action=>action==='catalog'?{...catalog(),normalOpen:false}:recorded());
  const result=await preflightGachaDraw(t.read,identity,request);
  assert.equal(result.kind,'replayed');
  assert.equal(result.data.replayed,true);
  assert.deepEqual(t.actions,['catalog','history']);
});

test('invalid identity, draw id, or mode never contacts GAS',async()=>{
  const t=track(()=>{throw Error('Unexpected bridge access')});
  for (const [ident,req] of [
    [{...identity,participantId:'wrong'},request],
    [identity,{...request,drawId:'not-id'}],
    [identity,{...request,mode:'UNKNOWN'}],
    [null,request],
    [identity,null]
  ]) {
    assert.deepEqual(await preflightGachaDraw(t.read,ident,req),{kind:'blocked'});
  }
  assert.deepEqual(t.actions,[]);
});

test('legacy backend lacking reviewed safety revision cannot authorize a new draw',async()=>{
  const legacy={...catalog(),normal:{ready:true,prizes:[]},fest:{ready:false,prizes:[]}};
  const t=track(action=>action==='catalog'?legacy:{...recorded(),history:[]});
  assert.deepEqual(await preflightGachaDraw(t.read,identity,request),{kind:'blocked'});
  assert.deepEqual(t.actions,['catalog','history']);
});

test('mismatched mode safety revisions cannot authorize a new draw',async()=>{
  const invalid={...catalog(),fest:{ready:false,prizes:[],safetyRevision:'legacy-v0'}};
  const t=track(action=>action==='catalog'?invalid:{...recorded(),history:[]});
  assert.deepEqual(await preflightGachaDraw(t.read,identity,request),{kind:'blocked'});
  assert.deepEqual(t.actions,['catalog','history']);
});

test('legacy GAS still permits read-only recovery of a proven committed result',async()=>{
  const legacy={...catalog(),normal:{ready:true,prizes:[]},fest:{ready:false,prizes:[]}};
  const t=track(action=>action==='catalog'?legacy:recorded());
  const decision=await preflightGachaDraw(t.read,identity,request);
  assert.equal(decision.kind,'replayed');
  assert.equal(decision.data.drawId,request.drawId);
  assert.deepEqual(t.actions,['catalog','history']);
});
