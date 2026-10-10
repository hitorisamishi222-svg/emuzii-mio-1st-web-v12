import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.4_BROWSER_PAIR.gs',import.meta.url),'utf8');
test('v1.9.4 GAS parses as valid JavaScript',()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
});
test('browser pairing uses a single-use claim and an expiration',()=>{
 assert.match(source,/d\.action==='pair_create'/);
 assert.match(source,/d\.action==='pair_claim'/);
 assert.match(source,/PAIR_TTL_MS=3\*60\*1000/);
 assert.match(source,/String\(record\[7\]\)!=='未使用'/);
 assert.match(source,/new Date\(record\[6\]\)\.getTime\(\)<=Date\.now\(\)/);
 assert.match(source,/approvedBrowserSource_\(ss,web/);
});
test('history remains bound to existing canonical MIO-ID',()=>{
 assert.match(source,/browserIdentityFor_\(ss,web,d\)/);
 assert.match(source,/origin\.id/);
 assert.match(source,/integratedParticipantId:origin\.id/);
 assert.doesNotMatch(source,/if\(!submittedLoginId&&safeBase\)/);
});
const create=readFileSync(new URL('../api-browser-pair-create.js',import.meta.url),'utf8');
const claim=readFileSync(new URL('../api-browser-pair-claim.js',import.meta.url),'utf8');
test('server API uses signed sessions and random link secrets',()=>{
 assert.match(create,/randomBytes\(32\)/);
 assert.match(create,/readSession\(/);
 assert.match(create,/pair_create/);
 assert.match(claim,/makeIdentity\(/);
 assert.match(claim,/pair_claim/);
 assert.match(claim,/sessionCookie\(/);
});
