import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('probability candidate changes only participantCatalog_; protected GAS source is untouched',()=>{
  const protectedSource=readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs',import.meta.url),'utf8');
  const staged=readFileSync(new URL('../release-prep/gacha-probability-display-v191-candidate.gs',import.meta.url),'utf8');

  assert.match(staged,/DEVELOPMENT CANDIDATE ONLY/);
  const sourceHeader='/**\n * 翠央1周年';
  const i=staged.indexOf(sourceHeader);
  assert.ok(i>=0,'original GAS source must remain embedded after candidate header');
  const candidate=staged.slice(i);

  const functionHead='function participantCatalog_(catalog,wonKeys){';
  const nextFunction='\nfunction catalog_(ss,mode){';
  const a=protectedSource.indexOf(functionHead), b=candidate.indexOf(functionHead);
  const x=protectedSource.indexOf(nextFunction,a),y=candidate.indexOf(nextFunction,b);
  assert.ok([a,b,x,y].every(n=>n>=0),'both sources must contain the isolated function');
  assert.equal(candidate.slice(0,b),protectedSource.slice(0,a),'everything before the gacha function must be identical');
  // The candidate has exactly one additional, reviewed change in the draw
  // history field: winner.chance -> effective chance of the available pool.
  // Reconstruct the candidate suffix from the protected baseline; any
  // unreviewed change elsewhere must fail this scope guard.
  const protectedSuffix=protectedSource.slice(x);
  const oldBlock="  if(!winner)return {ok:false,error:'抽選設定を確認してください'};\\n\\n  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),winner.chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image,winner.duplicateKey]);";
  const newBlock="  if(!winner)return {ok:false,error:'抽選設定を確認してください'};\\n\\n  // The history column is the probability AT THE TIME OF THIS DRAW,\\n  // not the original prize setting before previous winnings are removed.\\n  // Reuse the participant-specific, exactly-100%-apportioned catalog computed\\n  // above, while keeping the weighted winner selection completely unchanged.\\n  var adjusted=(d.mode==='通常'?participantNormal:participantFest).prizes.filter(function(p){return p.id===winner.id});\\n  if(adjusted.length!==1||!Number.isFinite(adjusted[0].chance))return {ok:false,error:'当選確率の記録を確認できません'};\\n\\n  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),adjusted[0].chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image,winner.duplicateKey]);";
  assert.ok(protectedSuffix.includes(oldBlock),'legacy history persistence guard must exist');
  assert.equal(candidate.slice(y),protectedSuffix.replace(oldBlock,newBlock),
    'only the reviewed effective-probability history write may differ after the catalog function');
  assert.notEqual(candidate.slice(b,y),protectedSource.slice(a,x),'candidate must have one explicit scoped change');
  assert.match(candidate.slice(b,y),/scaled=p\.units\*10000/);
  assert.match(candidate.slice(b,y),/left=10000-shares\.reduce/);
});
