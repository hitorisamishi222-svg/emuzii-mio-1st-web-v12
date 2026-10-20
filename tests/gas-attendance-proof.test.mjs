import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../gas/attendance-proof-v202.gs',import.meta.url),'utf8');
const proof=runInNewContext(src+'\nmioAttendanceProofV202_;');
const web=Array(21).fill('');
web[0]='MIO-W-0123456789abcdef01234567';
web[2]='SINGER';web[5]='承認済み';web[7]='MIO-0008';web[10]='MIO-0008';web[11]='確認済み';
const person=['MIO-0008','SINGER'],att=['MIO-0008','SINGER'];
test('approved, independently linked MIO-ID and unique attendance row pass',()=>{
 const result=proof(web,[person],[att]);
 assert.equal(result.attendanceLinked,true);
 assert.equal(result.integratedParticipantId,'MIO-0008');
});
test('pending and rejected registration cannot claim attendance',()=>{
 for(const s of ['承認待ち','却下']){
  const row=[...web];row[5]=s;
  assert.equal(proof(row,[person],[att]).attendanceLinked,false);
 }
});
test('missing admin confirmation or mismatched integrated MIO ID is denied',()=>{
 const a=[...web];a[11]='確認待ち';assert.equal(proof(a,[person],[att]).attendanceLinked,false);
 const b=[...web];b[10]='MIO-0009';assert.equal(proof(b,[person],[att]).attendanceLinked,false);
 const c=[...web];c[15]='MIO-0009';assert.equal(proof(c,[person],[att]).attendanceLinked,false);
});
test('empty, duplicate or mismatched participants are denied',()=>{
 assert.equal(proof(web,[],[att]).attendanceLinked,false);
 assert.equal(proof(web,[person,person],[att]).attendanceLinked,false);
 assert.equal(proof(web,[['MIO-0009','SINGER']],[att]).attendanceLinked,false);
});
test('empty, duplicate or mismatched attendance rows are denied',()=>{
 assert.equal(proof(web,[person],[]).attendanceLinked,false);
 assert.equal(proof(web,[person],[att,att]).attendanceLinked,false);
 assert.equal(proof(web,[person],[['MIO-0008','OTHER']]).attendanceLinked,false);
});
test('the GAS proof never mutates its input row',()=>{
 const before=JSON.stringify(web);
 proof(web,[person],[att]);
 assert.equal(JSON.stringify(web),before);
});
