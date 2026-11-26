import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign as signBytes} from 'node:crypto';
import {createClaimApi} from '../mio-claim-api-vnext.mjs';
import {claimIssuedAccess,activatePendingAccess} from '../mio-level-registration-vnext.mjs';
import {issueCode,sessionDigest} from '../mio-level-access-vnext.mjs';

const pepper='mio-vnext-stage-test-pepper-only-not-a-real-secret-48-chars';
const name='既存会員A',masterId='MIO-0017';
const device={source:'server-verified-signature',fresh:true,fingerprint:'sha256:'+'a'.repeat(64),publicJwk:{kty:'EC',crv:'P-256',x:'x',y:'y'}};
const now=new Date('2026-11-26T00:00:00Z');
function fakeDB(){
 const issued=issueCode(pepper),state={
  invite:{invite_id:'invite-a',master_id:masterId,issuer_id:'mio',generation:1,
   code_hash:issued.codeHash,status:'issued',expires_at:new Date(now.getTime()+3600_000),level:2,member_until:null},
  account:{master_id:masterId,display_name:name,generation:0,status:'active',
   session_hash:'old-device-session',session_expires_at:new Date(now.getTime()+10*86400_000),
   device_thumbprint:'sha256:'+'f'.repeat(64),level:2,member_until:null,issuer_id:'mio'},
  pending:null,rollback:false
 };
 const query=async(sql,args=[])=>{
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){if(sql==='ROLLBACK')state.rollback=true;return {rows:[]}}
  if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[{}]};
  if(sql.startsWith('SELECT master_id FROM mio_level_invites_v1'))return {rows:state.invite.code_hash===args[0]&&['issued','claimed'].includes(state.invite.status)?[{master_id:masterId}]:[]};
  if(sql.startsWith('SELECT invite_id,master_id,issuer_id,generation,expires_at,level,member_until,status FROM mio_level_invites_v1'))return {rows:state.invite.code_hash===args[0]&&['issued','claimed'].includes(state.invite.status)?[{...state.invite}]:[]};
  if(sql.startsWith('SELECT master_id,display_name,generation,status,session_hash,session_expires_at FROM mio_level_accounts_v1'))return {rows:[{...state.account}]};
  if(sql.startsWith('SELECT invite_id,master_id,generation,device_thumbprint,session_hash,session_expires_at,status,expires_at FROM mio_level_pending_claims_v1'))return {rows:state.pending?[{...state.pending}]:[]};
  if(sql.startsWith('SELECT invite_id,master_id,generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,status,expires_at FROM mio_level_pending_claims_v1'))return {rows:state.pending?[{...state.pending}]:[]};
  if(sql.startsWith('INSERT INTO mio_level_pending_claims_v1')){
   const [invite_id,master_id,generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,expires_at]=args;
   state.pending={invite_id,master_id,generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,status:'pending',expires_at};return {rows:[]};
  }
  if(sql.startsWith('UPDATE mio_level_pending_claims_v1 SET generation=')){
   const [invite_id,generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,expires_at]=args;
   Object.assign(state.pending,{invite_id,generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,status:'pending',expires_at,activated_at:null});return {rows:[]};
  }
  if(sql.startsWith("UPDATE mio_level_invites_v1 SET status='claimed'")){
   if(state.invite.status!=='issued')return {rows:[]};state.invite.status='claimed';return {rows:[{invite_id:state.invite.invite_id}]};
  }
  if(sql.startsWith("UPDATE mio_level_accounts_v1 SET status='active'")){
   const [id,generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,level,member_until,issuer_id]=args;
   Object.assign(state.account,{master_id:id,status:'active',generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,level,member_until,issuer_id});return {rows:[{master_id:id}]};
  }
  if(sql.startsWith("UPDATE mio_level_pending_claims_v1 SET status='active'")){
   if(state.pending.status!=='pending')return {rows:[]};state.pending.status='active';state.pending.activated_at=now;return {rows:[{invite_id:state.pending.invite_id}]};
  }
  throw new Error('UNEXPECTED_QUERY:'+sql);
 };
 return {state,query,async connect(){return {query,release(){}}},code:issued.code};
}

function browser(){
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk=publicKey.export({format:'jwk'});
 const deviceProof={source:'server-verified-signature',fresh:true,
  fingerprint:'sha256:'+Buffer.from(`${jwk.x}.${jwk.y}`).toString('hex').slice(0,64).padEnd(64,'a'),publicJwk:jwk};
 return {privateKey,publicJwk:jwk,deviceProof};
}
async function call(api,clientId,body,cookies=''){
 return api({method:'POST',requestOrigin:'https://preview.example',contentType:'application/json',clientId,cookies,body});
}
async function challenge(api,clientId,who,action){
 const made=await call(api,clientId,{action:'challenge',name:name,code:who.code,publicJwk:who.publicJwk});
 const signature=signBytes('sha256',Buffer.from(made.body.message),{key:who.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
 return call(api,clientId,{action,name,code:who.code,id:made.body.id,signature,publicJwk:who.publicJwk,browser:'Safari',os:'iOS'},who.cookies||'');
}
function apiFor(db){
 const store=new Map(),limiter={allow:async()=>true};
 return createClaimApi({db,claimIssuedAccess,activatePendingAccess,store:{async put(x){store.set(x.id,x)},async take(id){const x=store.get(id);store.delete(id);return x}},limiter,
  origin:'https://preview.example',pepper,enabled:true,clock:()=>now.getTime()});
}

test('staging and lost replies preserve the old session until explicit activation',async()=>{
 const db=fakeDB(),api=apiFor(db),who={...browser(),code:db.code};
 const initial=db.state.account.session_hash;
 const staged=await challenge(api,'same-client',who,'claim');
 assert.equal(staged.status,200);assert.equal(staged.body.stage,'pending');
 assert.equal(db.state.invite.status,'issued');assert.equal(db.state.account.session_hash,initial);
 who.cookies=staged.headers['Set-Cookie'].split(';')[0];
 const retry=await challenge(api,'same-client',who,'claim');
 assert.equal(retry.body.stage,'pending');assert.equal(retry.headers['Set-Cookie'].split(';')[0],who.cookies);
 const activated=await challenge(api,'same-client',who,'activate');
 assert.equal(activated.body.ok,true);assert.equal(db.state.invite.status,'claimed');
 assert.notEqual(db.state.account.session_hash,initial);assert.equal(db.state.account.generation,1);
 assert.equal(db.state.pending.status,'active');
 const lostActivationRetry=await challenge(api,'same-client',who,'claim');
 assert.equal(lostActivationRetry.body.ok,true);assert.equal(lostActivationRetry.body.stage,undefined);
 assert.ok(lostActivationRetry.headers['Set-Cookie'].some(x=>x.startsWith('__Host-mio_vnext_session=')));
});

test('a different browser cannot take an unexpired pending claim and the old account remains active',async()=>{
 const db=fakeDB(),first={...browser(),code:db.code},second={...browser(),code:db.code};
 const api=apiFor(db),old=db.state.account.session_hash;
 const staged=await challenge(api,'one',first,'claim');first.cookies=staged.headers['Set-Cookie'].split(';')[0];
 const pendingDevice=db.state.pending.device_thumbprint;
 const attempt=await challenge(api,'two',second,'claim');
 assert.equal(attempt.status,400);assert.equal(db.state.account.session_hash,old);
 assert.equal(db.state.invite.status,'issued');assert.equal(db.state.pending.device_thumbprint,pendingDevice);
});
