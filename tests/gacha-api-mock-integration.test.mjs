import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api-gacha.js';
import {sessionCookie,hash} from '../bridge.js';

// Full handler + signed session + read-only bridge + GAS response simulation.
// fetch is replaced locally: this suite makes ZERO network requests, spends
// ZERO draw rights and never uses a live participant or spreadsheet.
const secret='s'.repeat(48);
const id='MIO-W-'+'a'.repeat(24);
const token='b'.repeat(64);
const drawId='c'.repeat(32);
const fakeGasUrl='https://script.google.com/macros/s/GACHA-TEST-ONLY/exec';
const catalog=()=>({
  ok:true,participantId:id,confirmed:true,used:0,remaining:3,nextOrdinal:1,
  webDrawsUsed:0,festAvailableFrom:5,festEntitled:false,festUnlocked:false,
  normalOpen:true,festOpen:false,
  normal:{ready:true,safetyRevision:'mio-crossmode-nodup-v1',
    prizes:[{id:'MEM-01',name:'お試し景品',rarity:'N',chance:100,image:''}]},
  fest:{ready:false,safetyRevision:'mio-crossmode-nodup-v1',prizes:[]}
});
const previouslyWon=()=>({
  ok:true,participantId:id,history:[
    {drawId,mode:'通常',prize:'お試し景品',ordinal:1,rarity:'N',image:''}
  ]
});
const successfulDraw=()=>({ok:true,participantId:id,drawId,mode:'通常',
  prize:'お試し景品',ordinal:1,remaining:2,rarity:'N',image:'',replayed:false});

function request(body,overrides={}) {
  return {
    method:'POST',body,headers:{
      host:'example.vercel.app',origin:'https://example.vercel.app',
      cookie:sessionCookie(id,token,secret).split(';')[0]
    },...overrides
  };
}
function response() {
  return {
    headers:{},statusCode:200,payload:null,
    setHeader(k,v){this.headers[k]=v;return this},
    status(n){this.statusCode=n;return this},
    json(obj){this.payload=obj;return this}
  };
}

async function invoke(body,service,reqOverrides={},environment='production') {
  const previous={
    vercel:process.env.VERCEL_ENV,secret:process.env.APPS_SCRIPT_SECRET,
    url:process.env.APPS_SCRIPT_URL,fetch:globalThis.fetch
  };
  const calls=[];
  process.env.VERCEL_ENV=environment;
  process.env.APPS_SCRIPT_SECRET=secret;
  process.env.APPS_SCRIPT_URL=fakeGasUrl;
  globalThis.fetch=async (url,options)=>{
    assert.equal(url,fakeGasUrl,'test never calls a real network endpoint');
    const input=JSON.parse(options.body);
    assert.equal(input.secret,secret);
    assert.equal(input.participantId,id);
    assert.equal(input.tokenHash,hash(token));
    calls.push(input.action);
    const data=await service(input.action,input);
    return {ok:true,json:async()=>data};
  };
  const res=response();
  try {await handler(request(body,reqOverrides),res);}
  finally {
    globalThis.fetch=previous.fetch;
    for(const [env,val] of [
      ['VERCEL_ENV',previous.vercel],['APPS_SCRIPT_SECRET',previous.secret],
      ['APPS_SCRIPT_URL',previous.url]
    ]) val===undefined?delete process.env[env]:process.env[env]=val;
  }
  return {res,calls};
}

test('valid reviewed GAS calls read-only catalog before exactly one draw',async()=>{
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    action=>action==='catalog'?catalog():action==='draw'?successfulDraw():
      {ok:false,error:'unexpected action'});
  assert.equal(res.statusCode,200);
  assert.deepEqual(calls,['catalog','draw']);
  assert.equal(res.payload.drawId,drawId);
  assert.equal(res.payload.remaining,2);
  assert.match(res.headers['Set-Cookie'],/mio_session=/);
});

test('legacy GAS missing explicit nonduplication revision cannot perform a draw',async()=>{
  const outdated={...catalog(),normal:{...catalog().normal,safetyRevision:undefined}};
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    action=>action==='catalog'?outdated:{ok:true,participantId:id,history:[]});
  assert.equal(res.statusCode,409);
  assert.equal(res.payload.ok,false);
  assert.deepEqual(calls,['catalog','history']);
});

test('closed admin gate forbids new draw but replays a committed result',async()=>{
  const disabled={...catalog(),normalOpen:false};
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    action=>action==='catalog'?disabled:previouslyWon());
  assert.deepEqual(calls,['catalog','history']);
  assert.equal(res.statusCode,200);
  assert.equal(res.payload.replayed,true);
  assert.equal(res.payload.ordinal,1);
  assert.equal(res.payload.remaining,undefined);
});

