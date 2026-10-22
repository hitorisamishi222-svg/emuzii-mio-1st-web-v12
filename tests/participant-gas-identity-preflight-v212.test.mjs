import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionCookie,hash} from '../bridge.js';
import {
  requireGasIdentityAttestation,createGasIdentitySessionResolver
} from '../participant-gas-identity-preflight-v212.js';

const webId='MIO-W-'+'a'.repeat(24),token='b'.repeat(64);
const secret='s'.repeat(64),mioId='MIO-0042';
const fullStatus={
  ok:true,participantId:webId,status:'承認済み',
  integratedParticipantId:mioId,identityLinked:true,
  attendanceLinked:true,deviceActive:true
};
function fixture({cookie=sessionCookie(webId,token,secret),status=fullStatus}={}){
  const calls=[];
  const resolve=createGasIdentitySessionResolver({
    getCookieHeader:async()=>cookie,sessionSecret:secret,
    statusRequest:async(action,payload)=>{
      calls.push({action,payload});
      return status;
    }
  });
  return {resolve,calls};
}

test('server-verified GAS ID maps an approved browser to exactly one MIO-ID',async()=>{
  const {resolve,calls}=fixture();
  const r=await resolve();
  assert.deepEqual(r,{mioId,browserId:webId,tokenHash:hash(token),active:true});
  assert.deepEqual(calls,[{action:'identity_attestation',payload:{participantId:webId,tokenHash:hash(token)}}]);
});
test('missing signed session never reaches GAS',async()=>{
  const {resolve,calls}=fixture({cookie:''});
  await assert.rejects(resolve(),/SESSION_NOT_VERIFIED/);
  assert.equal(calls.length,0);
});
test('modified session signature rejected before GAS',async()=>{
  const signed=sessionCookie(webId,token,secret);
  const {resolve,calls}=fixture({cookie:signed.replace('mio_session=','mio_session=x')});
  await assert.rejects(resolve(),/SESSION_NOT_VERIFIED/);
  assert.equal(calls.length,0);
});
test('GAS result must be successful and be for exact browser ID',()=>{
  assert.throws(()=>requireGasIdentityAttestation({...fullStatus,participantId:'MIO-W-'+'c'.repeat(24)},webId),/GAS_APPROVAL_NOT_VERIFIED/);
  assert.throws(()=>requireGasIdentityAttestation({...fullStatus,ok:false},webId),/GAS_APPROVAL_NOT_VERIFIED/);
});
test('unapproved person is never granted participant identity',()=>{
  assert.throws(()=>requireGasIdentityAttestation({...fullStatus,status:'承認待ち'},webId),/GAS_APPROVAL_NOT_VERIFIED/);
});
test('missing linked MIO-ID is denied',()=>{
  assert.throws(()=>requireGasIdentityAttestation({...fullStatus,integratedParticipantId:''},webId),/GAS_MIO_LINK_NOT_VERIFIED/);
});
test('GAS v1.9.1-style status lacking explicit proof fields fails closed',()=>{
  const legacy={ok:true,participantId:webId,name:'翠央',status:'承認済み',progress:{}};
  assert.throws(()=>requireGasIdentityAttestation(legacy,webId),/GAS_MIO_LINK_NOT_VERIFIED/);
});
test('same name or same IP do not substitute account link evidence',()=>{
  const weak={...fullStatus,identityLinked:false,name:'翠央',ipMatch:true,userAgentMatch:true};
  assert.throws(()=>requireGasIdentityAttestation(weak,webId),/GAS_MIO_LINK_NOT_VERIFIED/);
});
test('attendance proof is independently required',()=>{
  assert.throws(()=>requireGasIdentityAttestation({...fullStatus,attendanceLinked:false},webId),/GAS_MIO_LINK_NOT_VERIFIED/);
});
test('revoked device fails even if MIO-ID is linked and attendance is ready',()=>{
  assert.throws(()=>requireGasIdentityAttestation({...fullStatus,deviceActive:false},webId),/GAS_DEVICE_NOT_VERIFIED/);
});
test('missing explicit active-device attestation fails closed',()=>{
  const {deviceActive,...status}=fullStatus;
  assert.throws(()=>requireGasIdentityAttestation(status,webId),/GAS_DEVICE_NOT_VERIFIED/);
});
test('missing trusted session secret or request accessor cannot construct resolver',()=>{
  assert.throws(()=>createGasIdentitySessionResolver({}),/GAS_RESOLVER_NOT_CONFIGURED/);
  assert.throws(()=>createGasIdentitySessionResolver({getCookieHeader:()=>'',sessionSecret:'short'}),/GAS_RESOLVER_NOT_CONFIGURED/);
});
