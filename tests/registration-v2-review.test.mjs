import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewEnrollment} from '../registration-v2-review.js';
const browserId='MIO-W-'+'a'.repeat(24);
function fakeDB(){
 const row={browser_id:browserId,status:'承認待ち',integrated_participant_id:null};
 let updates=0;
 return {row,get updates(){return updates},async connect(){return {async query(sql,args=[]){
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
  if(sql.includes('SELECT browser_id,status'))return {rows:row.browser_id===args[0]?[{...row}]:[]};
  if(sql.includes('UPDATE mio_registration_v2')){
   updates++;
   row.status=args[1];
   row.integrated_participant_id=args[2];
   return {rows:[{...row}]};
  }
  throw Error('Unexpected SQL');
 },release(){}}}};
}
test('explicit approved MIO-ID is required, matching names never approve',async()=>{
 const db=fakeDB();
 await assert.rejects(reviewEnrollment({browserId,decision:'承認済み',reviewer:'admin'}, {db}),/MIO-ID/);
 assert.equal(db.updates,0);
});
test('manual approval links only the specifically approved participant ID',async()=>{
 const db=fakeDB();
 const result=await reviewEnrollment({browserId,decision:'承認済み',participantId:'MIO-0042',reviewer:'admin'}, {db});
 assert.equal(result.status,'承認済み');
 assert.equal(result.integrated_participant_id,'MIO-0042');
 assert.equal(db.updates,1);
});
test('review cannot be silently repeated on an already approved browser',async()=>{
 const db=fakeDB();
 await reviewEnrollment({browserId,decision:'承認済み',participantId:'MIO-0042',reviewer:'admin'}, {db});
 await assert.rejects(reviewEnrollment({browserId,decision:'却下',reviewer:'admin'}, {db}),/pending/);
 assert.equal(db.updates,1);
});
test('rejected browsers remain unlinked',async()=>{
 const db=fakeDB();
 const result=await reviewEnrollment({browserId,decision:'却下',reviewer:'admin'}, {db});
 assert.equal(result.status,'却下');
 assert.equal(result.integrated_participant_id,null);
});
test('invalid reviewer or browser cannot alter a registration',async()=>{
 const db=fakeDB();
 await assert.rejects(reviewEnrollment({browserId:'MIO-0001',decision:'承認済み',participantId:'MIO-0001',reviewer:'admin'}, {db}));
 await assert.rejects(reviewEnrollment({browserId,decision:'承認済み',participantId:'MIO-0001',reviewer:''}, {db}));
 assert.equal(db.updates,0);
});
