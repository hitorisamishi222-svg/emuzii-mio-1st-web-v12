/**
 * 翠央1周年 統合修正版 v1.8.7
 * Web参加者MIO-ID自動接続・端末復旧整合・皆勤2回制限・ラキフェス5回目制御・第二保存
 * 名前・回答・画像URLは匿名の公開APIへ出さない。
 * Vercelサーバーのsecretと端末用tokenHashを両方確認。
 * 既存スプレッドシート紐付けApps Scriptへ適用し、新規Apps Scriptプロジェクトは作らない。
 */
var SHEET_ID = '1WqkXSV_UehRdpO9VVqRAL9ZTVXwD_GxlH3Ey50uX3PM';
var WEB_TAB = 'emuzii_Web登録';
var CHECKIN_MAX_ATTEMPTS = 2;

var SECONDARY_SHEET_ID = '1rEInhrjUOhBajdq-6uOqdIQ5-8VFguutgdmfK9iVa6w';
var BACKUP_LOG_TAB = 'emuzii_バックアップ履歴';
var BACKUP_SWEEP_MINUTES = 5;
var BACKUP_MIRROR_TABS = [
  'フォームの回答 1','フォームの回答 2','フォームの回答 3',
  'emuzii_景品設定','emuzii_当選履歴','emuzii_Web登録','emuzii_参加者',
  'emuzii_管理画面','emuzii_皆勤31日','emuzii_予想ランキング','emuzii_FA',
  'emuzii_ガチャ','emuzii_景品集計','emuzii_統合進捗','emuzii_公開用',
  'emuzii_個人進捗','emuzii_スマホ表示'
];

function checkinAttemptKey_(participantId,day){return 'CHECKIN_ATTEMPTS:'+String(participantId)+':'+String(day)}
function checkinAttempts_(participantId,day){return Number(PropertiesService.getScriptProperties().getProperty(checkinAttemptKey_(participantId,day))||0)}
function setCheckinAttempts_(participantId,day,count){PropertiesService.getScriptProperties().setProperty(checkinAttemptKey_(participantId,day),String(count))}
function lockedCheckinDays_(participantId){var out=[];for(var d=1;d<=31;d++)if(checkinAttempts_(participantId,d)>=CHECKIN_MAX_ATTEMPTS)out.push(d);return out}

function setup() {
  setupGacha_();
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var sheet=ss.getSheetByName(WEB_TAB);
  if(!sheet) {
    sheet=ss.insertSheet(WEB_TAB);
    sheet.appendRow(['Web参加ID','認証ハッシュ（変更不可）','ColorSing名','メンシプ申告','登録日時','登録承認','メンシプ確認','照合参加者ID','運営メモ','名前照合状態','統合参加者ID','みお確認','確認日時']);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:I1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
    sheet.getRange('F2:F500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['承認待ち','承認済み','却下'],true).setAllowInvalid(false).build());
    sheet.getRange('G2:G500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['未確認','確認済み'],true).setAllowInvalid(false).build());
    sheet.getRange('E2:E500').setNumberFormat('yyyy/mm/dd hh:mm:ss');
    sheet.setColumnWidth(3,180);sheet.setColumnWidth(8,160);sheet.setColumnWidth(9,260);
  }
  var props=PropertiesService.getScriptProperties();
  if(!props.getProperty('BRIDGE_SECRET'))props.setProperty('BRIDGE_SECRET',Utilities.getUuid()+Utilities.getUuid());
  ensureWebDerivedExisting_(ss);
  setupBackupV187_();
}

function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)}
function equal_(a,b){a=String(a||'');b=String(b||'');var diff=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
function rows_(ss,name){var sh=ss.getSheetByName(name);return sh&&sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues():[]}
function safeText_(text){return /^[=+\-@]/.test(String(text||''))?"'"+text:text}
function jstYmd_(date){if(Utilities&&typeof Utilities.formatDate==='function')return Utilities.formatDate(date,'Asia/Tokyo','yyyy-MM-dd');var x=new Date(date.getTime()+9*60*60*1000);return x.toISOString().slice(0,10)}

function webActualLastRow_(web){
  var max=Math.max(web.getMaxRows(),2);
  var values=web.getRange(2,1,max-1,1).getDisplayValues();
  for(var i=values.length-1;i>=0;i--)if(String(values[i][0]||'').trim())return i+2;
  return 1;
}

function webActualRows_(web){
  var last=webActualLastRow_(web);
  if(last<2)return [];
  return web.getRange(2,1,last-1,Math.max(web.getLastColumn(),20)).getValues();
}

function webActualCount_(web){
  return webActualRows_(web).filter(function(r){return String(r[0]||'').trim()!==''}).length;
}

function ensureWebDerivedRow_(web,row){
  row=Number(row);
  if(!Number.isSafeInteger(row)||row<2)return;
  if(!String(web.getRange(row,1).getDisplayValue()||'').trim())return;

  web.getRange(row,14).setFormula('=IF(C'+row+'="","",IF(F'+row+'="却下","旧端末/無効",IF(COUNTIFS($C$2:$C$500,C'+row+',$F$2:$F$500,"承認済み")>1,"⚠複数端末承認",IF(AND(F'+row+'="承認待ち",P'+row+'<>""),"復旧候補",IF(F'+row+'="承認済み","利用中","確認待ち")))))');
  web.getRange(row,15).setFormula('=IF(C'+row+'="","",COUNTIF($C$2:$C$500,C'+row+'))');
  web.getRange(row,16).setFormula('=IF(C'+row+'="","",IFERROR(INDEX(\'emuzii_参加者\'!A:A,MATCH(C'+row+',\'emuzii_参加者\'!B:B,0)),IF(H'+row+'<>"",H'+row+',"")))');
  web.getRange(row,20).setFormula('=IF(C'+row+'="","",IF(F'+row+'="却下",IF(OR(H'+row+'="",AND(K'+row+'=H'+row+',OR(P'+row+'="",P'+row+'=H'+row+'))),"OK・却下","要確認"),IF(AND(H'+row+'<>"",K'+row+'=H'+row+',P'+row+'=H'+row+',L'+row+'="確認済み"),"OK",IF(AND(F'+row+'="承認待ち",P'+row+'<>""),"復旧候補","要確認"))))');

  var q=web.getRange(row,17);
  q.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['未指定','使用中','旧端末'],true).setAllowInvalid(false).build());
}

