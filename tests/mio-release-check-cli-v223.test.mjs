import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const tool=fileURLToPath(new URL('../mio-release-check-v223.mjs',import.meta.url));
function call(...args){
  return spawnSync(process.execPath,[tool,...args],{encoding:'utf8',timeout:5000});
}
test('audit mode outputs a read-only report and exits successfully',()=>{
  const result=call('--audit');
  assert.equal(result.status,0);
  const report=JSON.parse(result.stdout);
  assert.equal(report.mode,'audit');
  assert.equal(report.canRelease,false);
  assert.equal(report.required,14);
  assert.equal(report.complete,0);
});
test('release mode blocks when production GAS and identity evidence is absent',()=>{
  const result=call('--release');
  assert.equal(result.status,1);
  const report=JSON.parse(result.stdout);
  assert.equal(report.canRelease,false);
  assert.ok(report.incomplete.includes('gasLiveDeploymentRead'));
  assert.ok(report.incomplete.includes('participantIdentityConflictsReviewed'));
  assert.match(result.stderr,/Release blocked/);
});
test('unknown argument fails without attempting deployment',()=>{
  const result=call('--deploy','--force');
  assert.equal(result.status,2);
  assert.match(result.stderr,/Usage:/);
  assert.equal(result.stdout,'');
});
test('default invocation is informational audit, not release',()=>{
  const result=call();
  assert.equal(result.status,0);
  assert.equal(JSON.parse(result.stdout).mode,'audit');
});
test('operator cannot forge evidence by environment variables',()=>{
  const result=spawnSync(process.execPath,[tool,'--release'],{
    encoding:'utf8',timeout:5000,
    env:{...process.env,gasLiveDeploymentRead:'true',manualReleaseApproval:'true'}
  });
  assert.equal(result.status,1);
});
