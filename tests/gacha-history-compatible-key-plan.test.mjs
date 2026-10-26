/**
 * New-only regression for immutable duplicate keys matched to EXISTING
 * historical values. Uses source-controlled preview data and the REVIEW-ONLY
 * candidate; does not read live Sheets or any participant identifiers.
 *
 * Current real-world audit (2026-10-26), conducted separately, found all
 * 25 confirmed historical keys equal to their respective current prize name.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const plan=JSON.parse(readFileSync('gacha-ui/data/gacha-immutable-key-backfill-REVIEW-ONLY.json','utf8'));
const preview=JSON.parse(readFileSync('gacha-core/data/gacha-prizes-v2-preview.json','utf8')).prizes;
const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const proposals=plan.proposedEntries;
function counts(array,keyFn){const seen=new Map();for(const p of array){const k=keyFn(p);seen.set(k,(seen.get(k)||0)+1);}return seen}
test('plan never allows silent publication or rewriting the existing winning history',()=>{
 assert.match(plan.status,/REVIEW_ONLY_NOT_APPLIED/);
 assert.equal(plan.historicalWinningRowsAudited,25);
 assert.equal(plan.historicalKeysMatchingCurrentCatalogNames,25);
 assert.match(plan.migrationRisk,/SUPERSEDED/);
 assert.ok(plan.safetyNotes.some(s=>/NEVER replace|historical/i.test(s)));
});
test('all 27 planned keys equal the ORIGINAL exact prize names, not new IDs',()=>{
 assert.equal(proposals.length,27);
 for(const row of proposals){
  assert.equal(row.proposedImmutableKey,row.prizeName);
  assert.ok(!row.proposedImmutableKey.startsWith('MIO-GIFT-'));
  assert.equal(row.expectedCurrentKey,'');
 }
});
test('all preview prize IDs, modes, names and probabilities match proposals exactly',()=>{
 const byId=new Map(proposals.map(x=>[x.prizeId,x]));
 assert.equal(byId.size,27);
 for(const p of preview){
  const row=byId.get(p.id);
  assert.ok(row,'missing id '+p.id);
  assert.equal(row.mode,p.mode);
  assert.equal(row.prizeName,p.name);
  assert.equal(row.expectedProbability,p.probabilityPercent);
  assert.equal(row.expectedEnabled,p.enabled);
 }
});
test('cross-mode duplicate reward gets the exact same key in both entries',()=>{
 const groups=counts(proposals,p=>norm(p.proposedImmutableKey));
 assert.equal(groups.size,20);
 assert.equal([...groups.values()].filter(x=>x===2).length,7);
 assert.equal([...groups.values()].filter(x=>x!==1&&x!==2).length,0);
 const byName=new Map();
 for(const entry of proposals){
  const n=norm(entry.prizeName);
  if(!byName.has(n))byName.set(n,new Set());
  byName.get(n).add(entry.proposedImmutableKey);
 }
 assert.ok([...byName.values()].every(x=>x.size===1));
});
test('future display-name rename does not discard historical name-based dedup key',()=>{
 const first=proposals[0];
 const historicalKey=first.proposedImmutableKey;
 const renamedCatalog={...first,prizeName:'未来の新しい表示名',proposedImmutableKey:historicalKey};
 assert.notEqual(renamedCatalog.prizeName,first.prizeName);
 assert.equal(renamedCatalog.proposedImmutableKey,historicalKey);
 const confirmedHistoricalKey=first.prizeName;
 assert.equal(norm(confirmedHistoricalKey),norm(renamedCatalog.proposedImmutableKey));
});