function ensureWebDerivedExisting_(ss){
  var web=ss.getSheetByName(WEB_TAB);
  if(!web)return;
  var last=webActualLastRow_(web);

  if(last>=2){
    for(var row=2;row<=last;row++){
      if(String(web.getRange(row,1).getDisplayValue()||'').trim())ensureWebDerivedRow_(web,row);
    }
  }

  var clearFrom=Math.max(last+1,2),clearTo=Math.min(500,web.getMaxRows());
  if(clearFrom<=clearTo){
    web.getRange(clearFrom,14,clearTo-clearFrom+1,3).clearContent();
    web.getRange(clearFrom,20,clearTo-clearFrom+1,1).clearContent();
  }
}

function webNextRow_(web){
  var next=webActualLastRow_(web)+1;
  if(next<2)next=2;
  if(next>500)return 0;
  return next;
}

function webIntegrityOk_(row){
  if(!row)return false;
  if(row[5]==='却下'||row[5]==='承認待ち')return true;
  if(row[5]!=='承認済み')return false;
  var h=String(row[7]||''),k=String(row[10]||''),p=String(row[15]||'');
  if(!h)return false;
  if(k&&k!==h)return false;
  if(p&&p!==h)return false;
  return row[11]==='確認済み';
}

function autoLinkWebParticipant_(ss,web,participantId,tokenHash,name){
  name=String(name||'').trim();
  if(!name)return '';
  var last=Math.max(webActualLastRow_(web),2);
  var values=last>=2?web.getRange(2,1,last-1,Math.max(web.getLastColumn(),20)).getValues():[];
  var row=0;
  for(var i=0;i<values.length;i++){
    if(values[i][0]===participantId&&equal_(values[i][1],tokenHash)){row=i+2;break}
  }
  if(!row)return '';

  var matched=[];
  for(var attempt=0;attempt<6;attempt++){
    SpreadsheetApp.flush();
    if(attempt>0)Utilities.sleep(150);
    matched=rows_(ss,'emuzii_参加者').filter(function(p){
      return p[1]===name&&/^MIO-\d{4}$/.test(String(p[0]||''));
    });
    if(matched.length===1)break;
  }

  if(matched.length===1){
    var id=String(matched[0][0]);
    var memo=String(web.getRange(row,9).getValue()||'');
    web.getRange(row,8).setValue(id);
    web.getRange(row,10).setValue('既存一致');
    web.getRange(row,11).setValue(id);
    web.getRange(row,9).setValue((memo?memo+'／':'')+'MIO-ID自動接続（'+id+'）・運営確認待ち');
    web.getRange(row,12).setValue('確認待ち');
    ensureWebDerivedRow_(web,row);
    SpreadsheetApp.flush();
    return id;
  }

  if(matched.length>1){
    web.getRange(row,10).setValue('重複要確認');
    web.getRange(row,12).setValue('確認待ち');
    ensureWebDerivedRow_(web,row);
    SpreadsheetApp.flush();
  }
  return '';
}

function doGet(){return json_({ok:false,error:'POST required'})}

