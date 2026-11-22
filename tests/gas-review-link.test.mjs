import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stageReviewLink,finalizeReviewLink} from '../review-link-core.mjs';
import {setLightSessionCookie} from '../registration-light-session.js';

const webId='MIO-W-'+'a'.repeat(24),mioId='MIO-9999',name='TEST-ONLY';
const token='b'.repeat(64),tokenHash=createHash('sha256').update(token).digest('hex');
const operationId='d'.repeat(32),secret='synthetic-secret-'.repeat(4),actor='passkey:'+'c'.repeat(64);
const target={webId,mioId,name},write={...target,tokenHash,operationId},approval={...write,expectedStatus:'承認待ち',memberConfirmed:true};
const clone=x=>JSON.parse(JSON.stringify(x));
const blank=n=>Array(n).fill('');
const web='emuzii_Web登録',people='emuzii_参加者',gacha='emuzii_ガチャ',history='emuzii_当選履歴',audit='emuzii_Web管理操作履歴';
const source=['../release-prep/GAS_WebAdminOps_ReviewLink_20261122.gs','../release-prep/GAS_ReviewLinkAdapter.gs'].map(n=>readFileSync(new URL(n,import.meta.url),'utf8')).join('\n');
class Sheet {
 constructor(headers){this.rows=[headers];this.cols=headers.length;this.writes=[];this.fail=null;}
 getMaxColumns(){return this.cols} getMaxRows(){return 500}
 getLastRow(){return this.rows.length}
 getRange(r,c,n=1,k=1){const s=this;return {
  getValues(){return Array.from({length:n},(_,i)=>Array.from({length:k},(_,j)=>s.rows[r+i-1]?.[c+j-1]??''))},
  setValues(values){assert.equal(values.length,n);for(let i=0;i<n;i++){assert.equal(values[i].length,k);for(let j=0;j<k;j++){
   if(s.fail?.(r+i,c+j,values[i][j]))throw Error('simulated interruption');
   while(s.rows.length<r+i)s.rows.push(blank(s.cols));s.rows[r+i-1][c+j-1]=values[i][j];s.writes.push([r+i,c+j,values[i][j]]);
  }}return this;},
  setValue(v){return this.setValues([[v]])},getValue(){return this.getValues()[0][0]}
 };}
}
function fixture(){
 const flags={release:true,locked:true,next:null};
 const lock={hasLock:()=>flags.locked};
 const context=vm.createContext({
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>flags.release?'verified-existing-review-link-v1':''})},
  SpreadsheetApp:{flush(){}},equal_:(a,b)=>a===b,safeText_:v=>v,
  // These are simulated host helpers, not a substitute for a deployed GAS test.
  loginIdFormat_:v=>{const clean=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return /^MIO[A-Z0-9]{8}$/.test(clean)?clean.slice(3):clean},loginIdDisplay_:v=>`MIO-${v.slice(0,4)}-${v.slice(4)}`,newLoginId_:()=> 'ABCD1234',
  webNextRow_:s=>flags.next??s.getLastRow()+1,
  ensureWebDerivedRow_:(s,r)=>{const v=s.getRange(r,8).getValue();s.getRange(r,16).setValue(v);s.getRange(r,20).setValue('OK')},
  webIntegrityOk_:r=>r[7]===r[10]&&r[15]===r[7]&&r[19]==='OK'&&r[11]==='確認済み'&&r[16]!=='旧端末'
 });
 vm.runInContext(source,context);
 const headers=clone(context.MIO_REVIEW_LINK_GAS_HEADERS_);
 const sheets=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k,new Sheet(v)]));
 sheets[people].rows.push([mioId,name,...blank(8)]);
 const g=blank(17);Object.assign(g,{0:mioId,1:name,5:2,6:0,7:2,9:0,12:'OK',13:'OK',15:0});sheets[gacha].rows.push(g);
 // Include an unrelated approved row and unrelated confirmed history for preservation checks.
 const unrelated=blank(21);Object.assign(unrelated,{0:'MIO-W-'+'e'.repeat(24),1:'f'.repeat(64),2:'OTHER',5:'承認済み',7:'MIO-9998',10:'MIO-9998',20:'OTHER-LOGIN'});sheets[web].rows.push(unrelated);
 const draw=blank(14);Object.assign(draw,{0:'other-draw',1:unrelated[0],2:'MIO-9998',3:'OTHER',10:'確定'});sheets[history].rows.push(draw);
 const ss={getSheetByName:n=>sheets[n]||null};
 const call=(action,data=target)=>context.mioReviewLinkOps_(ss,{...data,action},lock);
 const prepare=(data=write)=>call('mioReviewLinkPrepare',data);
 const approve=(data=approval)=>call('mioReviewLinkApprove',data);
 const protectedState=()=>clone([sheets[people].rows,sheets[gacha].rows,sheets[history].rows,sheets[web].rows[1]]);
 return {sheets,flags,call,prepare,approve,protectedState};
}
test('actual GAS adapter scoped read returns rights; readonly',()=>{const f=fixture(),before=f.protectedState();const r=f.call('mioReviewLinkRead');assert.equal(r.roster[0].gacha.remaining,2);assert.equal(r.releaseReady,true);assert.deepEqual(f.protectedState(),before);assert.equal(Object.values(f.sheets).flatMap(s=>s.writes).length,0)});
test('missing audit tab refuses all mutations, no automatic creation',()=>{const f=fixture();delete f.sheets[audit];assert.equal(f.call('mioReviewLinkRead').auditReady,false);assert.throws(f.prepare,/監査台帳/);assert.equal(f.sheets[web].rows.length,2)});
test('actual column mismatch refuses write',()=>{const f=fixture();f.sheets[gacha].rows[0][7]='wrong';assert.equal(f.call('mioReviewLinkRead').schemaReady,false);assert.throws(f.prepare,/監査台帳/)});
test('specific GAS release remains off until verified',()=>{const f=fixture();f.flags.release=false;assert.equal(f.call('mioReviewLinkRead').releaseReady,false);assert.throws(f.prepare,/停止中/);assert.equal(f.sheets[web].rows.length,2)});
test('lock and unknown action both fail closed',()=>{const f=fixture();assert.throws(()=>f.call('webAdminOpsGrant',write),/未対応/);f.flags.locked=false;assert.throws(f.prepare,/排他/)});
test('mismatched or duplicate roster cannot prepare',()=>{const f=fixture();assert.throws(()=>f.prepare({...write,name:'WRONG'}),/参加者/);f.sheets[people].rows.push([mioId,name,...blank(8)]);assert.throws(f.prepare,/参加者/)});
test('different browser even when not approved is protected',()=>{const f=fixture();f.sheets[web].rows[1][7]=mioId;assert.throws(f.prepare,/別の既存ブラウザ/);assert.equal(f.sheets[web].rows.length,2)});
test('duplicate token rejected across unrelated browsers',()=>{const f=fixture();f.sheets[web].rows[1][1]=tokenHash;assert.throws(f.prepare,/端末認証の重複/)});
test('already occupied row cannot be overwritten',()=>{const f=fixture();f.flags.next=2;const before=f.protectedState();assert.throws(f.prepare,/上書き/);assert.deepEqual(f.protectedState(),before)});
test('incomplete login ID blocks approval after preparation interruption',()=>{const f=fixture();f.sheets[web].fail=(r,c)=>c===21;assert.throws(f.prepare,/interruption/);f.sheets[web].fail=null;assert.throws(f.approve,/ログインID/);assert.equal(f.sheets[web].rows[2][5],'承認待ち');assert.equal(f.sheets[audit].rows.length,1)});
test('login ID collision cannot be allocated',()=>{const f=fixture();f.sheets[web].rows[1][20]='MIO-ABCD-1234';assert.throws(f.prepare,/発行できません/);assert.equal(f.sheets[web].rows.length,2)});
test('inconsistent history and rights stop before writing',()=>{const f=fixture();f.sheets[gacha].rows[1][7]=1;assert.throws(f.prepare,/残数/);assert.equal(f.sheets[web].rows.length,2)});
test('actual existing approval function, repeated prepare and approval are idempotent',()=>{const f=fixture(),before=f.protectedState();assert.equal(f.prepare().status,'承認待ち');assert.equal(f.prepare().verified,true);assert.equal(f.sheets[web].rows.length,3);assert.throws(()=>f.approve({...approval,tokenHash:'1'.repeat(64)}),/端末認証/);assert.equal(f.approve().status,'承認済み');assert.equal(f.approve().replayed,true);assert.equal(f.sheets[audit].rows.length,2);assert.equal(f.sheets[audit].rows[1][7],'確定');assert.equal(f.sheets[web].rows[2][7],mioId);assert.deepEqual(f.protectedState(),before)});
test('confirmed existing draw remains untouched during recovery',()=>{const f=fixture(),g=f.sheets[gacha].rows[1];g[7]=1;g[15]=1;const row=blank(14);Object.assign(row,{0:'old-draw',1:'MIO-W-'+'9'.repeat(24),2:mioId,3:name,10:'確定'});f.sheets[history].rows.push(row);const before=f.protectedState();f.prepare();f.approve();assert.equal(f.call('mioReviewLinkRead').roster[0].gacha.remaining,1);assert.deepEqual(f.protectedState(),before)});
test('audit completion interruption after approved status safely replayed',()=>{const f=fixture(),before=f.protectedState();f.prepare();f.sheets[audit].fail=(r,c,v)=>c===8&&v==='確定';assert.throws(f.approve,/interruption/);assert.equal(f.sheets[web].rows[2][5],'承認済み');assert.equal(f.sheets[audit].rows[1][7],'処理中');f.sheets[audit].fail=null;assert.equal(f.approve().replayed,true);assert.equal(f.sheets[audit].rows[1][7],'確定');assert.equal(f.sheets[audit].rows.length,2);assert.deepEqual(f.protectedState(),before)});
test('interruption before approved status does not authorize session or repeat audit',()=>{const f=fixture();f.prepare();f.sheets[web].fail=(r,c,v)=>c===6&&v==='承認済み';assert.throws(f.approve,/interruption/);f.sheets[web].fail=null;assert.throws(f.approve,/管理者が確認中/);assert.equal(f.call('mioReviewLinkRead').approvedBrowsers.length,0);assert.equal(f.sheets[audit].rows.length,2)});
test('core and real GAS scripts integrated with signed light session, lost response and protected records',async()=>{const f=fixture(),before=f.protectedState();let a=null,lose=true;const review={browser_id:webId,name,name_key:name,token_hash:tokenHash,reason:'同名登録あり・本人確認待ち',normal_exists:false};const store={readReview:async()=>review,getApproval:async()=>a,stage:async v=>a={...v,state:'staged'},complete:async()=>a.state='complete'};
 const callGAS=async(action,d)=>{if(action==='status'){const r=f.sheets[web].rows[2];return {ok:true,participantId:r[0],name:r[2],status:r[5],progress:{attendanceConfirmedDays:[],attendanceLockedDays:[],gacha:{confirmed:true,total:2,remaining:2}}}}const res=f.call(action,d);if(action==='mioReviewLinkApprove'&&lose){lose=false;throw Error('lost-response')}return res};
 await stageReviewLink({...target,operationId,onSiteVerified:true,memberConfirmed:true},{store,callGAS,actor});assert.equal(f.sheets[web].rows.length,2);const finish=()=>finalizeReviewLink({cookie:setLightSessionCookie(webId,token,secret),lightSecret:secret,store,callGAS});await assert.rejects(finish(),/lost-response/);assert.equal(a.state,'staged');assert.equal((await finish()).status,'recovered');assert.equal(a.state,'complete');assert.equal(f.sheets[audit].rows.length,2);assert.equal(f.sheets[web].rows.length,3);assert.deepEqual(f.protectedState(),before);
});
