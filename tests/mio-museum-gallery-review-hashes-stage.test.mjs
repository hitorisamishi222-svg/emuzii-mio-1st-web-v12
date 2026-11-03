import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureMuseumReviewHashes,selectCurrentlyReviewedMuseumIds} from '../museum-gallery-review-hashes-stage.mjs';
const song='mio-awakening-song',video='mio-awakening-video',art='museum-e4b063d0-a393-4d15-b653-c2243e38c6a8';
const h1='a'.repeat(64),h2='b'.repeat(64),h3='c'.repeat(64);
const source=()=>({[song]:h1,[video]:h2,[art]:h3});
const published=()=>captureMuseumReviewHashes({visibleIds:[song,video],currentReviewHashes:source()});
test('publication snapshots pin review hashes only for works visible in that revision',()=>{
 const src=source(),before=structuredClone(src);
 const saved=published();
 assert.deepEqual(Object.keys(saved),[song,video]);
 assert.deepEqual(src,before);
 assert.equal(Object.isFrozen(saved),true);
 assert.equal(saved[song],h1);
 assert.equal(saved[art],undefined);
});
test('matching reviews permit the previous display order',()=>{
 assert.deepEqual(selectCurrentlyReviewedMuseumIds({
  visibleIds:[video,song],publishedReviewHashes:{[video]:h2,[song]:h1},
  currentReviewHashes:source()
 }),[video,song]);
});
test('rights withdrawal excludes even a featured work stored in a published snapshot',()=>{
 const after={[song]:h1,[art]:h3};
 const selected=selectCurrentlyReviewedMuseumIds({
  visibleIds:[song,video],publishedReviewHashes:published(),currentReviewHashes:after
 });
 assert.deepEqual(selected,[song]);
});
test('reapproval with a newer fingerprint cannot resurrect an earlier published edition',()=>{
 const before=published();
 const reapproved={...source(),[video]:h3};
 assert.deepEqual(selectCurrentlyReviewedMuseumIds({
  visibleIds:[video,song],publishedReviewHashes:before,
  currentReviewHashes:reapproved
 }),[song]);
 awaitAssertHistoryChange(before,reapproved);
});
function awaitAssertHistoryChange(before,reapproved){
 assert.throws(()=>selectCurrentlyReviewedMuseumIds({
  visibleIds:[song,video],publishedReviewHashes:before,
  currentReviewHashes:reapproved,requireEvery:true
 }),/MUSEUM_REVIEW_HISTORICAL_APPROVAL_CHANGED/);
}
test('owner rollback cannot republish a work with a changed or removed review',()=>{
 for(const current of [ {[song]:h3,[video]:h2],{[song]:h1} ]){
  assert.throws(()=>selectCurrentlyReviewedMuseumIds({
   visibleIds:[song,video],publishedReviewHashes:published(),
   currentReviewHashes:current,requireEvery:true
  }),/MUSEUM_REVIEW_HISTORICAL_APPROVAL_CHANGED/);
 }
});
test('new publication creates a new reviewed snapshot from the current source',()=>{
 const now={...source(),[video]:h3};
 const captured=captureMuseumReviewHashes({
  visibleIds:[song,video],currentReviewHashes:now
 });
 assert.deepEqual(selectCurrentlyReviewedMuseumIds({
  visibleIds:[song,video],publishedReviewHashes:captured,
  currentReviewHashes:now,requireEvery:true
 }),[song,video]);
});
test('missing, extra, invented or malformed stored approval proof never becomes public',()=>{
 const v=[song,video];
 for(const bad of [null,{}, {[song]:h1}, {[song]:h1,[video]:h2,[art]:h3},
  {[song]:'bad',[video]:h2},{[song]:h1,[video]:h2,'__proto__':h2}]){
  assert.throws(()=>selectCurrentlyReviewedMuseumIds({
   visibleIds:v,publishedReviewHashes:bad,currentReviewHashes:source()
  }),/MUSEUM_REVIEW_(HASHES_INVALID|SNAPSHOT_INCOMPLETE)/);
 }
});
test('browser-provided approval or a bare status cannot create a review hash',()=>{
 for(const invalid of [null,undefined,true,{[song]:true},{[song]:'true'},{[song]:'f'.repeat(63)}]){
  assert.throws(()=>captureMuseumReviewHashes({
   visibleIds:[song],currentReviewHashes:invalid
  }),/MUSEUM_REVIEW_(HASHES_INVALID|CURRENT_APPROVAL_MISSING)/);
 }
});
test('the helper is pure, server-side, and cannot route or modify any real database',()=>{
 const src=readFileSync(new URL('../museum-gallery-review-hashes-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(src,/process\.env|\.query\s*\(|fetch\s*\(|export default|INSERT INTO|UPDATE\s|DELETE FROM/);
 assert.equal(config.routes.some(x=>x.src==='/museum-gallery-review-hashes-stage.mjs'),false);
 assert.equal(config.builds.some(x=>x.src==='museum-gallery-review-hashes-stage.mjs'),false);
});