function doPost(e) {
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))return json_({ok:false,error:'処理中です。少し待って再試行してください'});
  try {
    var d=JSON.parse(e.postData.contents||'{}');
    var secret=PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
    if(!secret||!equal_(d.secret,secret))return json_({ok:false,error:'unauthorized'});
    if(!/^MIO-W-[a-f0-9]{24}$/.test(d.participantId||'')||! /^[a-f0-9]{64}$/.test(d.tokenHash||''))return json_({ok:false,error:'invalid identity'});

    var ss=SpreadsheetApp.openById(SHEET_ID),web=ss.getSheetByName(WEB_TAB);
    if(!web)return json_({ok:false,error:'setup required'});

    var all=webActualRows_(web),found=all.filter(function(r){return r[0]===d.participantId});

    if(d.action==='register') {
      if(found.length) {
        if(!equal_(found[0][1],d.tokenHash))return json_({ok:false,error:'unauthorized'});
        var healedId=found[0][7]||autoLinkWebParticipant_(ss,web,d.participantId,d.tokenHash,found[0][2]);
        try{backupAfterWebMutation_(ss,d.participantId,found[0][2],'既存登録再照合',healedId?'MIO-ID確認済み':'照合待ち')}catch(ignore){}
        return json_({ok:true,verified:true,participantId:d.participantId,status:found[0][5],integratedParticipantId:healedId||''});
      }

      var name=String(d.name||'').trim();
      if(!name||name.length>40||/[\x00-\x1f]/.test(name))return json_({ok:false,error:'invalid name'});
      if(webActualCount_(web)>=499)return json_({ok:false,error:'登録上限です。運営に確認してください'});

      var duplicates=all.filter(function(r){return r[2]===name});
      var peopleByName=rows_(ss,'emuzii_参加者').filter(function(p){return p[1]===name});
      var linked=peopleByName.length===1?peopleByName[0][0]:'';
      var matchState=peopleByName.length>1?'重複要確認':peopleByName.length===1?'既存一致':'フォーム/Web新規';

      var newRow=webNextRow_(web);
      if(!newRow)return json_({ok:false,error:'登録上限です。運営に確認してください'});
      web.getRange(newRow,1,1,13).setValues([[d.participantId,d.tokenHash,safeText_(name),'申告なし',new Date(),'承認待ち','未確認',linked,duplicates.length?'同名Web登録あり・みお確認待ち':'',matchState,linked||d.participantId,'確認待ち','']]);
      ensureWebDerivedRow_(web,newRow);
      SpreadsheetApp.flush();

      if(!linked)linked=autoLinkWebParticipant_(ss,web,d.participantId,d.tokenHash,name);
      try{backupAfterWebMutation_(ss,d.participantId,name,'新規登録',linked?'既存MIO-IDへ接続':'運営照合待ち')}catch(ignore){}

      var saved=webActualRows_(web).filter(function(r){return r[0]===d.participantId&&equal_(r[1],d.tokenHash)});
      return json_({ok:saved.length===1,verified:saved.length===1,participantId:d.participantId,status:'承認待ち',integratedParticipantId:linked||''});
    }

    if(found.length===1&&equal_(found[0][1],d.tokenHash)&&!found[0][7]){
      var repairedId=autoLinkWebParticipant_(ss,web,d.participantId,d.tokenHash,found[0][2]);
      if(repairedId){
        try{backupAfterWebMutation_(ss,d.participantId,found[0][2],'MIO-ID自動修復',repairedId)}catch(ignore){}
        all=webActualRows_(web);
        found=all.filter(function(r){return r[0]===d.participantId});
      }
    }

    if(['status','catalog','draw','history','checkin'].indexOf(d.action)<0||found.length!==1||!equal_(found[0][1],d.tokenHash))return json_({ok:false,error:'unauthorized'});

    var r=found[0];
    if(!webIntegrityOk_(r))return json_({ok:false,error:'参加者IDの整合を運営が確認中です'});
    if(d.action==='checkin')return json_(checkinAction_(ss,r,d));
    if(d.action!=='status')return json_(gachaAction_(ss,r,d));

    var out={ok:true,participantId:r[0],name:r[2],status:r[5]};
    if(r[5]!=='承認済み')return json_(out);

    var person=rows_(ss,'emuzii_参加者').filter(function(p){return p[0]===r[7]&&p[1]===r[2]});
    if(r[7]&&person.length!==1)return json_({ok:false,error:'運営による参加者IDの照合が必要です'});
    var id=person.length?person[0][0]:'';

    var att=rows_(ss,'emuzii_皆勤31日').filter(function(p){return id&&p[0]===id&&p[1]===r[2]});
    var gacha=rows_(ss,'emuzii_ガチャ').filter(function(p){return id&&p[0]===id&&p[1]===r[2]});
    var g=gacha.length===1?gacha[0]:null,confirmed=r[6]==='確認済み';
    if(g&&(g[12]!=='OK'||g[13]!=='OK'))return json_({ok:false,error:'ガチャ回数に要確認の項目があります'});

    var fa=rows_(ss,'emuzii_FA').filter(function(p){return p[1]===r[2]&&p[10]==='受付'});
    var used=g?(Number(g[6])||0)+(Number(g[9])||0)+draws_(ss,id).length:0;
    if(g&&used>Number(g[5]))return json_({ok:false,error:'使用回数を運営が確認中です'});

    var attendanceDays=att.length===1?Number(att[0][33])||0:0;
    var attendanceConfirmedDays=[];
    if(att.length===1){
      for(var ad=1;ad<=31;ad++)if(att[0][ad+1]==='○')attendanceConfirmedDays.push(ad);
    }
    var attendanceLockedDays=id?lockedCheckinDays_(id).filter(function(x){return attendanceConfirmedDays.indexOf(x)<0;}):[];

    var today=jstYmd_(new Date());
    var day=Number(today.slice(8,10)),todayDone=attendanceConfirmedDays.indexOf(day)>=0&&today.slice(0,7)==='2026-10';
    var predictionAt=person.length&&person[0][2]?Utilities.formatDate(new Date(person[0][2]),'Asia/Tokyo','yyyy/MM/dd HH:mm'):'';

    var faSorted=fa.slice().sort(function(a,b){return new Date(a[3]).getTime()-new Date(b[3]).getTime()});
    var latestFa=faSorted.length?faSorted[faSorted.length-1]:null;
    var faLastAt=latestFa&&latestFa[3]?Utilities.formatDate(new Date(latestFa[3]),'Asia/Tokyo','yyyy/MM/dd HH:mm'):'';
    var faLatestStatus=latestFa?(String(latestFa[10]||'')+(latestFa[6]?'・'+String(latestFa[6]):'')):'';

    out.progress={
      prediction:!!(person.length&&person[0][2]),
      predictionAt:predictionAt,
      attendanceAchieved:attendanceDays>=31,
      attendanceTodayDone:todayDone,
      attendanceConfirmedDays:attendanceConfirmedDays,
      attendanceLockedDays:attendanceLockedDays,
      fa:fa.length,
      faLastAt:faLastAt,
      faLatestStatus:faLatestStatus,
      gacha:{
        confirmed:confirmed,
        total:confirmed&&g?Number(g[5])||0:0,
        used:confirmed&&g?(Number(g[6])||0)+(Number(g[9])||0)+draws_(ss,id).length:0,
        remaining:confirmed&&g?Number(g[5])-used:0
      }
    };
    return json_(out);
  } catch(err) {
    return json_({ok:false,error:'連携処理を完了できませんでした'});
  } finally {
    lock.releaseLock();
  }
}

