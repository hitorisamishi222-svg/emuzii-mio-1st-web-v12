import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAttendanceIntegration} from '../attendance-integration-proof.js';
const browser='MIO-W-0123456789abcdef01234567';
const mio='MIO-0008';
const light={participantId:browser,name:'SINGER',status:'承認済み',pendingReview:false,attendanceGrantVerified:true,integratedParticipantId:mio};
const legacy={participantId:browser,name:'SINGER',status:'承認済み',integratedParticipantId:mio,attendanceLinked:true,progress:{attendanceConfirmedDays:[],attendanceLockedDays:[]}};
test('matching independent legacy approval and attendance proof passes',()=>{
 assert.equal(verifyAttendanceIntegration(light,legacy,browser),true);
});
test('same name without GAS participant mapping never passes',()=>{
 const {integratedParticipantId,...unlinked}=legacy;
 assert.equal(verifyAttendanceIntegration(light,unlinked,browser),false);
});
test('same name and linked participant without attendance proof never passes',()=>{
 assert.equal(verifyAttendanceIntegration(light,{...legacy,attendanceLinked:false},browser),false);
});
test('conflicting MIO-ID never passes',()=>{
 assert.equal(verifyAttendanceIntegration(light,{...legacy,integratedParticipantId:'MIO-0009'},browser),false);
});
test('wrong browser identity never passes',()=>{
 assert.equal(verifyAttendanceIntegration(light,{...legacy,participantId:'MIO-W-aaaaaaaaaaaaaaaaaaaaaaaa'},browser),false);
});
test('pending and rejected enrollments never pass',()=>{
 assert.equal(verifyAttendanceIntegration({...light,pendingReview:true},legacy,browser),false);
 assert.equal(verifyAttendanceIntegration({...light,status:'却下'},legacy,browser),false);
});
test('missing attendance progress never passes',()=>{
 assert.equal(verifyAttendanceIntegration(light,{...legacy,progress:null},browser),false);
});
