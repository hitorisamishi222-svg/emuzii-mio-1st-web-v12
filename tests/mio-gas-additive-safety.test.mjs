import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const full=source('GAS_Code_FULL_WEB_OPS_20261030.gs');
const additive=source('GAS_WebAdminOps_20261030.gs');

function names(text){
 return [...text.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]);
}
function assessAdditiveGAS(liveText,moduleText){
 const present=new Set(names(liveText));
 const proposed=names(moduleText);
 return {
  alreadyDispatched:/if\s*\(\s*\/\^webAdminOps/.test(liveText),
  duplicateFunctions:proposed.filter(x=>present.has(x)),
  proposedFunctions:proposed.length
 };
}
test('GitHub-integrated source is not proof of the live Apps Script deployment',()=>{
 const x=assessAdditiveGAS(full,additive);
 assert.equal(x.proposedFunctions,21);
 assert.equal(x.duplicateFunctions.length,19);
 assert.equal(x.duplicateFunctions.length,19);
 assert.equal(x.alreadyDispatched,true);
 // STOP: adding this file to a GAS project already running the integrated
 // source would redeclare every function. Never automatically install.
});
test('minimal standalone GAS candidate has exactly one definition per helper and no doPost',()=>{
 const proposed=names(additive);
 assert.equal(new Set(proposed).size,proposed.length);
 assert.equal(proposed.length,21);
 assert.ok(proposed.includes('mioAdminOpsDrawLookup_'));
 assert.ok(proposed.includes('mioAdminOpsRecoveryProof_'));
 assert.equal(proposed.includes('doPost'),false);
 assert.match(additive,/function mioAdminOps_/);
});
test('integrated doPost verifies bridge secret before management action dispatcher',()=>{
 const post=full.indexOf('function doPost(e)');
 const secret=full.indexOf('if(!secret||!equal_(d.secret,secret))',post);
 const dispatch=full.indexOf('if(/^webAdminOps',post);
 const identity=full.indexOf('if(!/^MIO-W-',post);
 assert.ok(post>=0&&secret>post&&dispatch>secret&&identity>dispatch);
 assert.match(full.slice(post,secret),/getScriptLock/);
});
test('when live source already includes management operations do not recommend appending duplicate source',()=>{
 const x=assessAdditiveGAS(full,additive);
 const requiresStop=x.alreadyDispatched||x.duplicateFunctions.length>0;
 assert.equal(requiresStop,true);
 const empty=assessAdditiveGAS('function doPost(e){}',additive);
 assert.equal(empty.duplicateFunctions.length,0);
 assert.equal(empty.alreadyDispatched,false);
});