function checkinAction_(ss,r,d){
  if(r[5]!=='承認済み')return {ok:false,error:'運営の登録承認をお待ちください'};
  var people=rows_(ss,'emuzii_参加者').filter(function(x){return x[0]===r[7]&&x[1]===r[2]});
  if(!r[7]||people.length!==1)return {ok:false,error:'運営による参加者IDの照合が必要です'};

  var keyword=String(d.keyword||'').trim();
  if(!keyword||keyword.length>40)return {ok:false,error:'今日の確認文字を入力してください'};

  var now=new Date(),ymd=jstYmd_(now);
  if(ymd<'2026-10-01'||ymd>'2026-10-31')return {ok:false,error:'皆勤賞の確認期間外です'};

  var day=Number(d.day);
  if(!isFinite(day)||day<1||day>31||Math.floor(day)!==day)return {ok:false,error:'10/1〜10/31の日付を選んでください'};

  var todayDay=Number(ymd.slice(8,10));
  if(day>todayDay)return {ok:false,error:'未来の日付はまだ入力できません'};

  var admin=ss.getSheetByName('emuzii_管理画面');
  var expected=String(admin.getRange(76+day,2).getDisplayValue()||'').trim();
  if(!expected)return {ok:false,error:'今日の確認文字はまだ設定されていません'};

  var sh=ss.getSheetByName('emuzii_皆勤31日');
  var values=sh.getRange(2,1,Math.max(sh.getLastRow()-1,1),2).getValues(),row=0;
  for(var i=0;i<values.length;i++)if(values[i][0]===r[7]&&values[i][1]===r[2]){row=i+2;break}
  if(!row)return {ok:false,error:'皆勤賞の参加者照合を確認してください'};

  var cell=sh.getRange(row,day+2);
  if(cell.getValue()==='○')return {ok:true,participantId:r[0],todayDone:true,already:true,message:'10/'+day+' はすでに確認済みです'};

  var attempts=checkinAttempts_(r[7],day);
  if(attempts>=CHECKIN_MAX_ATTEMPTS)return {ok:false,locked:true,attempts:attempts,error:'入力不可のためライバーにご連絡ください。'};

  if(!equal_(keyword,expected)){
    attempts++;
    setCheckinAttempts_(r[7],day,attempts);
    try{backupAfterParticipantMutation_(ss,r[7],r[2],'皆勤試行','10/'+day+' 誤入力'+attempts+'回目','残り入力回数 '+Math.max(CHECKIN_MAX_ATTEMPTS-attempts,0))}catch(ignore){}
    if(attempts>=CHECKIN_MAX_ATTEMPTS)return {ok:false,locked:true,attempts:attempts,error:'入力不可のためライバーにご連絡ください。'};
    return {ok:false,attempts:attempts,remainingAttempts:CHECKIN_MAX_ATTEMPTS-attempts,error:'確認文字が違います。入力できるのはあと1回です。'};
  }

  cell.setValue('○');
  SpreadsheetApp.flush();
  try{backupAfterParticipantMutation_(ss,r[7],r[2],'皆勤','10/'+day+'確認','確認文字一致')}catch(ignore){}
  return {ok:true,participantId:r[0],todayDone:true,message:'10/'+day+' の確認を受け付けました'};
}

var PRIZE_TAB='emuzii_景品設定',DRAW_TAB='emuzii_当選履歴';

function setupGacha_(){
  var ss=SpreadsheetApp.openById(SHEET_ID),p=ss.getSheetByName(PRIZE_TAB),h=ss.getSheetByName(DRAW_TAB);
  if(!p){
    p=ss.insertSheet(PRIZE_TAB);
    p.appendRow(['種類（通常/ラキフェス）','景品ID（重複不可）','景品名','レア度','確率（％・小数2桁まで）','有効','数量上限（空欄は制限なし）','景品画像URL（任意・HTTPS）','運営メモ']);
    p.setFrozenRows(1);
    p.getRange('A1:I1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
    p.getRange('A2:I101').setBackground('#fff2cc');
    p.getRange('A2:A101').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['通常','ラキフェス'],true).setAllowInvalid(false).build());
    p.getRange('F2:F101').insertCheckboxes();
    p.setColumnWidth(3,240);p.setColumnWidth(8,260);p.setColumnWidth(9,320);
  }

  p.getRange('A1:I1').setValues([['種類（通常/ラキフェス）','景品ID（重複不可）','景品名','レア度','確率（％・小数2桁まで）','有効','数量上限（空欄は制限なし）','景品画像URL（任意・HTTPS）','運営メモ']]);
  p.getRange('E2:E101').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0,100).setAllowInvalid(false).setHelpText('各種類ごとに有効景品の確率合計を100％にしてください。小数第2位まで。').build()).setNumberFormat('0.00');
  p.getRange('G2:G101').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).setHelpText('0以上の整数。空欄は数量制限なし。').build()).setNumberFormat('0');
  p.getRange('E1').setNote('通常・ラキフェスそれぞれで、有効な景品の確率合計を100％にしてください。小数第2位まで。未設定や合計の不一致がある間は抽選できません。');
  p.getRange('H1').setNote('数量上限に達すると抽選は安全のため停止します。確率の再配分などを運営で確認してください。');

  var g=ss.getSheetByName('emuzii_ガチャ');
  if(g){
    g.getRange('C1:Q1').setValues([['1ヶ月購入数','3ヶ月購入数','6ヶ月購入数','総ガチャ権利','通常ガチャ手動消費','総残り回数','ラキフェス対象','ラキフェス手動消費','ラキフェス利用可残り（Web4回完了後）','管理メモ','入力チェック','名前チェック','特別付与','Web確定抽選数','ラキフェス状態']]);
    g.getRange('O2:O500').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).setHelpText('運営が個別に追加するガチャ権利。0以上の整数。').build()).setNumberFormat('0');
    g.getRange('P2:Q500').clearDataValidations();

    var used="COUNTIFS('emuzii_当選履歴'!$C$2:$C,A2,'emuzii_当選履歴'!$K$2:$K,\"確定\")";
    var fest="COUNTIFS('emuzii_当選履歴'!$C$2:$C,A2,'emuzii_当選履歴'!$E$2:$E,\"ラキフェス\",'emuzii_当選履歴'!$K$2:$K,\"確定\")";

    for(var row=2;row<=500;row++){
      var rowUsed=used.replace(/A2/g,'A'+row),rowFest=fest.replace(/A2/g,'A'+row);
      g.getRange(row,6).setFormula('=IF(B'+row+'="","",C'+row+'*\'emuzii_管理画面\'!$B$20+D'+row+'*\'emuzii_管理画面\'!$B$21+E'+row+'*\'emuzii_管理画面\'!$B$22+O'+row+')');
      g.getRange(row,8).setFormula('=IF(B'+row+'="","",MAX(F'+row+'-G'+row+'-J'+row+'-'+rowUsed+',0))');
      g.getRange(row,9).setFormula('=IF(B'+row+'="","",IF(F'+row+'>=\'emuzii_管理画面\'!$B$23,1,0))');
      g.getRange(row,11).setFormula('=IF(B'+row+'="","",IF(AND(F'+row+'>=\'emuzii_管理画面\'!$B$23,'+rowUsed+'>=\'emuzii_管理画面\'!$B$23-1),MAX(H'+row+',0),0))');
      g.getRange(row,13).setFormula('=IF(B'+row+'="","",IF(OR(COUNT(C'+row+':E'+row+',G'+row+',J'+row+',O'+row+')<6,MIN(C'+row+':E'+row+',G'+row+',J'+row+',O'+row+')<0,C'+row+'<>INT(C'+row+'),D'+row+'<>INT(D'+row+'),E'+row+'<>INT(E'+row+'),G'+row+'<>INT(G'+row+'),J'+row+'<>INT(J'+row+'),O'+row+'<>INT(O'+row+'),G'+row+'+J'+row+'+'+rowUsed+'>F'+row+',AND(J'+row+'+'+rowFest+'>0,F'+row+'<\'emuzii_管理画面\'!$B$23)),"要確認","OK"))');
      g.getRange(row,14).setFormula('=IF(B'+row+'="","",IF(COUNTIF($B$2:$B$500,B'+row+')>1,"同名あり","OK"))');
      g.getRange(row,16).setFormula('=IF(B'+row+'="","",'+rowUsed+')');
      g.getRange(row,17).setFormula('=IF(B'+row+'="","",IF(F'+row+'<\'emuzii_管理画面\'!$B$23,"対象外",IF(P'+row+'>=\'emuzii_管理画面\'!$B$23-1,"解放","未解放")))');
    }
  }

  if(!h){
    h=ss.insertSheet(DRAW_TAB);
    h.setFrozenRows(1);
  }

  h.getRange('A1:M1').setValues([['抽選ID（変更不可）','Web参加ID','参加者ID','ColorSing名','種類','景品ID','景品名','確率（抽選時％）','抽選日時','通算何回目','結果','レア度（抽選時）','景品画像URL（抽選時）']]).setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
  h.getRange('I2:I1000').setNumberFormat('yyyy/mm/dd hh:mm:ss');
  h.setColumnWidth(12,120);h.setColumnWidth(13,260);
}

