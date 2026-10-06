from pathlib import Path

src = Path('APPS_SCRIPT_Code_v1.8.7_NO_BACKUP.gs').read_text(encoding='utf-8')
out = src.replace('翠央1周年 統合修正版 v1.8.7 NO-BACKUP', '翠央1周年 統合修正版 v1.8.8 NO-DUPLICATES')
out = out.replace('Web参加者MIO-ID自動接続・端末復旧整合・皆勤2回制限・ラキフェス5回目制御', 'Web参加者MIO-ID自動接続・端末復旧整合・皆勤2回制限・ラキフェス5回目制御・ガチャ完全被りなし')

replacements = []
replacements.append((
"""    p.appendRow(['種類（通常/ラキフェス）','景品ID（重複不可）','景品名','レア度','確率（％・小数2桁まで）','有効','数量上限（空欄は制限なし）','景品画像URL（任意・HTTPS）','運営メモ']);
    p.setFrozenRows(1);
    p.getRange('A1:I1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
    p.getRange('A2:I101').setBackground('#fff2cc');""",
"""    p.appendRow(['種類（通常/ラキフェス）','景品ID（重複不可）','景品名','レア度','確率（％・小数2桁まで）','有効','数量上限（空欄は制限なし）','景品画像URL（任意・HTTPS）','運営メモ','被り判定キー（任意）']);
    p.setFrozenRows(1);
    p.getRange('A1:J1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
    p.getRange('A2:J101').setBackground('#fff2cc');"""))

replacements.append((
"""  p.getRange('A1:I1').setValues([['種類（通常/ラキフェス）','景品ID（重複不可）','景品名','レア度','確率（％・小数2桁まで）','有効','数量上限（空欄は制限なし）','景品画像URL（任意・HTTPS）','運営メモ']]);""",
"""  p.getRange('A1:J1').setValues([['種類（通常/ラキフェス）','景品ID（重複不可）','景品名','レア度','確率（％・小数2桁まで）','有効','数量上限（空欄は制限なし）','景品画像URL（任意・HTTPS）','運営メモ','被り判定キー（任意）']]);"""))

replacements.append((
"""  p.getRange('H1').setNote('数量上限に達すると抽選は安全のため停止します。確率の再配分などを運営で確認してください。');""",
"""  p.getRange('H1').setNote('数量上限に達すると抽選は安全のため停止します。確率の再配分などを運営で確認してください。');
  p.getRange('J1').setNote('同じ景品を通常/ラキフェスで別ID登録する場合だけ、同じ被り判定キーを設定してください。空欄時は景品名で被り判定します。');
  p.setColumnWidth(10,220);"""))

replacements.append((
"""  h.getRange('A1:M1').setValues([['抽選ID（変更不可）','Web参加ID','参加者ID','ColorSing名','種類','景品ID','景品名','確率（抽選時％）','抽選日時','通算何回目','結果','レア度（抽選時）','景品画像URL（抽選時）']]).setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');""",
"""  h.getRange('A1:N1').setValues([['抽選ID（変更不可）','Web参加ID','参加者ID','ColorSing名','種類','景品ID','景品名','確率（抽選時％）','抽選日時','通算何回目','結果','レア度（抽選時）','景品画像URL（抽選時）','被り判定キー（抽選時）']]).setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');"""))

for old, new in replacements:
    if old not in out:
        raise SystemExit('required setup block not found')
    out = out.replace(old, new, 1)

