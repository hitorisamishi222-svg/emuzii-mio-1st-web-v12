import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('candidate changes only per-user catalog, odds display, and historical win odds',()=>{
  const baseline=readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs',import.meta.url),'utf8');
  const staged=readFileSync(new URL('../release-prep/gacha-probability-display-v191-candidate.gs',import.meta.url),'utf8');
  assert.match(staged,/DEVELOPMENT CANDIDATE ONLY/);
  const header='/**\n * 翠央1周年';
  const at=staged.indexOf(header);
  assert.ok(at>=0);
  const candidate=staged.slice(at);

  const participant='function participantCatalog_(catalog,wonKeys){';
  const catalog='function catalog_(ss,mode){';
  const draw='function gachaAction_(ss,r,d){';
  const b1=baseline.indexOf(participant),c1=candidate.indexOf(participant);
  const b2=baseline.indexOf(catalog,b1),c2=candidate.indexOf(catalog,c1);
  const b3=baseline.indexOf(draw,b2),c3=candidate.indexOf(draw,c2);
  assert.ok([b1,b2,b3,c1,c2,c3].every(x=>x>=0));
  assert.equal(candidate.slice(0,c1),baseline.slice(0,b1),
    'registration, attendance and all other GAS features are unchanged');

  const pct=candidate.slice(c1,c2);
  assert.match(pct,/available=.*filter\(function\(p\)\{return !wonKeys\[p\.duplicateKey\]/);
  assert.match(pct,/scaled=p\.units\*10000/);
  assert.match(pct,/safetyRevision:'mio-crossmode-nodup-v1'/);
  assert.doesNotMatch(pct,/\bstock\b|wonStock|inStock/i);

  const prizes=candidate.slice(c2,c3);
  assert.match(prizes,/Each prize may be won once PER PARTICIPANT/);
  assert.match(prizes,/duplicateKey:duplicateKey/);
  assert.doesNotMatch(prizes,/\bstock\b|wonStock|inStock|history=rows_\(ss,DRAW_TAB\)/i,
    'other participants must never deplete this participant\'s prize pool');

  const oldBlock="  if(!winner)return {ok:false,error:'抽選設定を確認してください'};\n\n  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),winner.chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image,winner.duplicateKey]);";
  const newBlock="  if(!winner)return {ok:false,error:'抽選設定を確認してください'};\n\n  // The history column is the probability AT THE TIME OF THIS DRAW,\n  // not the original prize setting before previous winnings are removed.\n  // Reuse the participant-specific, exactly-100%-apportioned catalog computed\n  // above, while keeping the weighted winner selection completely unchanged.\n  var adjusted=(d.mode==='通常'?participantNormal:participantFest).prizes.filter(function(p){return p.id===winner.id});\n  if(adjusted.length!==1||!Number.isFinite(adjusted[0].chance))return {ok:false,error:'当選確率の記録を確認できません'};\n\n  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),adjusted[0].chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image,winner.duplicateKey]);";
  assert.ok(baseline.slice(b3).includes(oldBlock));
  assert.equal(candidate.slice(c3),baseline.slice(b3).replace(oldBlock,newBlock),
    'GAS draw, idempotency, locks, registration and historical write path unchanged except recorded odds');
});