function draws_(ss,id){
  return rows_(ss,DRAW_TAB).filter(function(x){return id&&x[2]===id&&x[10]==='確定'});
}

function catalog_(ss,mode){
  var all=rows_(ss,PRIZE_TAB);
  var active=all.filter(function(x){return x[0]===mode&&x[5]===true});
  var ids={},total=0,valid=active.length>0;

  var prizes=active.map(function(x){
    var chance=Number(x[4]);
    var units=Math.round(chance*100);
    var stock=x[6]===''?null:Number(x[6]);
    var image=String(x[7]||'').trim();

    if(!/^[A-Za-z0-9_-]{1,40}$/.test(String(x[1]||''))||ids[x[1]]||!String(x[2]||'').trim()||!Number.isFinite(chance)||chance<=0||chance>100||Math.abs(chance*100-units)>0.00001||stock!==null&&(!Number.isSafeInteger(stock)||stock<0)||image&&!/^https:\/\//i.test(image))valid=false;

    ids[x[1]]=true;
    total+=units;
    return {id:String(x[1]),name:String(x[2]),rarity:String(x[3]||''),chance:chance,units:units,stock:stock,image:image};
  });

  prizes.forEach(function(p){if(all.filter(function(x){return String(x[1])===p.id}).length!==1)valid=false});
  if(total!==10000)valid=false;

  var history=rows_(ss,DRAW_TAB);
  var exhausted=prizes.some(function(p){return p.stock!==null&&history.filter(function(x){return x[5]===p.id&&x[10]==='確定'}).length>=p.stock});

  return {ready:valid&&!exhausted,message:!valid?'景品と確率を設定中です（有効な景品の確率合計は100％）':exhausted?'数量上限に達した景品があります。運営の設定更新をお待ちください':'抽選できます',total:total/100,prizes:prizes};
}

function gachaAction_(ss,r,d){
  if(r[5]!=='承認済み')return {ok:false,error:'運営の登録承認をお待ちください'};

  var people=rows_(ss,'emuzii_参加者').filter(function(x){return x[0]===r[7]&&x[1]===r[2]});
  if(!r[7]||people.length!==1)return {ok:false,error:'運営による参加者IDの照合が必要です'};

  var id=r[7];
  var history=draws_(ss,id);
  var publicHistory=history.map(function(x){return {drawId:x[0],mode:x[4],prize:x[6],date:x[8],ordinal:x[9],rarity:String(x[11]||''),image:String(x[12]||'')}});

  if(d.action==='history')return {ok:true,participantId:r[0],history:publicHistory.slice(-50).reverse()};

  var gs=rows_(ss,'emuzii_ガチャ').filter(function(x){return x[0]===id&&x[1]===r[2]});
  var g=gs.length===1?gs[0]:null;
  if(!g||g[12]!=='OK'||g[13]!=='OK')return {ok:false,error:'運営によるガチャ回数の確認が必要です'};

  var manual=Number(g[6])+Number(g[9]);
  var total=Number(g[5]);
  var used=manual+history.length;
  var remaining=total-used;
  var confirmed=r[6]==='確認済み';

  if(!Number.isSafeInteger(manual)||!Number.isSafeInteger(total)||manual<0||total<0||remaining<0)return {ok:false,error:'ガチャ回数を運営が確認中です'};

  var normal=catalog_(ss,'通常'),fest=catalog_(ss,'ラキフェス');
  var admin=ss.getSheetByName('emuzii_管理画面');
  var festAvailableFrom=admin?Number(admin.getRange('B23').getValue())||5:5;
  if(festAvailableFrom<1||Math.floor(festAvailableFrom)!==festAvailableFrom)festAvailableFrom=5;

  var festEntitled=total>=festAvailableFrom;
  var festUnlocked=festEntitled&&history.length>=festAvailableFrom-1&&remaining>0;

  if(d.action==='catalog')return {ok:true,participantId:r[0],confirmed:confirmed,remaining:confirmed?remaining:0,used:used,nextOrdinal:used+1,festEntitled:festEntitled,festUnlocked:festUnlocked,festAvailableFrom:festAvailableFrom,webDrawsUsed:history.length,normal:normal,fest:fest};

  if(!/^[a-f0-9]{32}$/.test(d.drawId||'')||['通常','ラキフェス'].indexOf(d.mode)<0)return {ok:false,error:'抽選要求が不正です'};

  var previous=rows_(ss,DRAW_TAB).filter(function(x){return x[0]===d.drawId});
  if(previous.length){
    var old=previous[0];
    if(previous.length!==1||old[1]!==r[0]||old[2]!==id||old[4]!==d.mode)return {ok:false,error:'抽選IDを確認できません'};
    return {ok:true,participantId:r[0],drawId:old[0],prize:old[6],mode:old[4],ordinal:old[9],rarity:String(old[11]||''),image:String(old[12]||''),remaining:Math.max(total-(manual+history.length),0),replayed:true};
  }

  if(!confirmed)return {ok:false,error:'メンシプ購入の確認をお待ちください'};
  if(remaining<1)return {ok:false,error:'残り回数がありません'};
  if(d.mode==='ラキフェス'&&!festEntitled)return {ok:false,error:'ラキフェスは総ガチャ権利'+festAvailableFrom+'回以上が対象です'};
  if(d.mode==='ラキフェス'&&history.length<festAvailableFrom-1)return {ok:false,error:'ラキフェスはWebで'+(festAvailableFrom-1)+'回抽選後、'+festAvailableFrom+'回目の抽選から利用できます'};

  var c=d.mode==='通常'?normal:fest;
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

  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),winner.chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image]);
  SpreadsheetApp.flush();
  try{backupAfterParticipantMutation_(ss,id,r[2],'ガチャ','抽選確定',d.mode+'／'+winner.id+'／'+winner.name)}catch(ignore){}

  return {ok:true,participantId:r[0],drawId:d.drawId,prize:winner.name,mode:d.mode,ordinal:used+1,rarity:winner.rarity,image:winner.image,remaining:remaining-1,replayed:false};
}

