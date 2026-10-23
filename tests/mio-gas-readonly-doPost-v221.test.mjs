/**
 * Integration-style, read-only virtual Apps Script test for the STAGING
 * doPost() candidate. Uses actual candidate source and mocked Sheet reads.
 * NEVER calls a live GAS endpoint or changes a spreadsheet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const candidate=await readFile(
  new URL('../APPS_SCRIPT_Code_v1.9.10_READONLY_IDENTITY_NAME_TRIM_CANDIDATE.gs',import.meta.url),
  'utf8'
);
const base=await readFile(
  new URL('../APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs',import.meta.url),
  'utf8'
);
const helper=await readFile(
  new URL('../gas/mio-identity-attestation-v221.gs',import.meta.url),
  'utf8'
);
const webId='MIO-W-'+'a'.repeat(24),tokenHash='b'.repeat(64);
const secret='ci-only-secret-never-production',mioId='MIO-0042',name='翠央';
function fixture(mutate=()=>{}){
  const web=Array(21).fill('');
  web[0]=webId;web[1]=tokenHash;web[2]=name;web[5]='承認済み';
  web[7]=mioId;web[10]=mioId;web[11]='確認済み';
  web[15]=mioId;web[16]='使用中';
  const data={
    emuzii_Web登録:[web],
    emuzii_参加者:[[mioId,name,'']],
    emuzii_皆勤31日:[[mioId,name,'']]
  };
  mutate(data);
  const snapshot=JSON.stringify(data);
  const stats={opens:0,reads:0,writes:0,locks:0,unlocks:0,flushes:0,secretReads:0};
  const forbidden=(name)=>()=>{stats.writes++;throw Error('WRITE_BLOCKED:'+name)};
  function sheet(values){
    return {
      getMaxRows:()=>20,
      getLastRow:()=>values.length+1,
      getLastColumn:()=>21,
      getRange(row,col,nrows=1,ncols=1){
        stats.reads++;
        if(!Number.isSafeInteger(row)||row<1||col<1)throw Error('INVALID_RANGE');
        const cells=Array.from({length:nrows},(_,i)=>Array.from({length:ncols},(_,j)=>{
          if(row+i===1)return '';
          return values[row+i-2]?.[col+j-1]??'';
        }));
        return {
          getDisplayValues:()=>cells.map(r=>r.map(x=>String(x??''))),
          getValues:()=>cells.map(r=>[...r]),
          getDisplayValue:()=>String(cells[0]?.[0]??''),
          getValue:()=>cells[0]?.[0]??'',
          setValue:forbidden('setValue'),setValues:forbidden('setValues'),
          setFormula:forbidden('setFormula'),clearContent:forbidden('clearContent'),
          setDataValidation:forbidden('setDataValidation')
        };
      },
      appendRow:forbidden('appendRow'),deleteRow:forbidden('deleteRow'),
      insertRows:forbidden('insertRows'),clear:forbidden('clear'),
      setFrozenRows:forbidden('setFrozenRows')
    };
  }
  const workbook={
    getSheetByName(name){return Object.hasOwn(data,name)?sheet(data[name]):null},
    insertSheet:forbidden('insertSheet')
  };
  const sandbox=vm.createContext({
    SpreadsheetApp:{
      openById(){stats.opens++;return workbook},
      flush(){stats.flushes++;throw Error('FLUSH_BLOCKED')}
    },
    PropertiesService:{
      getScriptProperties(){
        return {
          getProperty(key){stats.secretReads++;return key==='BRIDGE_SECRET'?secret:null},
          setProperty:forbidden('setProperty')
        };
      }
    },
    LockService:{
      getScriptLock(){return {
        tryLock(){stats.locks++;return true},
        releaseLock(){stats.unlocks++}
      }}
    },
    ContentService:{
      MimeType:{JSON:'json'},
      createTextOutput(value){return {
        raw:value,setMimeType(){return this}
      }}
    }
  });
  vm.runInContext(candidate,sandbox,{filename:'GAS_v1910_STAGING.gs',timeout:2000});
  function post(payload={}){
    const req={secret,participantId:webId,tokenHash,action:'identity_attestation',...payload};
    const result=sandbox.doPost({postData:{contents:JSON.stringify(req)}});
    assert.equal(stats.writes,0);
    assert.equal(stats.flushes,0);
    assert.equal(JSON.stringify(data),snapshot,'all GAS ledgers must remain byte-identical');
    assert.equal(stats.locks,stats.unlocks,'script lock must be released');
    return JSON.parse(result.raw);
  }
  return {post,data,stats};
}
test('candidate is precisely v1.9.6 plus narrow-name-trim branch and pure helper: other source unchanged',()=>{
  const header='/** v1.9.10 GAS STAGING CANDIDATE: boundary-whitespace-only tolerance with strict identity attestation; no production deployment. */\n';
  assert.ok(candidate.startsWith(header));
  assert.ok(candidate.endsWith('\n\n'+helper));
  let original=candidate.slice(header.length,-('\n\n'+helper).length);
  const anchor="    var all=webActualRows_(web),found=all.filter(function(r){return r[0]===d.participantId});";
  const start=original.indexOf(anchor);
  const ending="\n\n    if(d.action==='register') {";
  const end=original.indexOf(ending,start);
  assert.ok(start>=0&&end>start);
  assert.ok(original.slice(start+anchor.length,end).includes("if(d.action==='identity_attestation')"));
  original=original.slice(0,start+anchor.length)+original.slice(end);
  assert.equal(original,base,'registration, attendance, gacha and other GAS code must be unchanged');
});
test('proper approved, unique matched ledgers return four attestations and no personal details',()=>{
  const f=fixture(),result=f.post();
  assert.deepEqual(result,{
    ok:true,participantId:webId,status:'承認済み',
    integratedParticipantId:mioId,
    identityLinked:true,attendanceLinked:true,deviceActive:true
  });
  assert.equal('name' in result,false);
  assert.equal('tokenHash' in result,false);
  assert.equal('loginId' in result,false);
  assert.ok(f.stats.reads>0);
});
test('missing or forged bridge secret cannot even open the spreadsheet',()=>{
  for(const value of ['','forged']){
    const f=fixture(),result=f.post({secret:value});
    assert.equal(result.ok,false);assert.equal(f.stats.opens,0);
  }
});
test('invalid browser ID or token format cannot open spreadsheet',()=>{
  for(const payload of [{participantId:'bad'},{tokenHash:'bad'}]){
    const f=fixture(),result=f.post(payload);
    assert.equal(result.ok,false);assert.equal(f.stats.opens,0);
  }
});
test('valid-looking token with wrong hash is denied',()=>{
  const f=fixture(),result=f.post({tokenHash:'c'.repeat(64)});
  assert.equal(result.ok,false);assert.equal(result.error,'unauthorized');
});
test('browser ID absent from ledger fails closed',()=>{
  const f=fixture(d=>d.emuzii_Web登録=[]);
  assert.equal(f.post().ok,false);
});
test('duplicated browser ID denies even when one row has correct hash',()=>{
  const f=fixture(d=>{
    const row=[...d.emuzii_Web登録[0]];
    row[1]='c'.repeat(64);
    d.emuzii_Web登録.push(row);
  });
  assert.equal(f.post().ok,false);
});
test('unapproved or rejected registrations do not attest identity',()=>{
  for(const state of ['承認待ち','却下']){
    const f=fixture(d=>d.emuzii_Web登録[0][5]=state);
    assert.equal(f.post().ok,false);
  }
});
test('revoked or missing explicit active-device state denies',()=>{
  for(const state of ['旧端末','未指定','']){
    const f=fixture(d=>d.emuzii_Web登録[0][16]=state);
    assert.equal(f.post().ok,false);
  }
});
test('ID mismatch between H K P is rejected',()=>{
  for(const field of [7,10,15]){
    const f=fixture(d=>d.emuzii_Web登録[0][field]='MIO-0008');
    assert.equal(f.post().ok,false);
  }
});
test('missing/duplicate participant and attendance ledgers are rejected',()=>{
  for(const key of ['emuzii_参加者','emuzii_皆勤31日']){
    for(const op of ['remove','duplicate']){
      const f=fixture(d=>{
        if(op==='remove')d[key]=[];
        else d[key].push([...d[key][0]]);
      });
      assert.equal(f.post().ok,false);
    }
  }
});
test('name matches but MIO-ID is different: no automatic linking',()=>{
  const f=fixture(d=>d.emuzii_参加者[0][0]='MIO-0099');
  const result=f.post({name});
  assert.equal(result.ok,false);
});
test('client-provided proof flags do not override sheet approval',()=>{
  const f=fixture(d=>d.emuzii_Web登録[0][5]='承認待ち');
  const result=f.post({
    identityLinked:true,attendanceLinked:true,deviceActive:true,
    integratedParticipantId:mioId,approved:true
  });
  assert.equal(result.ok,false);
});
test('unavailable attendance sheet fails closed, with no writes',()=>{
  const f=fixture(d=>delete d.emuzii_皆勤31日);
  assert.equal(f.post().ok,false);
});

test('v1.9.10 accepts only boundary whitespace differences for the same canonical MIO ID',()=>{
  const f=fixture(data=>{
    data.emuzii_Web登録[0][2]='歌 猫';
    data.emuzii_参加者[0][1]=' 歌 猫';
    data.emuzii_皆勤31日[0][1]=' 歌 猫 ';
  });
  assert.equal(f.post().ok,true);
});
test('v1.9.10 does not normalize internal spaces, fuzzy names, or a different recovery ID',()=>{
  const differentName=fixture(data=>{
    data.emuzii_Web登録[0][2]='歌猫';
    data.emuzii_参加者[0][1]='歌 猫';
    data.emuzii_皆勤31日[0][1]='歌 猫';
  });
  assert.equal(differentName.post().ok,false);
  const recoveryMismatch=fixture(data=>{
    data.emuzii_Web登録[0][15]='MIO-0099';
  });
  assert.equal(recoveryMismatch.post().ok,false);
});
