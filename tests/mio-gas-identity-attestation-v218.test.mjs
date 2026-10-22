/**
 * Isolated unit tests for the pure GAS identity-consistency helper.
 * This does not test live Apps Script deployments or administrator approvals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../gas/mio-identity-attestation-v218.gs',import.meta.url),'utf8');
const sandbox=vm.createContext({});
vm.runInContext(source,sandbox,{filename:'mio-identity-attestation-v218.gs',timeout:1000});
const attest=sandbox.mioIdentityAttestationV218_;
assert.equal(typeof attest,'function');

const webId='MIO-W-'+'a'.repeat(24),tokenHash='b'.repeat(64);
const mioId='MIO-0042',name='翠央';
const denied={
  integratedParticipantId:'',
  identityLinked:false,attendanceLinked:false,deviceActive:false
};
function rows(){
  const web=Array(21).fill('');
  web[0]=webId;web[1]=tokenHash;web[2]=name;
  web[5]='承認済み';web[7]=mioId;web[10]=mioId;web[11]='確認済み';
  web[15]=mioId;web[16]='使用中';
  const participant=[mioId,name,''];
  const attendance=[mioId,name,''];
  return {webRows:[web],peopleRows:[participant],attendanceRows:[attendance]};
}
const plain=x=>JSON.parse(JSON.stringify(x));
const go=x=>plain(attest(webId,tokenHash,x.webRows,x.peopleRows,x.attendanceRows));
function rejectCase(label,modify){
  test(label,()=>{
    const x=rows();modify(x);
    assert.deepEqual(go(x),denied);
  });
}
test('explicitly verified and approved rows yield four read-only consistency fields',()=>{
  const x=rows();const before=JSON.stringify(x);
  assert.deepEqual(go(x),{
    integratedParticipantId:mioId,
    identityLinked:true,attendanceLinked:true,deviceActive:true
  });
  assert.equal(JSON.stringify(x),before);
});
rejectCase('unapproved web registration is denied',x=>x.webRows[0][5]='承認待ち');
rejectCase('rejected web registration is denied',x=>x.webRows[0][5]='却下');
rejectCase('confirmation is required',x=>x.webRows[0][11]='確認待ち');
rejectCase('explicit active-device flag is required',x=>x.webRows[0][16]='');
rejectCase('former device is not accepted',x=>x.webRows[0][16]='旧端末');
rejectCase('mismatched linked MIO-ID H is denied',x=>x.webRows[0][7]='MIO-0043');
rejectCase('mismatched linked MIO-ID K is denied',x=>x.webRows[0][10]='MIO-0043');
rejectCase('mismatched linked MIO-ID P is denied',x=>x.webRows[0][15]='MIO-0043');
rejectCase('duplicate browser ID is denied even with matching approved row',x=>x.webRows.push([...x.webRows[0]]));
rejectCase('duplicated participant MIO-ID is denied',x=>x.peopleRows.push([mioId,name]));
rejectCase('duplicated attendance MIO-ID is denied',x=>x.attendanceRows.push([mioId,name]));
rejectCase('wrong participant name is denied',x=>x.peopleRows[0][1]='他人');
rejectCase('wrong attendance name is denied',x=>x.attendanceRows[0][1]='他人');
rejectCase('same name but different participant ID is not proof',x=>x.peopleRows[0][0]='MIO-0098');
rejectCase('same name but different attendance ID is not proof',x=>x.attendanceRows[0][0]='MIO-0098');
rejectCase('missing participant row is denied',x=>x.peopleRows=[]);
rejectCase('missing attendance row is denied',x=>x.attendanceRows=[]);
rejectCase('missing web row is denied',x=>x.webRows=[]);
rejectCase('blank registration name is denied',x=>x.webRows[0][2]='');
rejectCase('noncanonical MIO-ID is denied',x=>{x.webRows[0][7]='MIO-INVALID';x.webRows[0][10]='MIO-INVALID';x.webRows[0][15]='MIO-INVALID'});
rejectCase('token hash mismatch is denied',x=>x.webRows[0][1]='c'.repeat(64));
test('invalid caller browser ID and token hash are denied',()=>{
  const x=rows();
  assert.deepEqual(plain(attest('bad',tokenHash,x.webRows,x.peopleRows,x.attendanceRows)),denied);
  assert.deepEqual(plain(attest(webId,'bad',x.webRows,x.peopleRows,x.attendanceRows)),denied);
});
test('missing or nonarray ledgers are denied',()=>{
  assert.deepEqual(plain(attest(webId,tokenHash,null,[],[])),denied);
  assert.deepEqual(plain(attest(webId,tokenHash,[],null,[])),denied);
  assert.deepEqual(plain(attest(webId,tokenHash,[],[],null)),denied);
});