test('zero remaining rights and no matching saved history never consume a draw',async()=>{
  const none={...catalog(),remaining:0};
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    action=>action==='catalog'?none:{ok:true,participantId:id,history:[]});
  assert.deepEqual(calls,['catalog','history']);
  assert.equal(res.statusCode,409);
});

test('GAS catalog outage cannot be silently bypassed for a new draw',async()=>{
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    action=>action==='catalog'?{ok:false,error:'timeout'}:
      {ok:true,participantId:id,history:[]});
  assert.equal(res.statusCode,409);
  assert.deepEqual(calls,['catalog','history']);
});

test('GAS catalog outage still allows confirmed read-only historical result',async()=>{
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    action=>action==='catalog'?{ok:false,error:'timeout'}:previouslyWon());
  assert.equal(res.statusCode,200);
  assert.equal(res.payload.replayed,true);
  assert.deepEqual(calls,['catalog','history']);
});

test('participant mismatch in recorded history cannot leak another result',async()=>{
  const foreign={...previouslyWon(),participantId:'MIO-W-'+'d'.repeat(24)};
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    action=>action==='catalog'?{...catalog(),normalOpen:false}:foreign);
  assert.equal(res.statusCode,409);
  assert.deepEqual(calls,['catalog','history']);
});

test('tampered or missing session is rejected before GAS is contacted',async()=>{
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    ()=>{throw Error('Must not call GAS')},
    {headers:{host:'example.vercel.app',origin:'https://example.vercel.app',cookie:'mio_session=invalid'}});
  assert.equal(res.statusCode,401);
  assert.deepEqual(calls,[]);
});

test('preview deployment cannot contact GAS even with signed cookie',async()=>{
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    ()=>{throw Error('Preview must not call GAS')},{},'preview');
  assert.equal(res.statusCode,503);
  assert.deepEqual(calls,[]);
});

test('cross-origin request is blocked before reading draw history',async()=>{
  const req=request({action:'draw',drawId,mode:'通常'});
  const {res,calls}=await invoke(req.body,
    ()=>{throw Error('Origin failure must not call GAS')},
    {headers:{...req.headers,origin:'https://malicious.example'}});
  assert.equal(res.statusCode,403);
  assert.deepEqual(calls,[]);
});

test('malformed draw identifier never contacts backend',async()=>{
  const {res,calls}=await invoke({action:'draw',drawId:'invalid',mode:'通常'},
    ()=>{throw Error('Malformed ID must not reach GAS')});
  assert.equal(res.statusCode,400);
  assert.deepEqual(calls,[]);
});

test('read-only history endpoint only invokes the history action',async()=>{
  const {res,calls}=await invoke({action:'history'},
    action=>action==='history'?previouslyWon():{ok:false,error:'unexpected'});
  assert.equal(res.statusCode,200);
  assert.deepEqual(calls,['history']);
  assert.equal(res.payload.history[0].drawId,drawId);
});

test('API rejects mismatched or incomplete committed GAS results without issuing another draw',async()=>{
  const base=successfulDraw();
  const cases=[
    ['wrong draw ID',{drawId:'d'.repeat(32)}],
    ['wrong gacha mode',{mode:'ラキフェス'}],
    ['blank prize',{prize:'   '}],
    ['missing ordinal',{ordinal:undefined}],
    ['fractional ordinal',{ordinal:1.5}],
    ['negative remaining',{remaining:-1}],
    ['fractional remaining',{remaining:1.5}],
    ['unknown replay status',{replayed:undefined}],
    ['wrong participant',{participantId:'MIO-W-'+'f'.repeat(24)}],
    ['invalid image',{image:12}],
    ['invalid rarity',{rarity:34}]
  ];
  for (const [label,change] of cases) {
    const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
      action=>action==='catalog'?catalog():{...base,...change});
    assert.equal(res.statusCode,409,label);
    assert.equal(res.payload.ok,false,label);
    assert.deepEqual(calls,['catalog','draw'],label);
    assert.equal(res.headers['Set-Cookie'],undefined,label);
  }
});

test('API allows explicitly marked GAS replay for the same drawId without a fresh write',async()=>{
  const existing={...successfulDraw(),replayed:true,remaining:1};
  const {res,calls}=await invoke({action:'draw',drawId,mode:'通常'},
    action=>action==='catalog'?catalog():existing);
  assert.equal(res.statusCode,200);
  assert.equal(res.payload.replayed,true);
  assert.deepEqual(calls,['catalog','draw']);
  // GAS is the authority for whether the same id has already been committed.
  // The API relays the idempotent draw request once and NEVER issues two draws.
});
