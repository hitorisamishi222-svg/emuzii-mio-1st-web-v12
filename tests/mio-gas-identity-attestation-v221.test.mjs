/**
 * Staging-only v2.2.1 strict identity compatibility tests.
 * Synthetic identities only, never user records.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../gas/mio-identity-attestation-v221.gs',import.meta.url),'utf8');
const ctx=vm.createContext({});
vm.runInContext(source,ctx,{filename:'mio-identity-attestation-v221.gs',timeout:1500});
const attest=ctx.mioIdentityAttestationV221_;
const plain=x=>JSON.parse(JSON.stringify(x));
const id='MIO-W-'+'a'.repeat(24),token='b'.repeat(64),mio='MIO-0042';
const denied={integratedParticipantId:'',identityLinked:false,attendanceLinked:false,deviceActive:false};
function fixture(webName='歌 ねこ',participantName=webName,attendanceName=participantName){
  const row=Array(21).fill('');
  row[0]=id;row[1]=token;row[2]=webName;row[5]='承認済み';
  row[7]=mio;row[10]=mio;row[11]='確認済み';row[15]=mio;row[16]='使用中';
  return {web:[row],people:[[mio,participantName]],att:[[mio,attendanceName]]};
}
function check(f){
  return plain(attest(id,token,f.web,f.people,f.att));
}
function expectDeny(label,edit){
  test(label,()=>{
    const f=fixture();edit(f);
    assert.deepEqual(check(f),denied);
  });
}
test('strict consistent participant records are accepted without mutation',()=>{
 const f=fixture(),before=JSON.stringify(f);
 assert.deepEqual(check(f),{integratedParticipantId:mio,identityLinked:true,attendanceLinked:true,deviceActive:true});
 assert.equal(JSON.stringify(f),before);
});
test('leading and trailing spaces only are tolerated in both ledgers',()=>{
 const f=fixture('ねこ',' ねこ ','ねこ  ');
 assert.equal(check(f).identityLinked,true);
});
test('the single leading-space discrepancy is accepted with all MIO IDs equal',()=>{
 const f=fixture('歌 猫',' 歌 猫','  歌 猫');
 assert.equal(check(f).identityLinked,true);
});
test('middle spaces must not be silently removed',()=>{
 const f=fixture('歌ねこ','歌 ねこ','歌ねこ');
 assert.deepEqual(check(f),denied);
});
test('NFKC/fuzzy equivalence is NOT treated as ownership proof',()=>{
 const f=fixture('ｶﾀｶﾅ','カタカナ','カタカナ');
 assert.deepEqual(check(f),denied);
});
test('same name on another MIO-ID cannot link',()=>{
 const f=fixture();
 f.people[0][0]='MIO-0099';
 assert.deepEqual(check(f),denied);
});
test('recovery destination P unequal H is blocked pending administrator verification',()=>{
 const f=fixture();
 f.web[0][15]='MIO-0099';
 assert.deepEqual(check(f),denied);
});
expectDeny('H and K mismatch is blocked',f=>f.web[0][10]='MIO-0099');
expectDeny('no confirmation remains blocked',f=>f.web[0][11]='確認待ち');
expectDeny('retired browser remains blocked',f=>f.web[0][16]='旧端末');
expectDeny('pending registration remains blocked',f=>f.web[0][5]='承認待ち');
expectDeny('duplicated Web browser ID remains blocked',f=>f.web.push([...f.web[0]]));
expectDeny('duplicated person ID remains blocked',f=>f.people.push([mio,'歌 ねこ']));
expectDeny('duplicated attendance ID remains blocked',f=>f.att.push([mio,'歌 ねこ']));
expectDeny('missing roster remains blocked',f=>f.people=[]);
expectDeny('missing attendance remains blocked',f=>f.att=[]);
expectDeny('blank registered name remains blocked',f=>f.web[0][2]=' ');
expectDeny('empty token hash remains blocked',f=>f.web[0][1]='');
test('wrong signed browser token is rejected',()=>{
 const f=fixture();
 assert.deepEqual(plain(attest(id,'c'.repeat(64),f.web,f.people,f.att)),denied);
});
test('helper performs no Apps Script IO or writes',()=>{
 assert.ok(!/SpreadsheetApp|PropertiesService|LockService|setValue\s*\(|setValues\s*\(/.test(
   source.slice(source.indexOf('function mioIdentityAttestationV221_'))
 ));
});
