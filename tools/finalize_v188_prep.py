from pathlib import Path

core_path=Path('APPS_SCRIPT_Code_v1.8.8_NO_DUPLICATES.gs')
core=core_path.read_text(encoding='utf-8')

marker="""function wonDuplicateKeys_(ss,id){
  var catalogRows=rows_(ss,PRIZE_TAB),byPrizeId={};
  catalogRows.forEach(function(row){
    var prizeId=String(row[1]||'');
    if(prizeId)byPrizeId[prizeId]=prizeDuplicateKeyFromRow_(row);
  });

  var won={};
  draws_(ss,id).forEach(function(row){
    var stored=String(row[13]||'').trim();
    var key=normalizeDuplicateKey_(stored)||byPrizeId[String(row[5]||'')]||normalizeDuplicateKey_(row[6]||row[5]);
    if(key)won[key]=true;
  });
  return won;
}

"""
addition=marker+"""function participantCatalog_(catalog,wonKeys){
  var available=(catalog.prizes||[]).filter(function(p){return !wonKeys[p.duplicateKey]});
  var units=available.reduce(function(sum,p){return sum+p.units},0);
  var prizes=available.map(function(p){
    var effective=units>0?Math.round((p.units/units)*10000)/100:0;
    return {id:p.id,name:p.name,rarity:p.rarity,chance:effective,stock:p.stock,image:p.image,duplicateKey:p.duplicateKey};
  });
  return {
    ready:catalog.ready&&available.length>0,
    message:!catalog.ready?catalog.message:available.length?'抽選できます（取得済み景品は除外済み）':'対象景品をすべて獲得済みです',
    total:available.length?100:0,
    prizes:prizes
  };
}

"""
if marker not in core:
    raise SystemExit('wonDuplicateKeys marker not found')
core=core.replace(marker,addition,1)

old="""  var festEntitled=total>=festAvailableFrom;
  var festUnlocked=festEntitled&&history.length>=festAvailableFrom-1&&remaining>0;
  var gate=gachaOpenState_(ss);

  if(d.action==='catalog')return {ok:true,participantId:r[0],confirmed:confirmed,remaining:confirmed?remaining:0,used:used,nextOrdinal:used+1,festEntitled:festEntitled,festUnlocked:festUnlocked,festAvailableFrom:festAvailableFrom,webDrawsUsed:history.length,normalOpen:gate.normalOpen,festOpen:gate.festOpen,normal:normal,fest:fest};
"""
new="""  var festEntitled=total>=festAvailableFrom;
  var festUnlocked=festEntitled&&history.length>=festAvailableFrom-1&&remaining>0;
  var gate=typeof gachaOpenState_==='function'?gachaOpenState_(ss):{normalOpen:false,festOpen:false};
  var wonKeys=wonDuplicateKeys_(ss,id);
  var participantNormal=participantCatalog_(normal,wonKeys),participantFest=participantCatalog_(fest,wonKeys);

  if(d.action==='catalog')return {ok:true,participantId:r[0],confirmed:confirmed,remaining:confirmed?remaining:0,used:used,nextOrdinal:used+1,festEntitled:festEntitled,festUnlocked:festUnlocked,festAvailableFrom:festAvailableFrom,webDrawsUsed:history.length,normalOpen:gate.normalOpen,festOpen:gate.festOpen,normal:participantNormal,fest:participantFest};
"""
if old not in core:
    raise SystemExit('gacha catalog block not found')
core=core.replace(old,new,1)

old="""  var wonKeys=wonDuplicateKeys_(ss,id);
  var available=c.prizes.filter(function(p){return !wonKeys[p.duplicateKey]});
"""
new="""  var available=c.prizes.filter(function(p){return !wonKeys[p.duplicateKey]});
"""
if old not in core:
    raise SystemExit('duplicate wonKeys declaration not found')
core=core.replace(old,new,1)
core_path.write_text(core,encoding='utf-8')

admin_path=Path('APPS_SCRIPT_GachaAdmin_v1.8.8.gs')
admin=admin_path.read_text(encoding='utf-8')
admin=admin.replace("var specialCell=null,before=0,changed=false;","var specialCell=null,before=0,changed=false,historySaved=false;",1)
old="""    history.appendRow([new Date(),id,safeText_(name),amount,safeText_(reason),before,after,total,remaining]);

    admin.getRange(GACHA_GRANT_AMOUNT).clearContent();"""
new="""    history.appendRow([new Date(),id,safeText_(name),amount,safeText_(reason),before,after,total,remaining]);
    historySaved=true;

    admin.getRange(GACHA_GRANT_AMOUNT).clearContent();"""
if old not in admin:
    raise SystemExit('history append block not found')
admin=admin.replace(old,new,1)
admin=admin.replace("if(changed&&specialCell){","if(changed&&!historySaved&&specialCell){",1)
admin_path.write_text(admin,encoding='utf-8')

handoff_path=Path('V1.8.8_GACHA_ADMIN_PREP_HANDOFF.md')
handoff=handoff_path.read_text(encoding='utf-8')
needle='- 取得済み候補を除いた残りの元確率比で抽選する。\n'
if needle in handoff and '景品一覧も取得済みを除外' not in handoff:
    handoff=handoff.replace(needle,needle+'- リスナーの景品一覧も取得済みを除外し、残り候補の実効確率を表示する。\n',1)
    handoff=handoff.replace('12. 付与履歴の保存に失敗した場合は、特別付与数を変更前へ戻す。','12. 付与履歴の保存に失敗した場合は、特別付与数を変更前へ戻す。履歴保存後の画面更新エラーでは付与を巻き戻さない。',1)
handoff_path.write_text(handoff,encoding='utf-8')
