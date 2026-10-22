import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attendanceActivationAvailable} from '../api-enroll-lite.js';

const approved={status:'承認済み',pendingReview:false,attendanceGrantVerified:true};
test('no activation when release is not explicitly verified',()=>{
 assert.equal(attendanceActivationAvailable(approved,''),false);
 assert.equal(attendanceActivationAvailable(approved,'disabled'),false);
});
test('release flag does not bypass enrollment verification',()=>{
 assert.equal(attendanceActivationAvailable({...approved,status:'承認待ち'},'verified'),false);
 assert.equal(attendanceActivationAvailable({...approved,pendingReview:true},'verified'),false);
 assert.equal(attendanceActivationAvailable({...approved,attendanceGrantVerified:false},'verified'),false);
 assert.equal(attendanceActivationAvailable(null,'verified'),false);
});
test('only approved and independently verified enrollment can show action',()=>{
 assert.equal(attendanceActivationAvailable(approved,'verified'),true);
});
test('HTML starts hidden and only reveals button on server verified flag',()=>{
 const source=readFileSync(new URL('../join.html',import.meta.url),'utf8');
 assert.match(source,/id="activate"[^>]+class="hide"/);
 assert.match(source,/d\.attendanceActivationAvailable!==true/);
 assert.match(source,/認証連携は準備中です/);
});
