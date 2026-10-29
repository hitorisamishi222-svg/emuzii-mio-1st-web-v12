/**
 * MIOガチャ緊急管理 / 2026-10-29
 * 既存のスプレッドシート紐付け Apps Script に追加する独立ファイル。
 * 新規プロジェクト不要。公開 doPost やガチャ抽選機能は変更しない。
 * 初回のみ gachaRapidInstallMenu() を手動実行してメニューを設置。
 *
 * 安全性：2人のGoogle本人確認、Sheet編集権、document lock、
 * 既存MIO-IDの再利用、累計口数（絶対値）、変更前値の照合、
 * 個別承認ログ、抽選履歴の読み取り専用表示。
 */
var GACHA_RAPID_SHEET_ID='1WqkXSV_UehRdpO9VVqRAL9ZTVXwD_GxlH3Ey50uX3PM';
var GACHA_RAPID_EMUJI_EDITOR='rineyuuzi6@gmail.com';

function gachaRapidAdmin_(){
  var email=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(!email)throw new Error('Googleアカウントを確認できません。アカウントの権限を確認してください。');
  var file=DriveApp.getFileById(GACHA_RAPID_SHEET_ID);
  var owner=String(file.getOwner().getEmail()||'').trim().toLowerCase();
  var authorized=(email===owner||email===GACHA_RAPID_EMUJI_EDITOR);
  var permitted=email===owner||file.getEditors().some(function(editor){
    return String(editor.getEmail()||'').toLowerCase()===email;
  });
  if(!authorized||!permitted)throw new Error('管理者2人以外には操作権限がありません。');
  return {email:email,role:email===owner?'みお・シートオーナー':'えむじー・編集者'};
}
function gachaRapidInstallMenu(){
  gachaRapidAdmin_();
  var ss=SpreadsheetApp.openById(GACHA_RAPID_SHEET_ID);
  var triggers=ScriptApp.getProjectTriggers();
  if(!triggers.some(function(t){return t.getHandlerFunction()==='gachaRapidAddMenu';})){
    ScriptApp.newTrigger('gachaRapidAddMenu').forSpreadsheet(ss).onOpen().create();
  }
  gachaRapidAddMenu();
  return '緊急ガチャ管理メニューを追加しました。';
}
function gachaRapidAddMenu(){
  SpreadsheetApp.getUi().createMenu('🐳 緊急ガチャ管理')
  .addItem('管理画面を開く','gachaRapidOpen')
  .addToUi();
}
function gachaRapidOpen(){
  gachaRapidAdmin_();
  var html=HtmlService.createHtmlOutputFromFile('GachaRapidUI').setWidth(1100).setHeight(680);
  SpreadsheetApp.getUi().showModelessDialog(html,'🐳 10/30 ガチャ緊急管理');
}
function gachaRapidNameKey_(value){
  // A weaker visual variation is not proof of a second person. Stop, never auto-link.
  return String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
}
function gachaRapidRows_(sheet,columns,limit){
  if(!sheet)throw new Error('必要な管理タブがありません');
  var count=Math.min(Math.max(0,sheet.getLastRow()-1),limit);
  return count?sheet.getRange(2,1,count,columns).getValues():[];
}
function gachaRapidSnapshot(){
  var actor=gachaRapidAdmin_();
  var ss=SpreadsheetApp.openById(GACHA_RAPID_SHEET_ID);
  var people=gachaRapidRows_(ss.getSheetByName('emuzii_参加者'),2,499);
  var web=gachaRapidRows_(ss.getSheetByName('emuzii_Web登録'),21,499);
  var gacha=gachaRapidRows_(ss.getSheetByName('emuzii_ガチャ'),17,499);
  var draws=gachaRapidRows_(ss.getSheetByName('emuzii_当選履歴'),11,998);
  var admin=ss.getSheetByName('emuzii_管理画面');
  var masters=people.filter(function(p){return /^MIO-\d{4}$/.test(String(p[0]||''))&&p[1];}).map(function(p){return {id:p[0],name:String(p[1])};});
  var rights=gacha.filter(function(r){return /^MIO-\d{4}$/.test(String(r[0]||''))&&r[1];}).map(function(r){
    return {id:String(r[0]),name:String(r[1]),m1:Number(r[2])||0,m3:Number(r[3])||0,total:Number(r[5])||0,remaining:Number(r[7])||0,check:String(r[12])};
  });
  var registrations=web.filter(function(r){return /^MIO-W-[a-f0-9]{24}$/.test(String(r[0]||''));}).map(function(r){
    return {webId:String(r[0]),name:String(r[2]||''),approval:String(r[5]||''),membership:String(r[6]||''),masterId:String(r[7]||''),identity:String(r[11]||''),device:String(r[13]||'')};
  });
  // Token hash (Web B列) を絶対に返さない。
  var history=draws.filter(function(r){return r[0]&&r[2];}).map(function(r){
    var date=r[8] instanceof Date?r[8].toISOString():String(r[8]||'');
    return {name:String(r[3]||''),id:String(r[2]),mode:String(r[4]||''),prize:String(r[6]||''),date:date,result:String(r[10]||'')};
  });
  history.sort(function(a,b){return b.date.localeCompare(a.date);});
  var normal=admin.getRange('B141').getValue()===true,fest=admin.getRange('B142').getValue()===true;
  return {ok:true,actor:actor.role,normalOpen:normal,festOpen:fest,masters:masters,registrations:registrations,rights:rights,history:history.slice(0,450)};
}
function gachaRapidApproveAndGrant(req){
  var actor=gachaRapidAdmin_();
  if(!req||req.verified!==true)throw new Error('管理者の本人確認チェックが必要です');
  var webId=String(req.webId||''),targetId=String(req.targetId||''),expectedName=String(req.name||'');
  if(!/^MIO-W-[a-f0-9]{24}$/.test(webId)||!expectedName||expectedName.length>40)throw new Error('登録申請を選択してください');
  if(!(targetId==='NEW'||/^MIO-\d{4}$/.test(targetId)))throw new Error('MIO-IDを選び直してください');
  var m1=Number(req.m1),m3=Number(req.m3),old1=Number(req.expectedM1),old3=Number(req.expectedM3);
  if(![m1,m3,old1,old3].every(function(n){return Number.isSafeInteger(n)&&n>=0&&n<=50;}))throw new Error('口数は0〜50の整数で入力してください');
  if(m1+3*m3<1||m1+3*m3>100)throw new Error('口数が不正です');
  if(m1<old1||m3<old3)throw new Error('付与数の減少は、この画面ではできません');
  var lock=LockService.getDocumentLock()||LockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error('別の管理者が操作中です。読み直してください');
  try{
    var ss=SpreadsheetApp.openById(GACHA_RAPID_SHEET_ID);
    var web=ss.getSheetByName('emuzii_Web登録'),people=ss.getSheetByName('emuzii_参加者'),gacha=ss.getSheetByName('emuzii_ガチャ');
    if(!web||!people||!gacha)throw new Error('登録・ガチャ台帳の連携を確認できません');
    var webs=gachaRapidRows_(web,21,499),found=[];
    webs.forEach(function(w,i){if(w[0]===webId)found.push({row:i+2,data:w});});
    if(found.length!==1)throw new Error('Web登録IDが不明または重複しています');
    var wd=found[0].data,webRow=found[0].row,name=String(wd[2]||'');
    // Stop placeholder Web IDs posing as ColorSing names: these rows are recovery candidates, not verified people.
    if(/^MIO-(?:W-|\d{4}$)/i.test(name)||!String(wd[1]||'').match(/^[a-f0-9]{64}$/i))throw new Error('ColorSing名または端末認証の登録を確認できません。本人確認してください');
    if(name!==expectedName)throw new Error('登録名が変更されています。再読み込みしてください');
    if(!/^[^=+@-][^\x00-\x1f]{0,39}$/.test(name))throw new Error('登録名の記号を管理者が確認してください');
    if(wd[5]!=='承認待ち'&&wd[5]!=='承認済み')throw new Error('登録状態を確認してください');
    if(String(wd[16]||'')==='旧端末'||String(wd[13]||'').indexOf('旧端末')>=0)throw new Error('旧端末の登録です。端末切替承認を別途確認してください');
    if(wd[5]==='承認済み'&&String(wd[7]||'')!==targetId)throw new Error('承認済みの参加者IDを変更できません');
    var rows=gachaRapidRows_(people,2,499),same=rows.map(function(r,i){return {row:i+2,id:r[0],name:r[1]};}).filter(function(x){return x.name===name;});
    if(same.length>1)throw new Error('同名参加者が複数います。本人照合後に元台帳で整理してください');
    var targetRow,master;
    if(targetId==='NEW'){
      if(rows.some(function(r){return r[1]&&gachaRapidNameKey_(r[1])===gachaRapidNameKey_(name);}))
        throw new Error('同名・類似名の既存MIO-ID候補があります。新規発行せず本人確認してください');
      if(wd[7]||(wd[10]&&wd[10]!==webId))throw new Error('既存のMIO-ID候補があり、新規作成できません');
      for(var i=0;i<rows.length;i++){if(!rows[i][1]){targetRow=i+2;break;}}
      if(!targetRow)throw new Error('参加者台帳に空行がありません');
      var idCell=people.getRange(targetRow,1),gachaId=gacha.getRange(targetRow,1);
      if(!idCell.getFormula()||!gachaId.getFormula())throw new Error('新規ID用の連携式がありません');
      master='MIO-'+('0000'+(targetRow-1)).slice(-4);
      var idValues=rows.filter(function(r){return r[0]===master;});
      if(idValues.length)throw new Error('MIO-ID重複の可能性があります');
    }else{
      master=targetId;
      var match=rows.map(function(r,i){return {row:i+2,id:r[0],name:r[1]};}).filter(function(x){return x.id===master&&x.name===name;});
      if(match.length!==1)throw new Error('登録名とMIO-IDが一致しません。管理者照合が必要です');
      targetRow=match[0].row;
      if(wd[7]&&wd[7]!==master)throw new Error('Web登録に別のMIO-IDが設定されています');
      if(wd[10]&&wd[10]!==master&&!(wd[5]==='承認待ち'&&wd[10]===webId))throw new Error('Web統合IDが一致しません');
    }
    var g=gacha.getRange(targetRow,1,1,17).getValues()[0];
    if(targetId==='NEW'){
      // A blank nickname is not proof that the destination is unused. Preserve orphaned data.
      var leftover=people.getRange(targetRow,3,1,7).getValues()[0];
      if(leftover.some(function(v){return v!==''&&v!==null&&v!==undefined;}))
        throw new Error('新規参加者行に過去の記録があります。上書きせず確認してください');
      var controlled=[2,3,4,6,9,14,15]; // C/D/E, G, J, O/P: purchased, used and bonus rights
      if(g[0]||g[1]||controlled.some(function(i){return g[i]!==''&&g[i]!==null&&g[i]!==undefined&&Number(g[i])!==0;}))
        throw new Error('新規作成先のガチャ行に既存の回数・履歴があります');
    }
    if(targetId!=='NEW'&&(g[0]!==master||g[1]!==name))throw new Error('ガチャ台帳のIDまたは名前が一致しません');
    if(Number(g[2])!==old1||Number(g[3])!==old3)throw new Error('別の管理者が口数を変更しました。再読み込みしてください');
    if(m1<Number(g[2])||m3<Number(g[3]))throw new Error('既存の口数は減らせません');
    if(webs.some(function(w){return w[0]!==webId&&gachaRapidNameKey_(w[2])===gachaRapidNameKey_(name)&&w[5]==='承認済み'&&w[7]&&w[7]!==master;}))throw new Error('同名・類似名の別IDが承認済みです。本人確認をやり直してください');
    // All safety checks complete. Keep prizes, draws, participation and check-in data untouched.
    if(targetId==='NEW'){
      people.getRange(targetRow,2).setValue(name);
      SpreadsheetApp.flush();
      if(String(people.getRange(targetRow,1).getDisplayValue())!==master||String(gacha.getRange(targetRow,2).getDisplayValue())!==name)
        throw new Error('参加者ID作成後の連携に失敗しました。操作を繰り返さず管理者に確認してください');
    }
    // Absolute cumulative counts make identical resubmissions idempotent.
    if(m1!==old1)gacha.getRange(targetRow,3).setValue(m1);
    if(m3!==old3)gacha.getRange(targetRow,4).setValue(m3);
    web.getRange(webRow,8).setValue(master); // H: participant ID
    web.getRange(webRow,11).setValue(master); // K: unified participant ID
    web.getRange(webRow,12).setValue('確認済み');
    web.getRange(webRow,13).setValue(new Date());
    web.getRange(webRow,7).setValue('確認済み'); // G: membership confirmed
    if(String(wd[16]||'')!=='使用中')web.getRange(webRow,17).setValue('使用中'); // Q: verified active browser
    web.getRange(webRow,6).setValue('承認済み'); // F: approval
    SpreadsheetApp.flush();
    var a=web.getRange(webRow,1,1,20).getDisplayValues()[0];
    var b=gacha.getRange(targetRow,1,1,14).getDisplayValues()[0];
    if(a[5]!=='承認済み'||a[6]!=='確認済み'||a[7]!==master||a[10]!==master||a[11]!=='確認済み'||
       b[0]!==master||b[1]!==name||Number(b[2])!==m1||Number(b[3])!==m3||b[12]!=='OK'||b[13]!=='OK')
      throw new Error('一部反映が未完了です。二重に付与せず台帳を確認してください');
    var audit=ss.getSheetByName('emuzii_ガチャ緊急操作履歴');
    if(!audit){audit=ss.insertSheet('emuzii_ガチャ緊急操作履歴');audit.getRange(1,1,1,9).setValues([['日時','管理者','Web登録ID','参加者ID','ColorSing名','1ヶ月型(最終累計)','3ヶ月型(最終累計)','新規ID','操作']]);audit.setFrozenRows(1);}
    audit.appendRow([new Date(),actor.email,webId,master,name,m1,m3,targetId==='NEW'?'はい':'いいえ','本人確認・承認・累計口数確認']);
    var finalTotal=Number(gacha.getRange(targetRow,6).getValue());
    var finalRemaining=Number(gacha.getRange(targetRow,8).getValue());
    return {ok:true,name:name,masterId:master,m1:m1,m3:m3,rights:m1+3*m3,purchasedDraws:m1+3*m3,totalRights:finalTotal,remaining:finalRemaining,openChanged:false};
  }finally{lock.releaseLock();}
}