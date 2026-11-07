import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {auditGasTarget,KNOWN_LIVE_DEPLOYMENT_FINGERPRINT} from '../tools/mio-gas-connection-target-audit.mjs';

const fakeId='AKfycb_'+('a'.repeat(62));
const fakeUrl='https://script.google.com/macros/s/'+fakeId+'/exec';
const fingerprint=createHash('sha256').update(fakeId).digest('hex');
test('only a canonical exact-match web app deployment can satisfy the identity audit',()=>{
 const result=auditGasTarget(fakeUrl,fingerprint);
 assert.equal(result.ok,true);
 assert.equal(result.status,'KNOWN_DEPLOYMENT_ID_MATCH');
 assert.equal(result.versionVerified,false);
 assert.equal(result.sourceVerified,false);
 assert.equal(result.publicationAllowed,false,'never auto-publish based only on URL');
});
test('the fixed production fingerprint is a valid SHA256 digest, not a token',()=>{
 assert.match(KNOWN_LIVE_DEPLOYMENT_FINGERPRINT,/^[0-9a-f]{64}$/);
 assert.notEqual(KNOWN_LIVE_DEPLOYMENT_FINGERPRINT,fingerprint);
});
test('rejects a different deployment and refuses to leak the candidate ID',()=>{
 const result=auditGasTarget(fakeUrl,KNOWN_LIVE_DEPLOYMENT_FINGERPRINT);
 assert.equal(result.ok,false);
 assert.equal(result.reason,'DIFFERENT_DEPLOYMENT');
 assert.doesNotMatch(JSON.stringify(result),/AKfycb_/);
});
test('rejects lookalike hosts, http, credentials, query strings, and paths',()=>{
 const invalid=[
   'http://script.google.com/macros/s/'+fakeId+'/exec',
   'https://script.google.com.evil.example/macros/s/'+fakeId+'/exec',
   'https://evil.example/macros/s/'+fakeId+'/exec',
   'https://person:password@script.google.com/macros/s/'+fakeId+'/exec',
   fakeUrl+'?secret=not-a-real-key',
   fakeUrl+'#fragment',
   'https://script.google.com/macros/s/'+fakeId+'/dev',
   'https://script.google.com/home/projects/'+fakeId+'/edit',
   'https://script.google.com/macros/s/'+fakeId+'/exec/other',
   ' '+fakeUrl,
   fakeUrl+' '
 ];
 for(const candidate of invalid){
  const result=auditGasTarget(candidate,fingerprint);
  assert.equal(result.ok,false,'unsafe target must fail closed');
  assert.equal(result.publicationAllowed,false);
  assert.doesNotMatch(JSON.stringify(result),/password|not-a-real-key|AKfycb_/);
 }
});
test('fails closed on empty, invalid and non-web-app deployment values',()=>{
 for(const value of [null,undefined,{},'', 'not-a-url', 'https://script.google.com/']){
  const result=auditGasTarget(value,fingerprint);
  assert.equal(result.ok,false);
  assert.equal(result.status,'STOP');
 }
});
test('CLI with missing URL rejects and returns redacted fixed diagnostics only',()=>{
 const result=spawnSync(process.execPath,['tools/mio-gas-connection-target-audit.mjs'],{
  cwd:new URL('..',import.meta.url),env:{...process.env,APPS_SCRIPT_URL:''},encoding:'utf8'
 });
 assert.equal(result.status,1);
 assert.match(result.stdout,/"status":"STOP"/);
 assert.doesNotMatch(result.stdout,/script.google.com|AKfyc|secret|https/);
});
