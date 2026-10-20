import test from 'node:test';
import assert from 'node:assert/strict';
import {statusV201} from '../registration-name-v201.js';
const id='MIO-W-0123456789abcdef01234567', tokenHash='b'.repeat(64);
const db=(normal,review=[])=>({query:async(sql)=>{
 if(sql.includes('mio_registration_v2'))return {rows:normal?[normal]:[]};
 if(sql.includes('mio_name_review_v201'))return {rows:review};
 throw Error('Unexpected query');
}});
const base={browser_id:id,token_hash:tokenHash,name:'SINGER',status:'承認待ち'};
test('waiting enrollment cannot activate attendance',async()=>{
 const x=await statusV201(id,tokenHash,{db:db(base)});
 assert.equal(x.attendanceGrantVerified,false);
});
test('approved label without admin evidence cannot activate attendance',async()=>{
 const x=await statusV201(id,tokenHash,{db:db({...base,status:'承認済み'})});
 assert.equal(x.attendanceGrantVerified,false);
});
test('fully approved record exposes validated internal MIO ID',async()=>{
 const x=await statusV201(id,tokenHash,{db:db({...base,status:'承認済み',integrated_participant_id:'MIO-0008',approved_by:'admin',approved_at:new Date()})});
 assert.equal(x.attendanceGrantVerified,true);
 assert.equal(x.integratedParticipantId,'MIO-0008');
});
test('pending duplicate review blocks even a formerly approved record',async()=>{
 const approved={...base,status:'承認済み',integrated_participant_id:'MIO-0008',approved_by:'admin',approved_at:new Date()};
 const review=[{browser_id:id,token_hash:tokenHash,name:'SINGER'}];
 const x=await statusV201(id,tokenHash,{db:db(approved,review)});
 assert.equal(x.pendingReview,true);
 assert.equal(x.attendanceGrantVerified,false);
});
test('token mismatch never exposes approval',async()=>{
 await assert.rejects(statusV201(id,'c'.repeat(64),{db:db({...base,status:'承認済み',integrated_participant_id:'MIO-0008',approved_by:'admin',approved_at:new Date()})}),/unauthorized/);
});
