import test from 'node:test';
import assert from 'node:assert/strict';
import {statusV201} from '../registration-name-v201.js';
const id='MIO-W-b502544b66bbb759c52114d1',tokenHash='a'.repeat(64);
const base={browser_id:id,token_hash:tokenHash,name:'ユーリ'};
const reviewed={...base,name_key:'ユーリ',reason:'同名登録あり・本人確認待ち'};
const approved={...base,status:'承認済み',integrated_participant_id:'MIO-0017',
 approved_by:'owner-authorized-recovery-20261124',approved_at:'2026-11-24T09:00:00+09:00'};
const db=(normal,review)=>({async query(sql){if(sql.includes('FROM mio_registration_v2'))return {rows:normal?[normal]:[]};
 if(sql.includes('FROM mio_name_review_v201'))return {rows:review?[review]:[]};
 throw Error('unexpected query')}});
test('same-browser exact token owner approval can recover without deleting pending review',async()=>{
 const r=await statusV201(id,tokenHash,{db:db(approved,reviewed)});
 assert.equal(r.ok,true);assert.equal(r.pendingReview,false);
 assert.equal(r.status,'承認済み');assert.equal(r.integratedParticipantId,'MIO-0017');
 assert.equal(r.attendanceGrantVerified,true);
});
test('same name with different signed token cannot recover',async()=>{
 const r=await statusV201(id,tokenHash,{db:db({...approved,token_hash:'b'.repeat(64)},reviewed)});
 assert.equal(r.pendingReview,true);assert.equal(r.attendanceGrantVerified,false);
});
test('different browser or unapproved row remains pending',async()=>{
 for(const wrong of [{...approved,browser_id:'MIO-W-'+'c'.repeat(24)}, {...approved,approved_by:null}, {...approved,status:'承認待ち'}]){
  const r=await statusV201(id,tokenHash,{db:db(wrong,reviewed)});
  assert.equal(r.pendingReview,true);
  assert.equal(r.integratedParticipantId,null);
 }
});
test('pending duplicate with no approved normal row stays pending',async()=>{
 const r=await statusV201(id,tokenHash,{db:db(null,reviewed)});
 assert.equal(r.pendingReview,true);assert.equal(r.status,'本人確認待ち');
});
test('legacy standalone approved registration is unchanged',async()=>{
 const r=await statusV201(id,tokenHash,{db:db(approved,null)});
 assert.equal(r.pendingReview,false);assert.equal(r.status,'承認済み');
 assert.equal(r.integratedParticipantId,'MIO-0017');
});

test('unrecognized owner decision cannot release a duplicate review even for same browser',async()=>{
 const r=await statusV201(id,tokenHash,{db:db({...approved,approved_by:'someone-else'},reviewed)});
 assert.equal(r.pendingReview,true);assert.equal(r.attendanceGrantVerified,false);
});
