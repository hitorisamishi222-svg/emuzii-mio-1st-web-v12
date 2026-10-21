import test from 'node:test';
import assert from 'node:assert/strict';
import {beginParticipantPasskeyRegistration,finishParticipantPasskeyRegistration,
  beginParticipantPasskeyAuthentication,finishParticipantPasskeyAuthentication} from '../participant-passkey-core-v204.js';
const mioId='MIO-0042',browserTokenHash='e'.repeat(64);
const challenge='mio-v204-webauthn-challenge-test-unique-token';
const response={id:'test-credential-aabbcc',response:{clientDataJSON:Buffer.from(JSON.stringify({challenge})).toString('base64url')}};
const pub=new Uint8Array([1,2,3]);
const authGood=async()=>({verified:true,authenticationInfo:{newCounter:1}});
const regGood=async()=>({verified:true,registrationInfo:{credential:{id:response.id,publicKey:pub,counter:0,transports:['internal']}}});
function state(){
  const s={accounts:new Map(),challenges:[],credentials:new Map(),calls:[],next:1,rejectVerify:false,
   consumed:[]};
  let snapshot;
  const sql=async(q,p=[])=>{
    s.calls.push({q,p});
    if(q==='BEGIN'){
      snapshot={accounts:new Map(s.accounts),challenges:s.challenges.map(x=>({...x})),credentials:new Map(s.credentials),next:s.next};
      return {rows:[],rowCount:0};
    }
    if(q==='COMMIT'){snapshot=null;return {rows:[],rowCount:0}}
    if(q==='ROLLBACK'){
      s.accounts=snapshot.accounts;s.challenges=snapshot.challenges;s.credentials=snapshot.credentials;s.next=snapshot.next;
      return {rows:[],rowCount:0};
    }
    if(q.startsWith('INSERT INTO mio_passkey_accounts_v204')){
      if(!s.accounts.has(p[0]))s.accounts.set(p[0],p[1]);return {rows:[],rowCount:1};
    }
    if(q.startsWith('SELECT user_handle')){
      const handle=s.accounts.get(p[0]);return {rows:handle?[{user_handle:handle}]:[],rowCount:handle?1:0};
    }
    if(q.startsWith('SELECT mio_id FROM mio_passkey_accounts_v204')){
      return {rows:s.accounts.has(p[0])?[{mio_id:p[0]}]:[],rowCount:s.accounts.has(p[0])?1:0};
    }
    if(q.startsWith('INSERT INTO mio_passkey_challenges_v204')){
      s.challenges.push({id:s.next++,mioId:p[0],session:p[1],hash:p[2],purpose:q.includes("'register'")?'register':'authenticate',used:false});
      return {rows:[],rowCount:1};
    }
    if(q.startsWith('SELECT id FROM mio_passkey_challenges_v204')){
      const purpose=q.includes("'register'")?'register':'authenticate';
      const x=s.challenges.find(x=>x.mioId===p[0]&&x.session===p[1]&&x.hash===p[2]&&x.purpose===purpose&&!x.used);
      return {rows:x?[{id:x.id}]:[],rowCount:x?1:0};
    }
    if(q.startsWith('UPDATE mio_passkey_challenges_v204')){
      const row=s.challenges.find(x=>x.id===p[0]&&!x.used);
      if(row)row.used=true;
      return {rows:row?[{id:row.id}]:[],rowCount:row?1:0};
    }
    if(q.startsWith('INSERT INTO mio_passkey_credentials_v204')){
      if(s.credentials.has(p[1]))return {rows:[],rowCount:0};
      s.credentials.set(p[1],{credential_id:p[1],mioId:p[0],public_key:p[2],sign_count:p[3],transports:p[4]});
      return {rows:[{credential_id:p[1]}],rowCount:1};
    }
    if(q.startsWith('SELECT credential_id,public_key')){
      const row=s.credentials.get(p[1]);
      return {rows:row&&row.mioId===p[0]?[row]:[],rowCount:row&&row.mioId===p[0]?1:0};
    }
    if(q.startsWith('UPDATE mio_passkey_credentials_v204')){
      s.credentials.get(p[2]).sign_count=Math.max(s.credentials.get(p[2]).sign_count,p[0]);
      return {rows:[],rowCount:1};
    }
    throw Error('Unhandled fake SQL '+q);
  };
  s.db={async connect(){return {query:sql,release(){}}}};
  s.webauthn={async generateRegistrationOptions(){return {challenge}},async verifyRegistrationResponse(){return regGood()},
    async generateAuthenticationOptions(){return {challenge}},async verifyAuthenticationResponse(){return authGood()}};
  return s;
}
const bootstrap=async({mioId})=>({mioId,method:'approved-device-pairing',userVerified:true,deviceApproved:true});
const input=()=>({mioId,browserTokenHash});
const context=s=>({db:s.db,webauthn:s.webauthn,rpID:'example.org',origin:'https://example.org',verifyBootstrap:bootstrap});
async function ready(s){await beginParticipantPasskeyRegistration(input(),context(s));await finishParticipantPasskeyRegistration({...input(),response},context(s));}
test('reject wrong MIO or invalid origin before DB',async()=>{
  const s=state();await assert.rejects(beginParticipantPasskeyRegistration({...input(),mioId:'MIO-W-1'},context(s)),/INVALID_MIO_ID/);
  await assert.rejects(beginParticipantPasskeyRegistration(input(),{...context(s),origin:'https://evil.org'}),/INVALID_RP/);
  assert.equal(s.calls.length,0);
});
test('registration cannot begin from name, IP or unverified device',async()=>{
  const s=state();await assert.rejects(beginParticipantPasskeyRegistration(input(),{...context(s),verifyBootstrap:async()=>({mioId,userVerified:true,deviceApproved:false,method:'approved-device-pairing'})}),/BOOTSTRAP_REJECTED/);
  await assert.rejects(beginParticipantPasskeyRegistration(input(),{...context(s),verifyBootstrap:async()=>({mioId,userVerified:true,deviceApproved:true,method:'name-and-ip'})}),/BOOTSTRAP_REJECTED/);
  assert.equal(s.calls.length,0);
});
test('strongly verified initial device can start challenge with opaque 32-byte handle',async()=>{
  const s=state();const o=await beginParticipantPasskeyRegistration(input(),context(s));
  assert.equal(o.options.challenge,challenge);assert.equal(s.accounts.get(mioId).length,32);
  assert.equal(s.challenges.length,1);assert.equal(s.challenges[0].purpose,'register');
});
test('successful passkey registration consumes challenge and persists only public key',async()=>{
  const s=state();await ready(s);
  assert.equal(s.challenges[0].used,true);assert.equal(s.credentials.get(response.id).mioId,mioId);
  assert.deepEqual([...s.credentials.get(response.id).public_key],[1,2,3]);
});
test('wrong browser session cannot finish challenge',async()=>{
  const s=state();await beginParticipantPasskeyRegistration(input(),context(s));
  await assert.rejects(finishParticipantPasskeyRegistration({...input(),browserTokenHash:'f'.repeat(64),response},context(s)),/CHALLENGE_EXPIRED_OR_USED/);
  assert.equal(s.credentials.size,0);
});
test('tampered WebAuthn proof does not consume challenge or save credential',async()=>{
  const s=state();await beginParticipantPasskeyRegistration(input(),context(s));
  s.webauthn.verifyRegistrationResponse=async()=>({verified:false});
  await assert.rejects(finishParticipantPasskeyRegistration({...input(),response},context(s)),/REGISTRATION_NOT_VERIFIED/);
  assert.equal(s.credentials.size,0);assert.equal(s.challenges[0].used,false);
});
test('reused registration challenge is rejected',async()=>{
  const s=state();await ready(s);
  await assert.rejects(finishParticipantPasskeyRegistration({...input(),response},context(s)),/CHALLENGE_EXPIRED_OR_USED/);
});
test('authentication produces one-time internal ownership proof after WebAuthn UV',async()=>{
  const s=state();await ready(s);const a=await beginParticipantPasskeyAuthentication(input(),context(s));
  assert.equal(a.options.challenge,challenge);
  const p=await finishParticipantPasskeyAuthentication({...input(),response},context(s));
  assert.deepEqual(p,{mioId,userVerified:true,challengeConsumed:true,method:'webauthn-uv'});
  assert.equal(s.credentials.get(response.id).sign_count,1);
  await assert.rejects(finishParticipantPasskeyAuthentication({...input(),response},context(s)),/CHALLENGE_EXPIRED_OR_USED/);
});
test('passkey from another MIO-ID never authenticates this person',async()=>{
  const s=state();await ready(s);await beginParticipantPasskeyAuthentication(input(),context(s));
  const other={...input(),mioId:'MIO-0007'};
  await assert.rejects(finishParticipantPasskeyAuthentication({...other,response},context(s)),/CHALLENGE_EXPIRED_OR_USED/);
});
test('invalid authenticator response cannot issue an internal proof',async()=>{
  const s=state();await ready(s);await beginParticipantPasskeyAuthentication(input(),context(s));
  s.webauthn.verifyAuthenticationResponse=async()=>({verified:false});
  await assert.rejects(finishParticipantPasskeyAuthentication({...input(),response},context(s)),/AUTHENTICATION_NOT_VERIFIED/);
  assert.equal(s.credentials.get(response.id).sign_count,0);
  assert.equal(s.challenges.at(-1).used,false);
});