function backupEnsureLog_(ss){
  var sh=ss.getSheetByName(BACKUP_LOG_TAB);
  if(!sh){
    sh=ss.insertSheet(BACKUP_LOG_TAB);
    sh.getRange('A1:J1').setValues([['保存ID','保存日時','参加者ID','ColorSing名','データ種別','操作','正本値','第二保存値','照合結果','備考']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function backupEnsureRecovery_(ss){
  var sh=ss.getSheetByName('emuzii_復旧チェック');
  if(!sh){
    sh=ss.insertSheet('emuzii_復旧チェック');
    sh.getRange('A1:J1').setValues([['参加者ID','ColorSing名','正本ガチャ権利','正本残数','正本FA数','正本皆勤日数','第二保存確認','照合結果','最終確認','備考']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function backupHash_(text){
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text||''));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}

function backupAttemptsState_(id){
  var props=PropertiesService.getScriptProperties().getProperties();
  var prefix='CHECKIN_ATTEMPTS:'+String(id)+':',out=[];
  Object.keys(props).forEach(function(k){
    if(k.indexOf(prefix)!==0)return;
    var d=Number(k.slice(prefix.length)),n=Number(props[k]||0);
    if(Number.isSafeInteger(d)&&d>=1&&d<=31&&n>0)out.push([d,n]);
  });
  out.sort(function(a,b){return a[0]-b[0]});
  return out.length?out.map(function(x){return x[0]+':'+x[1]}).join(','):'なし';
}

function backupParticipantMetrics_(ss,id,name){
  id=String(id||'');name=String(name||'');
  var g=rows_(ss,'emuzii_ガチャ').filter(function(x){return x[0]===id&&x[1]===name});
  var gr=g.length===1?g[0]:null;
  var total=gr?(Number(gr[5])||0):0;
  var remaining=gr?(Number(gr[7])||0):0;
  var fa=rows_(ss,'emuzii_FA').filter(function(x){return x[1]===name&&x[10]==='受付'}).length;
  var att=rows_(ss,'emuzii_皆勤31日').filter(function(x){return x[0]===id&&x[1]===name});
  var days=att.length===1?(Number(att[0][33])||0):0;
  return [total,remaining,fa,days];
}

function backupParticipantState_(ss,id,name){
  var m=backupParticipantMetrics_(ss,id,name);
  var web=webActualRows_(ss.getSheetByName(WEB_TAB)).filter(function(x){return x[2]===String(name||'')&&x[5]==='承認済み'&&x[7]===String(id||'')});
  return 'ガチャ'+m[0]+'／残'+m[1]+'／FA'+m[2]+'／皆勤'+m[3]+'／Web承認'+web.length+'／確認文字試行'+backupAttemptsState_(id);
}

function backupWebState_(ss,webId,name){
  var web=ss.getSheetByName(WEB_TAB);
  var list=webActualRows_(web).filter(function(x){return x[0]===webId});
  if(list.length!==1)return 'Web登録未確認';
  var r=list[0];
  var integrated=String(r[7]||r[10]||'未接続');
  return 'Web状態'+String(r[5]||'')+'／統合'+integrated+'／名前照合'+String(r[9]||'');
}

function backupState_(ss,id,name){
  return /^MIO-\d{4}$/.test(String(id||''))?backupParticipantState_(ss,id,name):backupWebState_(ss,id,name);
}

function backupMatrix_(sh){
  var lastRow=sh.getLastRow(),lastCol=sh.getLastColumn();
  if(lastRow<1||lastCol<1)return {rows:0,cols:0,data:[],numberFormats:[],writeFormats:[]};

  var rg=sh.getRange(1,1,lastRow,lastCol);
  var values=rg.getValues();
  var formulas=rg.getFormulas();
  var numberFormats=rg.getNumberFormats();
  var data=[];
  var writeFormats=[];

  for(var r=0;r<values.length;r++){
    data[r]=[];
    writeFormats[r]=[];
    for(var c=0;c<values[r].length;c++){
      if(formulas[r][c]){
        data[r][c]=formulas[r][c];
        writeFormats[r][c]=numberFormats[r][c];
      }else{
        data[r][c]=values[r][c];
        writeFormats[r][c]=(typeof values[r][c]==='string')?'@':numberFormats[r][c];
      }
    }
  }

  return {rows:lastRow,cols:lastCol,data:data,numberFormats:numberFormats,writeFormats:writeFormats};
}

function backupCanonicalCell_(v){
  if(v instanceof Date)return ['date',v.getTime()];
  if(typeof v==='number'){
    if(!isFinite(v))return ['number',String(v)];
    return ['number',Math.round(v*1e12)/1e12];
  }
  if(typeof v==='boolean')return ['boolean',v?1:0];
  if(typeof v==='string')return ['string',v];
  if(v===null||typeof v==='undefined')return ['blank',''];
  return [typeof v,String(v)];
}

function backupMatrixHash_(m){
  var normalized=[];
  for(var r=0;r<m.data.length;r++){
    normalized[r]=[];
    for(var c=0;c<m.data[r].length;c++)normalized[r][c]=backupCanonicalCell_(m.data[r][c]);
  }
  return backupHash_(JSON.stringify(normalized));
}

function backupMirrorMatrix_(secondarySs,name,m){
  var dst=secondarySs.getSheetByName(name);
  if(!dst)dst=secondarySs.insertSheet(name);
  var clearRows=Math.max(dst.getLastRow(),m.rows,1),clearCols=Math.max(dst.getLastColumn(),m.cols,1);
  if(dst.getMaxRows()<clearRows)dst.insertRowsAfter(dst.getMaxRows(),clearRows-dst.getMaxRows());
  if(dst.getMaxColumns()<clearCols)dst.insertColumnsAfter(dst.getMaxColumns(),clearCols-dst.getMaxColumns());
  dst.getRange(1,1,clearRows,clearCols).clearContent();
  if(m.rows&&m.cols){
    var target=dst.getRange(1,1,m.rows,m.cols);
    target.setNumberFormats(m.writeFormats);
    target.setValues(m.data);
    target.setNumberFormats(m.numberFormats);
  }
  SpreadsheetApp.flush();
  var copied=backupMatrix_(dst);
  return m.rows===copied.rows&&m.cols===copied.cols&&backupMatrixHash_(m)===backupMatrixHash_(copied);
}

function backupRefreshRecoveryCheck_(primarySs,secondarySs,globalOk,note){
  var primarySh=backupEnsureRecovery_(primarySs);
  var secondarySh=secondarySs?backupEnsureRecovery_(secondarySs):null;
  var participants=rows_(primarySs,'emuzii_参加者').filter(function(p){return /^MIO-\d{4}$/.test(String(p[0]||''))&&String(p[1]||'').trim()!==''});
  var now=new Date(),recoveryRows=[];
  participants.forEach(function(p){
    var id=String(p[0]),name=String(p[1]);
    var pm=backupParticipantMetrics_(primarySs,id,name);
    var sm=secondarySs?backupParticipantMetrics_(secondarySs,id,name):[-1,-1,-1,-1];
    var same=!!globalOk&&JSON.stringify(pm)===JSON.stringify(sm);
    var memo=(note?String(note)+'／':'')+'第二保存照合 '+Utilities.formatDate(now,'Asia/Tokyo','yyyy/MM/dd HH:mm:ss')+' JST';
    if(id==='MIO-0004'&&name==='翠央(お試し)')memo+='／管理者テスト・承認済み維持';
    recoveryRows.push([id,safeText_(name),pm[0],pm[1],pm[2],pm[3],same?'一致':'要確認',same?'一致':'要確認',now,memo]);
  });

  var clearPrimary=Math.max(primarySh.getLastRow()-1,0);
  if(clearPrimary>0)primarySh.getRange(2,1,clearPrimary,10).clearContent();
  if(recoveryRows.length)primarySh.getRange(2,1,recoveryRows.length,10).setValues(recoveryRows);

  if(secondarySh){
    var clearSecondary=Math.max(secondarySh.getLastRow()-1,0);
    if(clearSecondary>0)secondarySh.getRange(2,1,clearSecondary,10).clearContent();
    if(recoveryRows.length)secondarySh.getRange(2,1,recoveryRows.length,10).setValues(recoveryRows);
  }
}

function backupMirrorSelected_(primarySs,names,refreshStatus,force){
  var secondary=null,bad=[],changed=[],props=PropertiesService.getScriptProperties();
  try{
    secondary=SpreadsheetApp.openById(SECONDARY_SHEET_ID);
    names.forEach(function(name){
      var src=primarySs.getSheetByName(name);
      if(!src){bad.push(name);return;}
      var m=backupMatrix_(src),hash=backupMatrixHash_(m),key='BACKUP_TAB_HASH:'+name;
      if(!force&&props.getProperty(key)===hash)return;
      if(backupMirrorMatrix_(secondary,name,m)){
        props.setProperty(key,hash);
        changed.push(name);
      }else bad.push(name);
    });
    var ok=bad.length===0;
    if(refreshStatus){
      backupRefreshRecoveryCheck_(primarySs,secondary,ok,ok?'重要シート同期一致':'不一致:'+bad.join(','));
      var cfg=primarySs.getSheetByName('emuzii_連携設定');
      if(cfg){
        cfg.getRange('B30').setValue(ok?'第二保存 同期正常':'第二保存 要確認');
        cfg.getRange('C30').setValue(Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd HH:mm:ss')+' JST / '+(changed.length?changed.join(','):'変更なし')+(bad.length?' / 不一致:'+bad.join(','):''));
      }
      if(ok)props.setProperty('BACKUP_LAST_MIRROR',new Date().toISOString());
    }
    return {ok:ok,bad:bad,changed:changed};
  }catch(err){
    if(refreshStatus)backupRefreshRecoveryCheck_(primarySs,null,false,'第二保存本体同期失敗');
    return {ok:false,bad:['SECONDARY_OPEN_OR_SYNC'],changed:changed};
  }
}

function backupMirrorCritical_(primarySs,force){return backupMirrorSelected_(primarySs,BACKUP_MIRROR_TABS,true,!!force)}

function backupAppend_(primarySs,id,name,dataType,operation,note){
  var now=new Date();
  var saveId='BK-'+Utilities.formatDate(now,'Asia/Tokyo','yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,8);
  id=String(id||'');name=String(name||'');
  var state=backupState_(primarySs,id,name);
  var primaryLog=backupEnsureLog_(primarySs);
  primaryLog.appendRow([saveId,now,id,safeText_(name),dataType,operation,state,'','保存中',note||'']);
  var primaryRow=primaryLog.getLastRow();
  try{
    var secondary=SpreadsheetApp.openById(SECONDARY_SHEET_ID);
    var secondaryLog=backupEnsureLog_(secondary);
    secondaryLog.appendRow([saveId,now,id,safeText_(name),dataType,operation,state,state,'一致',note||'']);
    SpreadsheetApp.flush();
    primaryLog.getRange(primaryRow,8,1,2).setValues([[state,'一致']]);
    if(/^MIO-\d{4}$/.test(id))PropertiesService.getScriptProperties().setProperty('BACKUP_STATE:'+id,backupHash_(state));
    return true;
  }catch(err){
    primaryLog.getRange(primaryRow,8,1,2).setValues([['','第二保存失敗']]);
    primaryLog.getRange(primaryRow,10).setValue((note?String(note)+'／':'')+'第二保存エラー');
    return false;
  }
}

function backupAfterWebMutation_(ss,webId,name,operation,note){
  var web=ss.getSheetByName(WEB_TAB);
  var current=webActualRows_(web).filter(function(x){return x[0]===webId});
  var id=current.length===1?String(current[0][7]||current[0][10]||webId):String(webId||'');
  var logged=backupAppend_(ss,id,name,'Web登録',operation,note||'');
  var mirrored=backupMirrorSelected_(ss,['emuzii_Web登録','emuzii_参加者'],false,false);
  return logged&&mirrored.ok;
}

function backupAfterParticipantMutation_(ss,id,name,dataType,operation,note){
  var logged=backupAppend_(ss,id,name,dataType,operation,note||'');
  var tabs=[];
  if(String(dataType).indexOf('ガチャ')>=0)tabs=['emuzii_当選履歴','emuzii_ガチャ'];
  else if(String(dataType).indexOf('皆勤')>=0)tabs=['emuzii_皆勤31日'];
  else if(String(dataType).indexOf('FA')>=0)tabs=['emuzii_FA'];
  else tabs=['emuzii_参加者'];
  var mirrored=backupMirrorSelected_(ss,tabs,false,false);
  return logged&&mirrored.ok;
}

function backupSweep_(){
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))return;
  try{
    var ss=SpreadsheetApp.openById(SHEET_ID);
    var props=PropertiesService.getScriptProperties(),changes=[];
    rows_(ss,'emuzii_参加者').forEach(function(p){
      var id=String(p[0]||''),name=String(p[1]||'');
      if(!/^MIO-\d{4}$/.test(id)||!name)return;
      var state=backupParticipantState_(ss,id,name);
      var hash=backupHash_(state);
      if(props.getProperty('BACKUP_STATE:'+id)!==hash)changes.push({id:id,name:name,state:state,hash:hash});
    });
    var mirrored=backupMirrorCritical_(ss,false);
    changes.forEach(function(x){
      if(backupAppend_(ss,x.id,x.name,'定期保存','差分スナップショット','差分回収／本体同期'+(mirrored.ok?'一致':'要確認'))){
        props.setProperty('BACKUP_STATE:'+x.id,x.hash);
      }
    });
  }finally{
    lock.releaseLock();
  }
}

function verifyBackupV187_(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  return backupMirrorCritical_(ss,true);
}

function setupBackupV187_(){
  var ss=SpreadsheetApp.openById(SHEET_ID);
  backupEnsureLog_(ss);
  backupEnsureLog_(SpreadsheetApp.openById(SECONDARY_SHEET_ID));
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction()==='backupSweep_')ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupSweep_').timeBased().everyMinutes(BACKUP_SWEEP_MINUTES).create();
  var mirrored=backupMirrorCritical_(ss,true);
  backupSweep_();
  var cfg=ss.getSheetByName('emuzii_連携設定');
  if(cfg){
    cfg.getRange('B31').setValue('GAS v1.8.7 自動二重保存 稼働');
    cfg.getRange('C31').setValue('即時変更シート同期＋5分差分照合'+(mirrored.ok?'':'（要確認）'));
  }
}
