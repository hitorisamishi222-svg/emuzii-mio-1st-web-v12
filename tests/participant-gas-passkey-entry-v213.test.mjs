import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sessionCookie,hash} from '../bridge.js';
import {createStagedGasPasskeyRegistration} from '../participant-gas-passkey-entry-v213.js';

const webId='MIO-W-'+'a'.repeat(24),token='b'.repeat(64);
const secret='s'.repeat(64),mioId='MIO-0042';
const challenge='sample-passkey-challenge-0123456789012345';
const validStatus={
  ok:true,participantId:webId,status:'承認済み',integratedParticipantId:mioId,
  identityLinked:true,attendanceLinked:true,deviceActive:true
};
function fixture(overrides={}){
  const status={...validStatus,...overrides.status};
  const row={mio_id:mioId,browser_id:webId,token_hash:hash(token),status:'active',...overrides.row};
  const state={gasCalls:0,dbCalls:[],bootstrap:0,generated:0,verified:0,credentials:0,
    savedChallenge:false,used:false};
  const expectedHash=createHash('sha256').update(challenge).digest('hex');
  const db={async connect(){return {
    async query(sql,args=[]){
      state.dbCalls.push(sql);
      if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rowCount:0,rows:[]};
      if(sql.includes('FROM mio_browser_links_v204'))
        return {rowCount:1,rows:[row]};
      if(sql.includes('INSERT INTO mio_passkey_accounts_v204'))
        return {rowCount:1,rows:[]};
      if(sql.includes('SELECT user_handle FROM mio_passkey_accounts_v204'))
        return {rowCount:1,rows:[{user_handle:Buffer.alloc(32)}]};
      if(sql.includes('INSERT INTO mio_passkey_challenges_v204')){
        state.savedChallenge=true;
        assert.equal(args[2],expectedHash);
        return {rowCount:1,rows:[]};
      }
      if(sql.includes('SELECT id FROM mio_passkey_challenges_v204'))
        return {rowCount:state.savedChallenge&&!state.used?1:0,rows:state.savedChallenge&&!state.used?[{id:1}]:[]};
      if(sql.includes('UPDATE mio_passkey_challenges_v204')){
        state.used=true;return {rowCount:1,rows:[{id:1}]};
      }
      if(sql.includes('INSERT INTO mio_passkey_credentials_v204')){
        state.credentials++;return {rowCount:1,rows:[{credential_id:args[1]}]};
      }
      throw Error('UNEXPECTED_SQL: '+sql);
    },release(){}
  }}};
  const webauthn={
    async generateRegistrationOptions(){state.generated++;return {challenge}},
    async verifyRegistrationResponse(){
      state.verified++;
      return {verified:true,registrationInfo:{credential:{
        id:'credential-test-123456789',
        publicKey:new Uint8Array([1,2,3,4]),counter:0,transports:['internal']
      }}};
    }
  };
  const server=createStagedGasPasskeyRegistration({
    db,getCookieHeader:async()=>overrides.cookie===undefined?
      sessionCookie(webId,token,secret):overrides.cookie,
    sessionSecret:secret,verifyStepUp:async({mioId,browserId,tokenHash})=>{
      state.bootstrap++;
      return {mioId,browserId,tokenHash,userVerified:overrides.unverified!==true,
        consumed:true,method:'approved-device-pairing'};
    },
    statusRequest:async(action,payload)=>{
      state.gasCalls++;
      assert.equal(action,'status');
      assert.deepEqual(payload,{participantId:webId,tokenHash:hash(token)});
      return status;
    },
    webauthn,rpID:'mio-staging.test',origin:'https://mio-staging.test'
  });
  return {server,state};
}
const response={id:'credential-test-123456789',
  response:{clientDataJSON:Buffer.from(JSON.stringify({challenge})).toString('base64url')}};

test('trusted GAS approval and new device step-up allow challenge start',async()=>{
  const {server,state}=fixture();
  const r=await server.begin();
  assert.equal(r.options.challenge,challenge);
  assert.equal(state.gasCalls,1);assert.equal(state.bootstrap,1);
  assert.equal(state.generated,1);
});
test('legacy GAS status lacking account and active-device proof fails before DB',async()=>{
  const {server,state}=fixture({status:{
    integratedParticipantId:undefined,identityLinked:undefined,
    attendanceLinked:undefined,deviceActive:undefined
  }});
  await assert.rejects(server.begin(),/GAS_MIO_LINK_NOT_VERIFIED/);
  assert.equal(state.bootstrap,0);assert.equal(state.dbCalls.length,0);
});
test('GAS approval must match signed browser identity exactly',async()=>{
  const {server,state}=fixture({status:{participantId:'MIO-W-'+'c'.repeat(24)}});
  await assert.rejects(server.begin(),/GAS_APPROVAL_NOT_VERIFIED/);
  assert.equal(state.bootstrap,0);
});
test('a revoked GAS device cannot register a passkey',async()=>{
  const {server,state}=fixture({status:{deviceActive:false}});
  await assert.rejects(server.begin(),/GAS_DEVICE_NOT_VERIFIED/);
  assert.equal(state.dbCalls.length,0);
});
test('name and matching IP do not replace identity-link proof',async()=>{
  const {server,state}=fixture({status:{identityLinked:false,name:'翠央',ipMatch:true}});
  await assert.rejects(server.begin(),/GAS_MIO_LINK_NOT_VERIFIED/);
  assert.equal(state.generated,0);
});
test('a forged or missing signed browser cookie cannot invoke GAS',async()=>{
  const {server,state}=fixture({cookie:'mio_session=attacker'});
  await assert.rejects(server.begin(),/SESSION_NOT_VERIFIED/);
  assert.equal(state.gasCalls,0);
});
test('no fresh step-up means no WebAuthn challenge is generated',async()=>{
  const {server,state}=fixture({unverified:true});
  await assert.rejects(server.begin(),/STEP_UP_REQUIRED/);
  assert.equal(state.generated,0);
});
test('valid isolated challenge can be finished once without writing GAS',async()=>{
  const {server,state}=fixture();
  await server.begin();
  const r=await server.finish(response);
  assert.deepEqual(r,{registered:true,mioId});
  assert.equal(state.gasCalls,2);
  assert.equal(state.bootstrap,2);
  assert.equal(state.credentials,1);
  await assert.rejects(server.finish(response),/CHALLENGE_EXPIRED_OR_USED/);
  assert.equal(state.credentials,1);
});
test('missing trusted dependencies cannot create an entrypoint',()=>{
  assert.throws(()=>createStagedGasPasskeyRegistration({}),/STAGING_TRUSTED_DEPENDENCIES_REQUIRED/);
});
