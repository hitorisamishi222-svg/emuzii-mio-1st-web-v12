import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const combined=readFileSync(
  new URL('../GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs',import.meta.url),'utf8');
const ORIGINAL_SHA256='d57f00969aad45099176d35f10e38dd5201c34918165f102d0f291e3f35bd2df';
const ORIGINAL_BYTES=38180;
const MODULE_START='// 2026-11-06: Web admin operations;';
const DISPATCH="    if(/^webAdminOps(?:Read|Member|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));\n";
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const functionNames=s=>[...s.matchAll(/^[ \t]*function[ \t]+([A-Za-z_$][\w$]*)\s*\(/gm)].map(x=>x[1]);
function splitIntegrated(){
 const start=combined.indexOf(MODULE_START);
 assert.ok(start>0,'existing October core must precede added operator module');
 assert.equal(combined.split(MODULE_START).length,2,'only one operator module marker');
 const prefix=combined.slice(0,start);
 assert.equal(prefix.split(DISPATCH).length,2,'only one route inserted into existing doPost');
 const restored=prefix.replace(DISPATCH,'').replace(/\n+$/,'\n');
 const module=combined.slice(start);
 return {prefix,restored,module};
}
test('Oct 6 recovery core byte-for-byte preserved after removing only admin route',()=>{
 const {restored}=splitIntegrated();
 assert.equal(Buffer.byteLength(restored,'utf8'),ORIGINAL_BYTES);
 assert.equal(sha(restored),ORIGINAL_SHA256);
 assert.match(restored,/mioAdminVerifiedTwoBrowser/);
 assert.doesNotMatch(restored,/webAdminOpsRead/);
});
test('route only after BRIDGE_SECRET and before participant identity guard, under ScriptLock',()=>{
 const {prefix}=splitIntegrated();
 const begin=prefix.indexOf('function doPost(');
 const end=prefix.indexOf('\nfunction ',begin+12);
 const body=prefix.slice(begin,end);
 const secret=body.indexOf("if(!secret||!equal_(d.secret,secret))");
 const route=body.indexOf(DISPATCH);
 const participant=body.indexOf("error:'invalid identity'");
 assert.ok(begin>=0&&secret>=0&&route>secret&&participant>route);
 assert.match(body,/LockService\.getScriptLock\s*\(/);
 assert.match(body,/finally\s*\{\s*lock\.releaseLock\s*\(/);
});
test('only 21 new operator functions are added, no duplicate existing core definitions',()=>{
 const {restored,module}=splitIntegrated();
 const coreNames=functionNames(restored);
 const operatorNames=functionNames(module);
 assert.equal(coreNames.length,41);
 assert.equal(operatorNames.length,21);
 assert.ok(operatorNames.every(n=>n.startsWith('mioAdminOps')));
 assert.equal(new Set([...coreNames,...operatorNames]).size,62);
 assert.equal(operatorNames.filter(n=>n==='mioAdminOps_').length,1);
 assert.equal(operatorNames.filter(n=>n==='mioAdminOpsRead_').length,1);
});
test('a changed recovery line or extra dispatcher would fail the preservation gate',()=>{
 const {prefix,restored}=splitIntegrated();
 assert.notEqual(sha(restored.replace('CHECKIN_MAX_ATTEMPTS = 2','CHECKIN_MAX_ATTEMPTS = 3')),ORIGINAL_SHA256);
 assert.notEqual(sha(restored+'// unrelated change\n'),ORIGINAL_SHA256);
 assert.equal((prefix+DISPATCH).split(DISPATCH).length,3);
});
