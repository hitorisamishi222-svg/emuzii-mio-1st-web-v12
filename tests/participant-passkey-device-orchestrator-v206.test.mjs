import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPasskeyAndRunDeviceOperation} from '../participant-passkey-device-orchestrator-v206.js';

const mioId='MIO-0039',actorBrowserId='MIO-W-'+'1'.repeat(24);
const actorTokenHash='a'.repeat(64),browserId='MIO-W-'+'2'.repeat(24),tokenHash='b'.repeat(64);
const base={mioId,actorBrowserId,actorTokenHash,operation:'link-browser',browserId,tokenHash,response:{}};
const never={db:{connect(){throw Error('DB_SHOULD_NOT_BE_CALLED')}},webauthn:{},rpID:'example.org',origin:'https://example.org'};
test('reject invalid participant before accessing database',async()=>{
  await assert.rejects(verifyPasskeyAndRunDeviceOperation({...base,mioId:'bad'},never),/INVALID_OPERATION_CONTEXT/);
});
test('reject invalid actor identity before database access',async()=>{
  await assert.rejects(verifyPasskeyAndRunDeviceOperation({...base,actorBrowserId:'invalid'},never),/INVALID_OPERATION_CONTEXT/);
});
test('reject missing operation before database access',async()=>{
  await assert.rejects(verifyPasskeyAndRunDeviceOperation({...base,operation:'grant-gacha'},never),/INVALID_OPERATION_CONTEXT/);
});
test('reject invalid target before database access',async()=>{
  await assert.rejects(verifyPasskeyAndRunDeviceOperation({...base,browserId:'MIO-W-bad'},never),/INVALID_OPERATION_TARGET/);
});
test('reject invalid token before database access',async()=>{
  await assert.rejects(verifyPasskeyAndRunDeviceOperation({...base,tokenHash:'bad'},never),/INVALID_BROWSER_TOKEN/);
});
test('reject invalid revoke target before database access',async()=>{
  await assert.rejects(verifyPasskeyAndRunDeviceOperation({...base,operation:'revoke-browser',targetBrowserId:'bad'},never),/INVALID_OPERATION_TARGET/);
});
test('passkey verification failure does not reach grant issuance',async()=>{
  const context={...never,db:{connect(){return {query:async()=>({rows:[]}),release(){}}}}};
  await assert.rejects(verifyPasskeyAndRunDeviceOperation(base,context),/CHALLENGE_EXPIRED_OR_USED|INVALID_RESPONSE/);
});
