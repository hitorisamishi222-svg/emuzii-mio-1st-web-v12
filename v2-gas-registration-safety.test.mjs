import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('./APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs',import.meta.url),'utf8');
function load(extra={}){
 const sandbox={SpreadsheetApp:{flush(){}},...extra};
 runInNewContext(src,sandbox,{timeout:2000});
 return sandbox;
}
function sheet(initial={}){
 const rows=Object.fromEntries(Object.entries(initial).map(([k,v])=>[Number(k),[...v]]));
 let writes=[];
 return {
  rows,writes,
  getMaxRows(){return 50},
  getRange(row,col,count=1,width=1){
   return {
    getDisplayValues(){return [[...Array(width)].map((_,i)=>String((rows[row]||[])[col-1+i]??''))]},
    getValues(){return [[...Array(width)].map((_,i)=>(rows[row]||[])[col-1+i]??'')]},
    setValues(vals){const old=rows[row]||Array(21).fill('');vals[0].forEach((v,i)=>{old[col-1+i]=v});rows[row]=old;writes.push(row);return this}
   };
  }
 };
}
test('GAS v1.9.6 staging has no automatic approval by name/login ID',()=>{
 assert.equal((src.match(/autoLinkWebParticipant_\(/g)||[]).length,1,'helper must not be called');
 assert.match(src,/if\(duplicates\.length \|\| peopleByName\.length\)/);
 assert.match(src,/status:'承認待ち',integratedParticipantId:'',loginId:''/);
 assert.doesNotMatch(src,/var newAuth=status==='却下'\?'承認待ち':status;/);
});
test('status/checkin do not initialize the login ID header or missing IDs',()=>{
 assert.match(src,/if\(d\.action==='register'\)ensureLoginIdHeader_\(web\);/);
 assert.match(src,/var loginId=statusRow\?loginIdFormat_\(web\.getRange\(statusRow,LOGIN_ID_COL\)\.getDisplayValue\(\)\):'';/);
 assert.doesNotMatch(src,/var loginId=statusRow\?ensureLoginIdForRow_\(/);
});
test('new candidate skips orphaned row and leaves its cells untouched',()=>{
 const s=load();
 const old=Array(21).fill('');old[5]='孤立した承認状態';
 const sh=sheet({4:old});
 s.webActualLastRow_=()=>3;
 s.ensureWebDerivedRow_=()=>{};
 assert.equal(s.webNextRow_(sh),5);
 const id='MIO-W-0123456789abcdef01234567';
 const hash='a'.repeat(64);
 const response=s.appendBrowserCandidate_(sh,{participantId:id,tokenHash:hash},'SINGER','','承認待ち','未確認','本人確認待ち','重複要確認','確認待ち','未指定','確認が必要','MIO-ABCD-1234');
 assert.equal(response.ok,true);
 assert.deepEqual(sh.writes,[5]);
 assert.equal(sh.rows[4][5],'孤立した承認状態');
 assert.equal(sh.rows[5][0],id);
 assert.equal(sh.rows[5][5],'承認待ち');
 assert.equal(sh.rows[5][7],'');
 assert.equal(sh.rows[5][11],'確認待ち');
});
test('registration cannot acknowledge a partially persisted new candidate',()=>{
 const s=load();s.webActualLastRow_=()=>1;s.ensureWebDerivedRow_=()=>{};
 const sh=sheet();
 const original=sh.getRange.bind(sh);
 sh.getRange=(r,c,n,w)=>{
  const range=original(r,c,n,w);
  if(r===2&&c===1&&w===21){
   const getValues=range.getValues.bind(range);
   range.getValues=()=>{const values=getValues();values[0][5]='';return values};
  }
  return range;
 };
 const r=s.appendBrowserCandidate_(sh,{participantId:'MIO-W-0123456789abcdef01234567',tokenHash:'b'.repeat(64)},'SINGER','','承認待ち','未確認','','','確認待ち','未指定','','MIO-ABCD-1234');
 assert.equal(r.ok,false);
});
test('setup is intentionally NOT invoked by these isolated tests',()=>{
 assert.match(src,/function setup\(\) \{\s*setupGacha_\(\);\s*setupGachaAdminV188_\(\);/);
 assert.match(src,/ensureWebDerivedExisting_\(ss\);/);
});
