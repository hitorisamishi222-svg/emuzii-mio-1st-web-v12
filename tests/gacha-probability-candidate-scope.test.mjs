import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('GAS candidate changes only approved display odds, per-prize stock and history odds',()=>{
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
  const oldBlock="  if(!winner)return {ok:false,error:'抽選設定を確認してください'};\n\n  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),winner.chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image,winner.duplicateKey]);";
  const newBlock="  if(!winner)return {ok:false,error:'抽選設定を確認してください'};\n\n  // The history column is the probability AT THE TIME OF THIS DRAW,\n  // not the original prize setting before previous winnings are removed.\n  // Reuse the participant-specific, exactly-100%-apportioned catalog computed\n  // above, while keeping the weighted winner selection completely unchanged.\n  var adjusted=(d.mode==='通常'?participantNormal:participantFest).prizes.filter(function(p){return p.id===winner.id});\n  if(adjusted.length!==1||!Number.isFinite(adjusted[0].chance))return {ok:false,error:'当選確率の記録を確認できません'};\n\n  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),adjusted[0].chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image,winner.duplicateKey]);";
  assert.ok(protectedSuffix.includes(oldBlock),'legacy history persistence guard must exist');
  const oldStock = String.raw`  var history=rows_(ss,DRAW_TAB);
  var exhausted=prizes.some(function(p){return p.stock!==null&&history.filter(function(x){return x[5]===p.id&&x[10]==='確定'}).length>=p.stock});

  return {ready:valid&&!exhausted,message:!valid?'景品と確率を設定中です（有効な景品の確率合計は100％）':exhausted?'数量上限に達した景品があります。運営の設定更新をお待ちください':'抽選できます',total:total/100,prizes:prizes};`;
  const newStock = String.raw`  var history=rows_(ss,DRAW_TAB);
  // Global quantity limits are per prize ID, not a switch for the entire
  // mode. Keep valid 100% source odds, exclude depleted IDs, then allow
  // participantCatalog_ to normalize remaining draw weights accurately.
  var wonStock={};
  history.forEach(function(row){
    if(row[10]!=='確定')return;
    var prizeId=String(row[5]||'');
    wonStock[prizeId]=(wonStock[prizeId]||0)+1;
  });
  var inStock=prizes.filter(function(p){
    return p.stock===null||wonStock[p.id]<p.stock;
  });

  return {ready:valid&&inStock.length>0,
    message:!valid?'景品と確率を設定中です（有効な景品の確率合計は100％）':
      !inStock.length?'対象景品はすべて在庫上限です。運営の設定更新をお待ちください':'抽選できます',
    total:inStock.length?100:0,prizes:inStock};`;
  assert.ok(protectedSuffix.includes(oldStock),'legacy global stock gate is known');
  const scopedSuffix=protectedSuffix.replace(oldBlock,newBlock).replace(oldStock,newStock);
  assert.equal(candidate.slice(y),scopedSuffix,
    'only the reviewed effective-probability history write may differ after the catalog function');
  assert.notEqual(candidate.slice(b,y),protectedSource.slice(a,x),'candidate must have one explicit scoped change');
  assert.match(candidate.slice(b,y),/scaled=p\.units\*10000/);
  assert.match(candidate.slice(b,y),/left=10000-shares\.reduce/);
});
