import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedDrawFromHistory} from '../gacha-recorded-replay.js';

const participantId = 'MIO-W-' + 'a'.repeat(24);
const drawId = 'b'.repeat(32);
const row = {drawId, mode:'通常', prize:'翠央グッズ', ordinal:3, rarity:'SR', image:'https://example.org/prize.jpg'};
const expected = {participantId, drawId, mode:'通常'};
const history = (records=[row], id=participantId) => ({ok:true, participantId:id, history:records});

test('committed normal draw is recovered with explicit replay marker', () => {
  assert.deepEqual(recordedDrawFromHistory(history(), expected), {
    ok:true, participantId, drawId, mode:'通常', prize:'翠央グッズ', ordinal:3,
    rarity:'SR', image:'https://example.org/prize.jpg', replayed:true
  });
});

test('committed lucky festival draw is recovered without spending rights', () => {
  const fest = {...row, mode:'ラキフェス'};
  assert.equal(recordedDrawFromHistory(history([fest]), {...expected,mode:'ラキフェス'}).replayed, true);
});

test('recovery is read-only and does not mutate GAS history', () => {
  const h=history();
  const snapshot=JSON.stringify(h);
  recordedDrawFromHistory(h,expected);
  assert.equal(JSON.stringify(h), snapshot);
});

test('rejects participant mismatch and malformed identity', () => {
  assert.equal(recordedDrawFromHistory(history([row], 'MIO-W-'+'c'.repeat(24)), expected),null);
  assert.equal(recordedDrawFromHistory(history(), {...expected, participantId:'unknown'}),null);
});

test('rejects missing and malformed draw identifier', () => {
  assert.equal(recordedDrawFromHistory(history(), {...expected,drawId:'e'.repeat(32)}),null);
  assert.equal(recordedDrawFromHistory(history(), {...expected,drawId:'bad-id'}),null);
});

test('rejects mismatch between requested and historical mode', () => {
  assert.equal(recordedDrawFromHistory(history(), {...expected,mode:'ラキフェス'}),null);
  assert.equal(recordedDrawFromHistory(history(), {...expected,mode:'invalid'}),null);
});

test('rejects two rows claiming the same drawId', () => {
  assert.equal(recordedDrawFromHistory(history([row,{...row}]), expected),null);
});

test('rejects uncertain / failed / missing history responses', () => {
  assert.equal(recordedDrawFromHistory(null,expected),null);
  assert.equal(recordedDrawFromHistory({ok:false,participantId,history:[row]},expected),null);
  assert.equal(recordedDrawFromHistory({ok:true,participantId,history:'invalid'},expected),null);
  assert.equal(recordedDrawFromHistory(history(),null),null);
});

test('rejects unconfirmed, blank prize or invalid ordinal rows', () => {
  assert.equal(recordedDrawFromHistory(history([{...row,prize:''}]),expected),null);
  assert.equal(recordedDrawFromHistory(history([{...row,ordinal:0}]),expected),null);
  assert.equal(recordedDrawFromHistory(history([{...row,ordinal:1.5}]),expected),null);
});

test('uncertain history outside returned 50 rows is not fabricated', () => {
  const others=Array.from({length:50},(_,i)=>({...row,drawId:i.toString(16).padStart(32,'0')}));
  assert.equal(recordedDrawFromHistory(history(others), expected),null);
});

test('missing optional metadata is sanitized, not invented', () => {
  const d=recordedDrawFromHistory(history([{...row,rarity:null,image:undefined}]),expected);
  assert.equal(d.rarity,'');
  assert.equal(d.image,'');
});

test('does not use prize names to find a draw from a different ID', () => {
  const other={...row,drawId:'c'.repeat(32)};
  assert.equal(recordedDrawFromHistory(history([other]),expected),null);
});
