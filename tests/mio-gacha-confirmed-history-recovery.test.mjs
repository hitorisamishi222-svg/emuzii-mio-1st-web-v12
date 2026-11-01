import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../gacha-page.js',import.meta.url),'utf8');
const begin=source.indexOf('function confirmedHistoryResult(');
const end=source.indexOf('\nasync function loadCatalog(',begin);
assert.ok(begin>0&&end>begin,'exact-history selection function must exist');
const match=vm.runInNewContext(source.slice(begin,end)+'\nconfirmedHistoryResult');
const id='a'.repeat(32),participant='MIO-W-'+'b'.repeat(24),mode='通常';
const pending={drawId:id,mode},record={drawId:id,mode,ordinal:2,prize:'景品A',rarity:'SR',image:'https://example.invalid/a.png'};
const response=history=>({participantId:participant,history});
test('only one committed result from the same participant/draw/mode is recoverable',()=>{
 const r=match(response([record]),participant,pending);
 assert.equal(r.status,'confirmed');
 assert.equal(r.result.prize,'景品A');
 assert.equal(r.result.replayed,true);
 assert.equal(r.result.drawId,id);
});
test('a confirmed draw must not be mistaken for a missing one by wrong mode',()=>{
 const r=match(response([{...record,mode:'ラキフェス'}]),participant,pending);
 assert.equal(r.status,'conflict');
});
test('two rows sharing the same draw ID are never silently released',()=>{
 for(const second of [{...record},{...record,mode:'ラキフェス'}]){
  assert.equal(match(response([record,second]),participant,pending).status,'conflict');
 }
});
test('no committed row stays pending and invalid prize/ordinal is rejected',()=>{
 assert.equal(match(response([]),participant,pending).status,'missing');
 assert.equal(match(response([{...record,prize:'  '}]),participant,pending).status,'conflict');
 assert.equal(match(response([{...record,ordinal:0}]),participant,pending).status,'conflict');
 assert.equal(match(response([{...record,ordinal:'abc'}]),participant,pending).status,'conflict');
});
test('identity mismatch and malformed saved draw cannot restore another result',()=>{
 assert.equal(match(response([record]),'MIO-W-'+'c'.repeat(24),pending).status,'conflict');
 assert.equal(match(response([record]),participant,{drawId:'bad',mode}).status,'conflict');
 assert.equal(match(response([record]),participant,{drawId:id,mode:'unknown'}).status,'conflict');
});
test('normal catalog refresh re-displays committed result without issuing draw',()=>{
 const part=source.slice(end,source.indexOf('\nasync function execute(',end));
 assert.match(part,/confirmedHistoryResult\(h,participant,pending\)/);
 assert.match(part,/renderResult\(matched\.result\)/);
 assert.match(part,/forget\(\)/);
 assert.doesNotMatch(part,/post\(['"]\/api\/gacha['"],\s*\{action:'draw'/);
});
