import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {CUTOVER_CHECKS,inspectMioCutover,simulateMioTransfer} from '../mio-issued-cutover-guard.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>readFileSync(join(root,file),'utf8');
const qualified={masterId:'MIO-0017',source:'server-verified',scope:'single-participant',
 checks:Object.fromEntries(CUTOVER_CHECKS.map(k=>[k,true]))};
const legacy={masterId:'MIO-0017',devices:['old-iphone','old-android'],gachaRemaining:2,
 gachaHistory:[{drawing:'historical',prize:'unchanged'}],attendanceHistory:[{month:'2026-10',days:31}]};
const proposed={masterId:'MIO-0017',deviceId:'new-iphone',generation:3};

test('bulk transition and untrusted client approval are always denied',()=>{
 assert.equal(inspectMioCutover({...qualified,scope:'all-participants'}).reason,'NO_BULK_CUTOVER');
 assert.equal(inspectMioCutover({...qualified,source:'client-claimed'}).reason,'TRUSTED_SERVER_PROOF_REQUIRED');
 assert.equal(inspectMioCutover({...qualified,masterId:'MIO-W-bogus'}).state,'HOLD');
});

test('every legacy and gacha/attendance checkpoint is needed before even manual review',()=>{
 for(const key of CUTOVER_CHECKS){
  const r=inspectMioCutover({...qualified,checks:{...qualified.checks,[key]:false}});
  assert.equal(r.state,'HOLD',key);assert.ok(r.missing.includes(key));
 }
 assert.equal(inspectMioCutover(qualified).state,'READY_FOR_MANUAL_RELEASE_REVIEW');
});

test('a failed prerequisite never simulates revoking a current member device',()=>{
 const r=simulateMioTransfer({legacy,proposed,readiness:{...qualified,checks:{...qualified.checks,pr94RecoveryCompatible:false}}});
 assert.equal(r.state,'HOLD');assert.ok(!r.after);
});

test('single-participant mock transfer keeps existing IDs, gacha draws, count and attendance',()=>{
 const r=simulateMioTransfer({legacy,proposed,readiness:qualified});
 assert.equal(r.state,'SIMULATED');
 assert.deepEqual(r.after.activeDevices,['new-iphone']);
 assert.deepEqual(r.after.deniedOldDevices,['old-iphone','old-android']);
 assert.equal(r.after.gachaRemaining,2);
 assert.equal(r.after.masterId,'MIO-0017');
 assert.deepEqual(r.after.gachaHistory,legacy.gachaHistory);
 assert.deepEqual(r.after.attendanceHistory,legacy.attendanceHistory);
 assert.equal(r.rollback.restoreRevokedSessions,false);
 assert.equal(r.rollback.strategy,'halt-new-claims-and-owner-reissue');
});

test('simulation never mutates original participant or GAS-linked data',()=>{
 const before=structuredClone(legacy);
 const r=simulateMioTransfer({legacy,proposed,readiness:qualified});
 r.after.gachaHistory[0].prize='local projection only';
 assert.deepEqual(legacy,before);
});

test('unknown ID, empty device or absent gacha history cannot transfer',()=>{
 assert.equal(simulateMioTransfer({legacy,proposed:{...proposed,masterId:'MIO-0020'},readiness:qualified}).reason,'ID_MISMATCH');
 assert.equal(simulateMioTransfer({legacy,proposed:{...proposed,deviceId:''},readiness:qualified}).reason,'DEVICE_REQUIRED');
 assert.equal(simulateMioTransfer({legacy:{...legacy,gachaHistory:null},proposed,readiness:qualified}).reason,'ENTITLEMENTS_REQUIRED');
});

test('isolated schema defines exactly five dedicated tables and necessary device/challenge columns',()=>{
 const sql=read('release-prep/mio-issued-id-schema-v1.sql').replace(/^--.*$/gm,'');
 const tables=[...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_0-9]+)\s*\(/gi)].map(x=>x[1]);
 assert.deepEqual(tables,[
  'mio_access_issuers_v1','mio_access_accounts_v1','mio_access_invites_v1',
  'mio_access_audit_v1','mio_access_challenges_v1'
 ]);
 assert.equal((sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS/g)||[]).length,1);
 assert.equal((sql.match(/;/g)||[]).length,6);
 for(const c of ['bound_device_thumbprint','bound_session_hash','bound_room',
     'device_public_jwk','session_hash','used_at','generation'])
   assert.ok(sql.includes(c),c);
 assert.doesNotMatch(sql,/\b(?:ALTER|DROP|TRUNCATE|DELETE|UPDATE|INSERT)\s+(?:TABLE|FROM|INTO|mio_)/i);
 // Structural smoke test. This is NOT a PostgreSQL syntax execution test.
 let depth=0,quoted=false;
 for(let i=0;i<sql.length;i++){
  const ch=sql[i];
  if(ch==="'"){if(quoted&&sql[i+1]==="'"){i++;continue}quoted=!quoted}
  else if(!quoted&&ch==='(')depth++;
  else if(!quoted&&ch===')')depth--;
  assert.ok(depth>=0,'closed an unopened parenthesis');
 }
 assert.equal(depth,0,'unclosed DDL parentheses');
 assert.equal(quoted,false,'unterminated SQL quote');
});

test('legacy registration, gacha and attendance stay outside the vNext preview API',()=>{
 const entrypoints=['api-register.js','api-status.js','api-checkin.js','api-gacha.js',
   'api-enroll-lite.js','bridge.js'];
 for(const name of entrypoints)
   assert.doesNotMatch(read(name),/mio-issued-(?:id|device|cutover|vnext)/,name);
 const routes=JSON.parse(read('vercel.json'));
 const paths=routes.routes.map(r=>r.src);
 assert.ok(paths.includes('/mio-issued-vnext-preview.html'));
 assert.equal(paths.some(p=>p.startsWith('/api/mio-issued')),false);
 const preview=routes.routes.find(r=>r.src==='/mio-issued-vnext-preview.html');
 assert.match(preview.headers['X-Robots-Tag'],/noindex/);
});
