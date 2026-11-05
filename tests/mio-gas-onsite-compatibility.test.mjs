import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const full = load('GAS_Code_FULL_WEB_OPS_20261030.gs');
const moduleOnly = load('GAS_WebAdminOps_20261030.gs');
const oldGate = load('GAS_WebGateOnly_20261030.gs');
const defs = src => [...src.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(x => x[1]);

test('full GAS candidate has one doPost and one administrative dispatcher',()=>{
  const names=defs(full);
  assert.equal(names.filter(x=>x==='doPost').length,1);
  assert.equal(names.filter(x=>x==='mioAdminOps_').length,1);
  assert.equal(new Set(names).size,names.length,'GAS candidate cannot overwrite global functions by duplicate definitions');
});

test('standalone admin module is an exact copy, NEVER append to integrated candidate',()=>{
  const fullNames=new Set(defs(full));
  const partNames=defs(moduleOnly);
  const overlap=partNames.filter(x=>fullNames.has(x));
  assert.equal(partNames.length,19,'audit function inventory before GAS changes');
  assert.equal(overlap.length,19,'all 19 functions already included in integrated candidate');
  const first='function mioAdminOps_(ss,d){';
  assert.equal(full.slice(full.indexOf(first)).trimEnd(),
    moduleOnly.slice(moduleOnly.indexOf(first)).trimEnd(),
    'admin module must remain exactly matched to integrated candidate; never deploy both');
  assert.equal(defs(moduleOnly).includes('doPost'),false,'module must not replace existing doPost');
  assert.equal(defs(oldGate).includes('doPost'),false,'gate helper must not replace existing doPost');
});

test('admin dispatch runs only AFTER shared-secret verification and BEFORE participant identity check',()=>{
  const begin=full.indexOf('function doPost(e)');
  const secret=full.indexOf("if(!secret||!equal_(d.secret,secret))",begin);
  const gate=full.indexOf("if(d.action==='webGateRead'||d.action==='webGateSet')",begin);
  const admin=full.indexOf("if(/^webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)$/.test(d.action))",begin);
  const identity=full.indexOf("if(!/^MIO-W-[a-f0-9]{24}$/.test(d.participantId",begin);
  assert.ok(begin>=0&&secret>begin&&gate>secret&&admin>gate&&identity>admin,
    'an ops dispatcher in the wrong place would bypass authentication or reject all admin reads');
  assert.match(full.slice(begin,identity),/LockService\.getScriptLock\(\)/);
  assert.match(full.slice(begin,identity),/mioAdminOps_\(SpreadsheetApp\.openById\(SHEET_ID\),d\)/);
});

test('operator API never passes an unverified onsite request to the existing GAS',()=>{
  const api=load('api-gacha-admin-ops.js');
  assert.match(api,/authorizedCode\(d\.code/);
  assert.match(api,/sessionOK\(req\)/);
  assert.match(api,/MIO_GACHA_ONSITE_RELEASE/);
  assert.match(api,/d\.onSiteVerified!==true/);
  assert.match(api,/d\.action!=='read'&&!writeEnabled/);
  assert.match(api,/bridge\(operations\[d\.action\],data\)/);
});
