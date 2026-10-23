/**
 * v2.2.2 read-only diagnostic regression tests using synthetic-only records.
 * No actual participant names, IDs or credentials are stored.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const [check, diagnostic]=await Promise.all([
  '../gas/mio-identity-attestation-v221.gs',
  '../gas/mio-identity-diagnostic-v222.gs'
].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
const context=vm.createContext({});
vm.runInContext(check+'\n'+diagnostic,context,{timeout:1500});
const run=context.mioIdentityDiagnosticV222_;
const serial=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  const webRows=[],peopleRows=[],attendanceRows=[];
  for(let n=1;n<=38;n++){
    const name='sample-name-'+n;
    const id='MIO-'+String(n).padStart(4,'0');
    const web=Array(21).fill('');
    web[0]='MIO-W-'+n.toString(16).padStart(24,'0');
    web[1]=n.toString(16).padStart(64,'0');
    web[2]=name;
    web[5]=n<=35?'承認済み':n===36?'承認待ち':'却下';
    web[7]=id;web[10]=id;web[11]='確認済み';
    web[15]=id;web[16]=n<=35?'使用中':'旧端末';
    webRows.push(web);
    peopleRows.push([id,name]);
    attendanceRows.push([id,name]);
  }
  return {webRows,peopleRows,attendanceRows};
}
function inspect(f){return serial(run(f.webRows,f.peopleRows,f.attendanceRows))}
test('all exactly matched 35 approved rows are preserved',()=>{
  const f=fixture(),before=JSON.stringify(f),res=inspect(f);
  assert.equal(res.summary.registered,38);
  assert.equal(res.summary.approved,35);
  assert.equal(res.summary.approvedConsistent,35);
  assert.equal(res.summary.boundaryTrimOnlyAccepted,0);
  assert.equal(res.issues.length,0);
  assert.equal(JSON.stringify(f),before);
});
test('whitespace-only display name discrepancy is safely counted, not auto-linked',()=>{
  const f=fixture();
  f.webRows[22][2]='仮 名';
  f.peopleRows[22][1]=' 仮 名';
  f.attendanceRows[22][1]=' 仮 名 ';
  const res=inspect(f);
  assert.equal(res.summary.approvedConsistent,35);
  assert.equal(res.summary.boundaryTrimOnlyAccepted,1);
  assert.equal(res.summary.approvedNeedsReview,0);
  assert.ok(!JSON.stringify(res).includes('仮 名'));
});
test('simulated exact rows 23, 24 and 40 classify as 23 only risky, 24 name-trim-safe, 40 orphan',()=>{
  const f=fixture();
  // row 23: mismatch in P (recovery destination) and a genuinely
  // different name. Strict approval must remain DENIED.
  f.webRows[21][15]='MIO-0099';
  f.webRows[21][2]='other-person';
  // row 24: confirmed MIO ID with boundary whitespace only.
  f.webRows[22][2]='仮 名';
  f.peopleRows[22][1]=' 仮 名';
  f.attendanceRows[22][1]=' 仮 名 ';
  // row 40: occupied but invalid Web ID; do NOT treat as registered.
  f.webRows.push(Array(21).fill(''));
  f.webRows[38][5]='承認済み';
  const before=JSON.stringify(f);
  const res=inspect(f);
  assert.equal(res.summary.registered,38);
  assert.equal(res.summary.approved,35);
  assert.equal(res.summary.approvedConsistent,34);
  assert.equal(res.summary.approvedNeedsReview,1);
  assert.equal(res.summary.boundaryTrimOnlyAccepted,1);
  assert.equal(res.summary.orphanOrInvalidWebIdRows,1);
  assert.deepEqual(res.issues.map(x=>x.sheetRow),[23,40]);
  assert.deepEqual(res.issues[0].codes,
    ['MIO_FIELDS_INCONSISTENT','PARTICIPANT_ROSTER_MISMATCH',
     'ATTENDANCE_ROSTER_MISMATCH']);
  assert.deepEqual(res.issues[1].codes,['ORPHAN_OR_INVALID_WEB_ID']);
  assert.equal(JSON.stringify(f),before);
});
test('internal whitespace difference stays denied even when ID matches',()=>{
  const f=fixture();
  f.peopleRows[0][1]='sample- name-1';
  const res=inspect(f);
  assert.equal(res.summary.approvedConsistent,34);
  assert.equal(res.summary.boundaryTrimOnlyAccepted,0);
  assert.equal(res.summary.approvedNeedsReview,1);
});
test('MIO-ID conflict is never fixed by a coincidental display name',()=>{
  const f=fixture();
  f.webRows[0][15]='MIO-0099';
  const res=inspect(f);
  assert.equal(res.summary.approvedConsistent,34);
  assert.equal(res.issues[0].codes.includes('MIO_FIELDS_INCONSISTENT'),true);
});
test('duplicate browser IDs are both rejected regardless of name',()=>{
  const f=fixture();
  f.webRows[1][0]=f.webRows[0][0];
  const res=inspect(f);
  assert.equal(res.summary.approvedConsistent,33);
  assert.equal(res.summary.approvedNeedsReview,2);
});
test('unapproved account never counted as attested, even with matching names',()=>{
  const f=fixture();
  f.webRows[0][5]='承認待ち';
  const res=inspect(f);
  assert.equal(res.summary.approved,34);
  assert.equal(res.summary.pending,2);
  assert.equal(res.summary.approvedConsistent,34);
});
test('blank invalid record is ignored, populated invalid record flagged',()=>{
  const f=fixture();
  f.webRows.push(Array(21).fill(''));
  assert.equal(inspect(f).summary.orphanOrInvalidWebIdRows,0);
  f.webRows[38][5]='承認済み';
  assert.equal(inspect(f).summary.orphanOrInvalidWebIdRows,1);
});
test('incorrect device state is denied, not repaired',()=>{
  const f=fixture();
  f.webRows[0][16]='旧端末';
  const res=inspect(f);
  assert.equal(res.summary.approvedConsistent,34);
  assert.equal(res.issues[0].codes[0],'DEVICE_NOT_EXPLICITLY_ACTIVE');
});
test('none of the outputs contains participant IDs, names or secret hashes',()=>{
  const f=fixture();
  f.webRows[0][15]='MIO-0099';
  const output=JSON.stringify(inspect(f));
  assert.equal(output.includes('sample-name'),false);
  assert.equal(output.includes('MIO-0001'),false);
  assert.equal(output.includes('MIO-W-'),false);
  assert.equal(output.includes(f.webRows[0][1]),false);
});
test('unavailable ledgers cause fail-closed diagnostic, without writing data',()=>{
  const f=fixture();
  for(const a of [null,undefined,'bad']){
    const res=serial(run(f.webRows,f.peopleRows,a));
    assert.equal(res.ok,false);
    assert.equal(res.error,'INVALID_SOURCE_ARRAYS');
  }
});
test('GAS checker remains a pure function: no sheet or Apps Script services',()=>{
  assert.equal(/SpreadsheetApp|PropertiesService|LockService|setValues?\s*\(/.test(
    diagnostic.slice(diagnostic.indexOf('function mioIdentityDiagnosticV222_'))
  ),false);
});