marker = """function draws_(ss,id){
  return rows_(ss,DRAW_TAB).filter(function(x){return id&&x[2]===id&&x[10]==='確定'});
}

"""
helpers = """function draws_(ss,id){
  return rows_(ss,DRAW_TAB).filter(function(x){return id&&x[2]===id&&x[10]==='確定'});
}

function normalizeDuplicateKey_(value){
  return String(value||'').trim().toLowerCase().replace(/\\s+/g,' ');
}

function prizeDuplicateKeyFromRow_(row){
  var explicit=String(row[9]||'').trim();
  return normalizeDuplicateKey_(explicit||row[2]||row[1]);
}

function wonDuplicateKeys_(ss,id){
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
if marker not in out:
    raise SystemExit('draws marker not found')
out = out.replace(marker, helpers, 1)

old = """    var image=String(x[7]||'').trim();

    if(!/^[A-Za-z0-9_-]{1,40}$/.test(String(x[1]||''))||ids[x[1]]||!String(x[2]||'').trim()||!Number.isFinite(chance)||chance<=0||chance>100||Math.abs(chance*100-units)>0.00001||stock!==null&&(!Number.isSafeInteger(stock)||stock<0)||image&&!/^https:\\/\\//i.test(image))valid=false;

    ids[x[1]]=true;
    total+=units;
    return {id:String(x[1]),name:String(x[2]),rarity:String(x[3]||''),chance:chance,units:units,stock:stock,image:image};"""
new = """    var image=String(x[7]||'').trim();
    var duplicateKey=prizeDuplicateKeyFromRow_(x);

    if(!/^[A-Za-z0-9_-]{1,40}$/.test(String(x[1]||''))||ids[x[1]]||!String(x[2]||'').trim()||!duplicateKey||!Number.isFinite(chance)||chance<=0||chance>100||Math.abs(chance*100-units)>0.00001||stock!==null&&(!Number.isSafeInteger(stock)||stock<0)||image&&!/^https:\\/\\//i.test(image))valid=false;

    ids[x[1]]=true;
    total+=units;
    return {id:String(x[1]),name:String(x[2]),rarity:String(x[3]||''),chance:chance,units:units,stock:stock,image:image,duplicateKey:duplicateKey};"""
if old not in out:
    raise SystemExit('catalog block not found')
out = out.replace(old, new, 1)

old = """  var c=d.mode==='通常'?normal:fest;
  if(!c.ready)return {ok:false,error:c.message};

  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.getUuid()+Utilities.getUuid());
  var random=0;
  for(var i=0;i<4;i++)random=random*256+((bytes[i]+256)%256);

  var point=Math.floor(random/4294967296*10000),sum=0,winner=null;
  for(var j=0;j<c.prizes.length;j++){
    sum+=c.prizes[j].units;
    if(point<sum){winner=c.prizes[j];break}
  }
  if(!winner)return {ok:false,error:'抽選設定を確認してください'};

  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),winner.chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image]);"""
new = """  var c=d.mode==='通常'?normal:fest;
  if(!c.ready)return {ok:false,error:c.message};

  var wonKeys=wonDuplicateKeys_(ss,id);
  var available=c.prizes.filter(function(p){return !wonKeys[p.duplicateKey]});
  if(!available.length)return {ok:false,error:'獲得可能な景品がありません。すべての対象景品を獲得済みです'};

  var availableUnits=available.reduce(function(sum,p){return sum+p.units},0);
  if(availableUnits<=0)return {ok:false,error:'抽選設定を確認してください'};

  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.getUuid()+Utilities.getUuid());
  var random=0;
  for(var i=0;i<4;i++)random=random*256+((bytes[i]+256)%256);

  var point=Math.floor(random/4294967296*availableUnits),sum=0,winner=null;
  for(var j=0;j<available.length;j++){
    sum+=available[j].units;
    if(point<sum){winner=available[j];break}
  }
  if(!winner)return {ok:false,error:'抽選設定を確認してください'};

  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),winner.chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image,winner.duplicateKey]);"""
if old not in out:
    raise SystemExit('draw block not found')
out = out.replace(old, new, 1)

Path('APPS_SCRIPT_Code_v1.8.8_NO_DUPLICATES.gs').write_text(out, encoding='utf-8')

Path('V1.8.8_GACHA_NO_DUPLICATES_HANDOFF.md').write_text('''# v1.8.8 ガチャ完全被りなし 追加更新\n\n- ベースは v1.8.7 NO-BACKUP。\n- ガチャは常時被りなし。ON/OFFは作らない。\n- 参加者ごとの確定当選履歴を取得済みとして扱う。\n- 通常/ラキフェスをまたいで同じ景品を再抽選しない。\n- 景品設定J列に任意の「被り判定キー」を追加。空欄時は景品名で判定。\n- 取得済み候補を除いた残りの元確率比で抽選。\n- 全候補取得済みなら重複させず停止。\n- 同じdrawIdの再送は既存結果を返す。\n- 当選履歴N列へ抽選時の被り判定キーを保存。\n- 二重保存機能は追加しない。\n- 本番適用はv1.8.7公開確認後の別更新として実施。\n''', encoding='utf-8')
