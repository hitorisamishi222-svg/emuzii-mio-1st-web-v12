/**
 * Isolated read-only tests for the MIO v2.2.0 diagnostic.
 * No production identifiers, names, credentials or external Google access.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const a=await readFile(new URL('../gas/mio-identity-attestation-v218.gs',import.meta.url),'utf8');
const b=await readFile(new URL('../gas/mio-identity-diagnostic-v220.gs',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(a+'\n'+b,context,{filename:'mio-v220-readonly.gs',timeout:1500});
const inspect=context.mioIdentityDiagnosticV220_;
assert.equal(typeof inspect,'function');
const plain=x=>JSON.parse(JSON.stringify(x));
const browserId=n=>'MIO-W-'+n.toString(16).padStart(24,'0');
const mioId=n=>'MIO-'+String(n).padStart(4,'0');
const token=n=>n.toString(16).padStart(64,'0');
function fixture(){
  const webRows=[],peopleRows=[],attendanceRows=[];
  for(let n=1;n<=38;n++){
    const name='test-user-'+n;
    const row=Array(21).fill('');
    row[0]=browserId(n);row[1]=token(n);row[2]=name;
    row[5]=n<=35?'承認済み':n===36?'承認待ち':'却下';
    row[7]=mioId(n);row[10]=mioId(n);row[11]='確認済み';
    row[15]=mioId(n);row[16]=n<=35?'使用中':'旧端末';
    webRows.push(row);
    peopleRows.push([mioId(n),name]);
    attendanceRows.push([mioId(n),name]);
  }
  return {webRows,peopleRows,attendanceRows};
}
function run(f){return plain(inspect(f.webRows,f.peopleRows,f.attendanceRows))}
test('38 valid synthetic web IDs: 35 approved, 1 pending, 2 rejected',()=>{
  const r=run(fixture());
  assert.equal(r.ok,true);
  assert.deepEqual(r.summary,{
    registered:38,approved:35,pending:1,rejected:2,
    approvedConsistent:35,approvedNeedsReview:0,
    orphanOrInvalidWebIdRows:0
  });
  assert.deepEqual(r.issues,[]);
});
test('illustrative dataset identifies two review rows and an orphan row without identity data',()=>{
  const f=fixture();
  // Exact sheet positions 23 / 24, not the real users or MIO IDs.
  f.webRows[21][10]=mioId(99);
  f.webRows[21][2]='wrong-synthetic-name-23';
  f.webRows[22][2]='wrong-synthetic-name-24';
  const orphan=Array(21).fill('');
  orphan[0]='invalid-unrecognized-browser-key';
  orphan[5]='承認済み';
  f.webRows.push(orphan); // row 40
  const before=JSON.stringify(f);
  const r=run(f);
  assert.deepEqual(r.summary,{
    registered:38,approved:35,pending:1,rejected:2,
    approvedConsistent:33,approvedNeedsReview:2,
    orphanOrInvalidWebIdRows:1
  });
  assert.deepEqual(r.issues.map(x=>x.sheetRow),[23,24,40]);
  assert.deepEqual(r.issues[0].codes,[
    'MIO_FIELDS_INCONSISTENT','PARTICIPANT_ROSTER_MISMATCH',
    'ATTENDANCE_ROSTER_MISMATCH'
  ]);
  assert.deepEqual(r.issues[1].codes,[
    'PARTICIPANT_ROSTER_MISMATCH','ATTENDANCE_ROSTER_MISMATCH'
  ]);
  assert.deepEqual(r.issues[2].codes,['ORPHAN_OR_INVALID_WEB_ID']);
  assert.equal(JSON.stringify(f),before,'no mutation to source arrays');
  const resultText=JSON.stringify(r);
  assert.equal(resultText.includes('wrong-synthetic-name'),false);
  assert.equal(resultText.includes(browserId(23)),false);
  assert.equal(resultText.includes(token(23)),false);
  assert.equal(resultText.includes(mioId(23)),false);
});
test('missing ledgers are treated as errors, never as empty or approved',()=>{
  const f=fixture();
  assert.equal(plain(inspect(null,f.peopleRows,f.attendanceRows)).ok,false);
  assert.equal(plain(inspect(f.webRows,null,f.attendanceRows)).ok,false);
  assert.equal(plain(inspect(f.webRows,f.peopleRows,null)).ok,false);
});
test('duplicate browser IDs are detected and fail closed',()=>{
  const f=fixture();f.webRows[1][0]=f.webRows[0][0];
  const r=run(f);
  assert.equal(r.summary.approvedNeedsReview,2);
  assert.equal(r.issues.filter(x=>x.codes.includes('DUPLICATE_WEB_ID')).length,2);
});
test('missing active designation blocks exactly the affected approved row',()=>{
  const f=fixture();f.webRows[0][16]='未指定';
  const r=run(f);
  assert.equal(r.summary.approvedConsistent,34);
  assert.equal(r.summary.approvedNeedsReview,1);
  assert.deepEqual(r.issues[0].codes,['DEVICE_NOT_EXPLICITLY_ACTIVE']);
});
test('wrong credential hash detected without returning hash',()=>{
  const f=fixture();f.webRows[0][1]='not-a-hash';
  const r=run(f);
  assert.equal(r.summary.approvedNeedsReview,1);
  assert.ok(r.issues[0].codes.includes('BAD_TOKEN_HASH'));
  assert.equal(JSON.stringify(r).includes('not-a-hash'),false);
});
test('unapproved registrations are not counted as auto-attested',()=>{
  const f=fixture();f.webRows[0][5]='承認待ち';
  const r=run(f);
  assert.equal(r.summary.approved,34);
  assert.equal(r.summary.pending,2);
  assert.equal(r.summary.approvedConsistent,34);
});
test('mismatched roster identity cannot pass on name match',()=>{
  const f=fixture();
  f.peopleRows[0][0]=mioId(99);
  f.attendanceRows[0][0]=mioId(99);
  const r=run(f);
  assert.deepEqual(r.issues[0].codes,
    ['PARTICIPANT_ROSTER_MISMATCH','ATTENDANCE_ROSTER_MISMATCH']);
});
test('blank entirely empty spare rows are ignored',()=>{
  const f=fixture();
  f.webRows.push(Array(21).fill(''));
  assert.equal(run(f).summary.orphanOrInvalidWebIdRows,0);
});
test('occupied row without valid browser ID is flagged and never counted approved',()=>{
  const f=fixture();
  const row=Array(21).fill('');
  row[5]='承認済み';f.webRows.push(row);
  const r=run(f);
  assert.equal(r.summary.orphanOrInvalidWebIdRows,1);
  assert.equal(r.summary.approved,35);
  assert.equal(r.issues[0].sheetRow,40);
});
test('an incomplete approval is flagged without writing or granting access',()=>{
  const f=fixture();
  f.webRows[0][11]='確認待ち';
  const before=JSON.stringify(f);
  const r=run(f);
  assert.equal(r.summary.approvedNeedsReview,1);
  assert.deepEqual(r.issues[0].codes,['CONFIRMATION_NOT_COMPLETE']);
  assert.equal(JSON.stringify(f),before);
});
test('unexpected approval states are reported without bypass',()=>{
  const f=fixture();f.webRows[0][5]='other';
  const r=run(f);
  assert.equal(r.summary.approved,34);
  assert.deepEqual(r.issues[0],{sheetRow:2,codes:['UNRECOGNIZED_APPROVAL_STATE']});
});
