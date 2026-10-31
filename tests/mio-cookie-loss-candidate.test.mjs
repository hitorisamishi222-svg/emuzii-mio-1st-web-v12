import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../gacha-admin-ops.js',import.meta.url),'utf8');
const start=source.indexOf('window.mioManualRecoveryCandidates=function('),
 end=source.indexOf('\nfunction identityUpdated()',start);
assert.ok(start>=0&&end>start);
function make(roster){
 const window={};
 vm.runInNewContext(source.slice(start,end),{window,state:roster===null?null:{roster}});
 return window.mioManualRecoveryCandidates;
}
const a={mioId:'MIO-0010',name:'はるか'};
const b={mioId:'MIO-0011',name:'はるか'};
const c={mioId:'MIO-0012',name:'別人'};
test('claiming MIO-ID with matching name offers candidate only, never verified',()=>{
 const r=make([a,c])('はるか','MIO-0010');
 assert.equal(r.status,'possible');
 assert.equal(r.items.length,1);
 assert.equal(r.items[0].mioId,'MIO-0010');
 assert.equal('verified' in r,false);
});
test('claims for a different person or MIO-ID are blocked as conflicts',()=>{
 const match=make([a,c]);
 assert.equal(match('別人','MIO-0010').status,'conflict');
 assert.equal(match('はるか','MIO-0099').status,'conflict');
 assert.equal(match('はるか','').status,'possible');
});
test('duplicate names must be escalated not merged',()=>{
 const r=make([a,b])('はるか','');
 assert.equal(r.status,'multiple');
 assert.equal(r.items.length,2);
});
test('stale admin state fails closed and does not expose records',()=>{
 assert.equal(make(null)('はるか','MIO-0010').status,'unavailable');
 const r=make([])('はるか','');assert.equal(r.status,'none');
});
test('dashboard never tries to unlock when a candidate matches',()=>{
 const ui=readFileSync(new URL('../gacha-cookie-loss-admin.js',import.meta.url),'utf8');
 assert.match(ui,/本人確定ではありません/);
 assert.match(ui,/登録台帳/);
 assert.doesNotMatch(ui,/sessionCookie\(|makeIdentity\(|gachaGrant\(|\/api\/register/);
});
