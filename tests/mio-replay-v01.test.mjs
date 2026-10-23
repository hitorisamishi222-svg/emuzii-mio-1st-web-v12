import test from 'node:test';
import assert from 'node:assert/strict';
import {checkpoint,replay} from '../recovery/mio-replay-v01.mjs';
const initial=()=>checkpoint({participants:{'MIO-0001':{name:'A'}},attendance:{},fa:{},predictions:{},gachaGrants:{},gachaDraws:{}});
test('replays committed updates without mutating original checkpoint',()=>{
 const before=initial();
 const after=replay(before,[{sequence:1,id:'e1',operation:'put',collection:'fa',recordId:'FA-1',record:{owner:'MIO-0001'}}]);
 assert.equal(after.state.fa['FA-1'].owner,'MIO-0001');
 assert.equal(before.state.fa['FA-1'],undefined);
});
test('rejects missing journal sequence',()=>assert.throws(()=>replay(initial(),[{sequence:2,id:'e2',operation:'put',collection:'fa',recordId:'FA-1',record:{}}]),/missing or reordered/));
test('rejects corrupted checkpoint',()=>{const b=initial();b.state.participants['MIO-0001'].name='B';assert.throws(()=>replay(b,[]),/corrupted/);});
test('rejects unreviewed deletes',()=>assert.throws(()=>replay(initial(),[{sequence:1,id:'e1',operation:'delete',collection:'fa',recordId:'FA-1'}]),/operator review/));
test('rejects duplicate sequence',()=>assert.throws(()=>replay(initial(),[{sequence:1,id:'e1',operation:'put',collection:'fa',recordId:'FA-1',record:{}},{sequence:1,id:'e1',operation:'put',collection:'fa',recordId:'FA-1',record:{}}]),/missing or reordered/));
