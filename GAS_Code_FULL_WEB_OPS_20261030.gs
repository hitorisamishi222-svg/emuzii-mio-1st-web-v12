/**
 * 翠央1周年 統合修正版 v1.9.1 LOGIN-ID
 * Web参加者MIO-ID自動接続・ログインID復旧・名前ゆれ照合・端末復旧整合・皆勤2回制限・ラキフェス5回目制御・ガチャ完全被りなし
 * 名前・回答・画像URLは匿名の公開APIへ出さない。
 * Vercelサーバーのsecretと端末用tokenHashを両方確認。
 * 既存スプレッドシート紐付けApps Scriptへ適用し、新規Apps Scriptプロジェクトは作らない。
 *
 * 2026-10-26: 2名限定の管理者承認済みブラウザ復旧アクションを接続。
 * 原本機能を維持。復旧実処理はこのCode.gsに統合、管理者承認の設定は既存の別ファイルを利用。
 */
var SHEET_ID = '1WqkXSV_UehRdpO9VVqRAL9ZTVXwD_GxlH3Ey50uX3PM';
var WEB_TAB = 'emuzii_Web登録';
var CHECKIN_MAX_ATTEMPTS = 2;
var LOGIN_ID_COL = 21;


function checkinAttemptKey_(participantId,day){return 'CHECKIN_ATTEMPTS:'+String(participantId)+':'+String(day)}
function checkinAttempts_(participantId,day){return Number(PropertiesService.getScriptProperties().getProperty(checkinAttemptKey_(participantId,day))||0)}
function setCheckinAttempts_(participantId,day,count){PropertiesService.getScriptProperties().setProperty(checkinAttemptKey_(participantId,day),String(count))}
function lockedCheckinDays_(participantId){var out=[];for(var d=1;d<=31;d++)if(checkinAttempts_(participantId,d)>=CHECKIN_MAX_ATTEMPTS)out.push(d);return out}

function setup() {
  setupGacha_();
  setupGachaAdminV188_();
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var sheet=ss.getSheetByName(WEB_TAB);
  if(!sheet) {
    sheet=ss.insertSheet(WEB_TAB);
    sheet.appendRow(['Web参加ID','認証ハッシュ（変更不可）','ColorSing名','メンシプ申告','登録日時','登録承認','メンシプ確認','照合参加者ID','運営メモ','名前照合状態','統合参加者ID','みお確認','確認日時','','','','','','','','ログインID']);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:I1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
    sheet.getRange('F2:F500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['承認待ち','承認済み','却下'],true).setAllowInvalid(false).build());
    sheet.getRange('G2:G500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['未確認','確認済み'],true).setAllowInvalid(false).build());
    sheet.getRange('E2:E500').setNumberFormat('yyyy/mm/dd hh:mm:ss');
    sheet.setColumnWidth(3,180);sheet.setColumnWidth(8,160);sheet.setColumnWidth(9,260);
  }
  ensureLoginIdExisting_(sheet);
  var props=PropertiesService.getScriptProperties();
  if(!props.getProperty('BRIDGE_SECRET'))props.setProperty('BRIDGE_SECRET',Utilities.getUuid()+Utilities.getUuid());
  ensureWebDerivedExisting_(ss);
}

function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)}
function equal_(a,b){a=String(a||'');b=String(b||'');var diff=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
function rows_(ss,name){var sh=ss.getSheetByName(name);return sh&&sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues():[]}
function safeText_(text){return /^[=+\-@]/.test(String(text||''))?"'"+text:text}
function jstYmd_(date){if(Utilities&&typeof Utilities.formatDate==='function')return Utilities.formatDate(date,'Asia/Tokyo','yyyy-MM-dd');var x=new Date(date.getTime()+9*60*60*1000);return x.toISOString().slice(0,10)}
function nameKey_(x){return String(x||'').normalize('NFKC').replace(/[\s\u3000]+/g,'').trim()}
function loginIdFormat_(x){return String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function loginIdDisplay_(x){x=loginIdFormat_(x);return x.length===8?'MIO-'+x.slice(0,4)+'-'+x.slice(4):String(x||'')}
function newLoginId_(){return Utilities.getUuid().replace(/-/g,'').slice(0,8).toUpperCase()}
function ensureLoginIdHeader_(web){
  if(String(web.getRange(1,LOGIN_ID_COL).getDisplayValue()||'')!=='ログインID')web.getRange(1,LOGIN_ID_COL).setValue('ログインID');
}
function ensureLoginIdForRow_(web,row){
  ensureLoginIdHeader_(web);
  var current=loginIdFormat_(web.getRange(row,LOGIN_ID_COL).getDisplayValue());
  if(!current){
    current=newLoginId_();
    web.getRange(row,LOGIN_ID_COL).setValue(loginIdDisplay_(current));
  }
  return current;
}
function ensureLoginIdExisting_(web){
  if(!web)return;
  ensureLoginIdHeader_(web);
  var last=webActualLastRow_(web);
  for(var row=2;row<=last;row++){
    if(String(web.getRange(row,1).getDisplayValue()||'').trim())ensureLoginIdForRow_(web,row);
  }
}
function findWebRowIndexById_(web,participantId){
  var values=webActualRows_(web);
  for(var i=0;i<values.length;i++)if(String(values[i][0]||'')===String(participantId||''))return i+2;
  return 0;
}

function webActualLastRow_(web){
  var max=Math.max(web.getMaxRows(),2);
  var values=web.getRange(2,1,max-1,1).getDisplayValues();
  for(var i=values.length-1;i>=0;i--)if(String(values[i][0]||'').trim())return i+2;
  return 1;
}

function webActualRows_(web){
  var last=webActualLastRow_(web);
  if(last<2)return [];
  return web.getRange(2,1,last-1,Math.max(web.getLastColumn(),LOGIN_ID_COL)).getValues();
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

/** Block a retired browser only after an administrator explicitly switches devices. */
function activeWebDeviceErrorV189_(record){
  if(!record)return 'unauthorized';
  if(String(record[5]||'')==='承認済み')return '';
  var note=String(record[17]||'');
  if(String(record[5]||'')==='却下'&&String(record[16]||'')==='旧端末'&&
      (note.indexOf('端末切替')!==-1||note.indexOf('後継')!==-1))
    return 'この登録は旧端末です。新しい端末をご利用ください。';
  return '';
}

function autoLinkWebParticipant_(ss,web,participantId,tokenHash,name){
  name=String(name||'').trim();
  if(!name)return '';
  var key=nameKey_(name);
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
      return nameKey_(p[1])===key&&/^MIO-\d{4}$/.test(String(p[0]||''));
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
    if(d.action==='webGateRead'||d.action==='webGateSet')return json_(gachaWebGateActionInline1030_(SpreadsheetApp.openById(SHEET_ID),d));
    if(/^webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));
    if(!/^MIO-W-[a-f0-9]{24}$/.test(d.participantId||'')||! /^[a-f0-9]{64}$/.test(d.tokenHash||''))return json_({ok:false,error:'invalid identity'});

    var ss=SpreadsheetApp.openById(SHEET_ID),web=ss.getSheetByName(WEB_TAB);
    if(!web)return json_({ok:false,error:'setup required'});
    ensureLoginIdHeader_(web);

    // 2026-10-26: みお確認済み2人専用の追加ブラウザ復旧。
    // BRIDGE_SECRET, participantId/tokenHash, script lock を上で検証済み。
    // 復旧専用処理に分岐するだけで、
    // 既存のregister/status/checkin/gacha処理には介入しない。
    if(d.action==='mioAdminVerifiedTwoBrowser') {
      return json_(mioAdminVerifiedTwoBrowserFromCode_(ss,web,d,lock));
    }

    var all=webActualRows_(web),found=all.filter(function(r){return r[0]===d.participantId});

    if(d.action==='register') {
      if(found.length) {
        if(!equal_(found[0][1],d.tokenHash))return json_({ok:false,error:'unauthorized'});
        var foundRow=findWebRowIndexById_(web,d.participantId);
        var existingLoginId=foundRow?ensureLoginIdForRow_(web,foundRow):'';
        var healedId=found[0][7]||autoLinkWebParticipant_(ss,web,d.participantId,d.tokenHash,found[0][2]);
        return json_({ok:true,verified:true,participantId:d.participantId,status:found[0][5],integratedParticipantId:healedId||'',loginId:loginIdDisplay_(existingLoginId)});
      }

      var name=String(d.name||'').trim();
      if(!name||name.length>40||/[\x00-\x1f]/.test(name))return json_({ok:false,error:'invalid name'});
      if(webActualCount_(web)>=499)return json_({ok:false,error:'登録上限です。運営に確認してください'});

      var nameKey=nameKey_(name);
      var duplicates=all.filter(function(r){return nameKey_(r[2])===nameKey});
      var peopleByName=rows_(ss,'emuzii_参加者').filter(function(p){return nameKey_(p[1])===nameKey});
      var linked=peopleByName.length===1?peopleByName[0][0]:'';
      var matchState=peopleByName.length>1?'重複要確認':peopleByName.length===1?'既存一致':'フォーム/Web新規';
      var submittedLoginId=loginIdFormat_(d.loginId);

      if(duplicates.length){
        if(!submittedLoginId)return json_({ok:false,error:'このColorSing名は登録済みです。ログインIDを入力してください',needsLoginId:true});
        var matched=duplicates.map(function(r,i){return {r:r,idx:i};}).filter(function(x){return loginIdFormat_(x.r[20])===submittedLoginId;});
        if(matched.length!==1)return json_({ok:false,error:'ログインIDが一致しません。登録済みの方は表示されたログインIDを入力してください',needsLoginId:true});
        var base=matched[0].r;
        linked=String(base[7]||linked||'');
        if(!/^MIO-\d{4}$/.test(linked))return json_({ok:false,error:'運営による参加者IDの照合が必要です'});
        var status=String(base[5]||'承認待ち'),member=String(base[6]||'未確認');
        var newLoginId=loginIdDisplay_(submittedLoginId);
        var newAuth=status==='却下'?'承認待ち':status;
        var newRowLogin=webNextRow_(web);
        if(!newRowLogin)return json_({ok:false,error:'登録上限です。運営に確認してください'});
        web.getRange(newRowLogin,1,1,LOGIN_ID_COL).setValues([[d.participantId,d.tokenHash,safeText_(name),'申告なし',new Date(),newAuth,member,linked,'ログインID一致・同一参加者として自動接続','ログインID一致',linked,'確認済み',new Date(),'','','','使用中','ログインID一致／別ブラウザ自動接続',new Date(),'',newLoginId]]);
        ensureWebDerivedRow_(web,newRowLogin);
        SpreadsheetApp.flush();
        try{if(ss.getSheetByName('emuzii_重複整理'))refreshDuplicateReviewV189_();}catch(ignore){}
        return json_({ok:true,verified:true,participantId:d.participantId,status:newAuth,integratedParticipantId:linked,loginId:newLoginId,recovered:true});
      }

      var newRow=webNextRow_(web);
      if(!newRow)return json_({ok:false,error:'登録上限です。運営に確認してください'});
      var issuedLoginId=loginIdDisplay_(newLoginId_());
      web.getRange(newRow,1,1,LOGIN_ID_COL).setValues([[d.participantId,d.tokenHash,safeText_(name),'申告なし',new Date(),'承認待ち','未確認',linked,'',matchState,linked||d.participantId,'確認待ち','','','','','','','','',issuedLoginId]]);
      ensureWebDerivedRow_(web,newRow);
      SpreadsheetApp.flush();

      if(!linked)linked=autoLinkWebParticipant_(ss,web,d.participantId,d.tokenHash,name);
      try{if(ss.getSheetByName('emuzii_重複整理'))refreshDuplicateReviewV189_();}catch(ignore){}
      var saved=webActualRows_(web).filter(function(r){return r[0]===d.participantId&&equal_(r[1],d.tokenHash)});
      return json_({ok:saved.length===1,verified:saved.length===1,participantId:d.participantId,status:'承認待ち',integratedParticipantId:linked||'',loginId:issuedLoginId});
    }

    if(found.length===1&&equal_(found[0][1],d.tokenHash)&&!found[0][7]){
      var repairedId=autoLinkWebParticipant_(ss,web,d.participantId,d.tokenHash,found[0][2]);
      if(repairedId){
        all=webActualRows_(web);
        found=all.filter(function(r){return r[0]===d.participantId});
      }
    }

    if(['status','catalog','draw','history','checkin'].indexOf(d.action)<0||found.length!==1||!equal_(found[0][1],d.tokenHash))return json_({ok:false,error:'unauthorized'});

    var r=found[0];
    var inactiveReason=activeWebDeviceErrorV189_(r);
    if(inactiveReason)return json_({ok:false,error:inactiveReason});
    if(!webIntegrityOk_(r))return json_({ok:false,error:'参加者IDの整合を運営が確認中です'});
    if(d.action==='checkin')return json_(checkinAction_(ss,r,d));
    if(d.action!=='status')return json_(gachaAction_(ss,r,d));

    var statusRow=findWebRowIndexById_(web,r[0]);
    var loginId=statusRow?ensureLoginIdForRow_(web,statusRow):'';
    var out={ok:true,participantId:r[0],name:r[2],status:r[5],loginId:loginIdDisplay_(loginId)};
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
    // Administrator-only, shared-secret-authenticated gate route: useful error diagnostics.
    // Participant operations remain opaque, with original error message unchanged.
    if(typeof d==='object' && d && (d.action==='webGateRead'||d.action==='webGateSet'||/^webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)$/.test(d.action))) {
      try { console.error('MIO_WEB_GATE_FAILED',err); } catch(ignore) {}
      var reason=String(err&&err.message||err||'unknown').slice(0,120).replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]');
      return json_({ok:false,error:'ガチャ受付の接続エラー: '+reason});
    }
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
    if(attempts>=CHECKIN_MAX_ATTEMPTS)return {ok:false,locked:true,attempts:attempts,error:'入力不可のためライバーにご連絡ください。'};
    return {ok:false,attempts:attempts,remainingAttempts:CHECKIN_MAX_ATTEMPTS-attempts,error:'確認文字が違います。入力できるのはあと1回です。'};
  }

  cell.setValue('○');
  SpreadsheetApp.flush();
  return {ok:true,participantId:r[0],todayDone:true,message:'10/'+day+' の確認を受け付けました'};
}

var PRIZE_TAB='emuzii_景品設定',DRAW_TAB='emuzii_当選履歴';

function setupGacha_(){
  var ss=SpreadsheetApp.openById(SHEET_ID),p=ss.getSheetByName(PRIZE_TAB),h=ss.getSheetByName(DRAW_TAB);
  if(!p){
    p=ss.insertSheet(PRIZE_TAB);
    p.appendRow(['種類（通常/ラキフェス）','景品ID（重複不可）','景品名','レア度','確率（％・小数2桁まで）','有効','数量上限（空欄は制限なし）','景品画像URL（任意・HTTPS）','運営メモ','被り判定キー（任意）']);
    p.setFrozenRows(1);
    p.getRange('A1:J1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
    p.getRange('A2:J101').setBackground('#fff2cc');
    p.getRange('A2:A101').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['通常','ラキフェス'],true).setAllowInvalid(false).build());
    p.getRange('F2:F101').insertCheckboxes();
    p.setColumnWidth(3,240);p.setColumnWidth(8,260);p.setColumnWidth(9,320);
  }

  p.getRange('A1:J1').setValues([['種類（通常/ラキフェス）','景品ID（重複不可）','景品名','レア度','確率（％・小数2桁まで）','有効','数量上限（空欄は制限なし）','景品画像URL（任意・HTTPS）','運営メモ','被り判定キー（任意）']]);
  p.getRange('E2:E101').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0,100).setAllowInvalid(false).setHelpText('各種類ごとに有効景品の確率合計を100％にしてください。小数第2位まで。').build()).setNumberFormat('0.00');
  p.getRange('G2:G101').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).setHelpText('0以上の整数。空欄は数量制限なし。').build()).setNumberFormat('0');
  p.getRange('E1').setNote('通常・ラキフェスそれぞれで、有効な景品の確率合計を100％にしてください。小数第2位まで。未設定や合計の不一致がある間は抽選できません。');
  p.getRange('H1').setNote('数量上限に達すると抽選は安全のため停止します。確率の再配分などを運営で確認してください。');
  p.getRange('J1').setNote('同じ景品を通常/ラキフェスで別ID登録する場合だけ、同じ被り判定キーを設定してください。空欄時は景品名で被り判定します。');
  p.setColumnWidth(10,220);

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

  h.getRange('A1:N1').setValues([['抽選ID（変更不可）','Web参加ID','参加者ID','ColorSing名','種類','景品ID','景品名','確率（抽選時％）','抽選日時','通算何回目','結果','レア度（抽選時）','景品画像URL（抽選時）','被り判定キー（抽選時）']]).setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');
  h.getRange('I2:I1000').setNumberFormat('yyyy/mm/dd hh:mm:ss');
  h.setColumnWidth(12,120);h.setColumnWidth(13,260);
}

function draws_(ss,id){
  return rows_(ss,DRAW_TAB).filter(function(x){return id&&x[2]===id&&x[10]==='確定'});
}

function normalizeDuplicateKey_(value){
  return String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
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

function participantCatalog_(catalog,wonKeys){
  var available=(catalog.prizes||[]).filter(function(p){return !wonKeys[p.duplicateKey]});
  var units=available.reduce(function(sum,p){return sum+p.units},0);
  var prizes=available.map(function(p){
    var effective=units>0?Math.round((p.units/units)*10000)/100:0;
    return {id:p.id,name:p.name,rarity:p.rarity,chance:effective,stock:p.stock,image:p.image};
  });
  return {
    ready:catalog.ready&&available.length>0,
    message:!catalog.ready?catalog.message:available.length?'抽選できます（取得済み景品は除外済み）':'対象景品をすべて獲得済みです',
    total:available.length?100:0,
    prizes:prizes
  };
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
    var duplicateKey=prizeDuplicateKeyFromRow_(x);

    if(!/^[A-Za-z0-9_-]{1,40}$/.test(String(x[1]||''))||ids[x[1]]||!String(x[2]||'').trim()||!duplicateKey||!Number.isFinite(chance)||chance<=0||chance>100||Math.abs(chance*100-units)>0.00001||stock!==null&&(!Number.isSafeInteger(stock)||stock<0)||image&&!/^https:\/\//i.test(image))valid=false;

    ids[x[1]]=true;
    total+=units;
    return {id:String(x[1]),name:String(x[2]),rarity:String(x[3]||''),chance:chance,units:units,stock:stock,image:image,duplicateKey:duplicateKey};
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
  var gate=gachaWebGateStateInline1030_(ss);
  var wonKeys=wonDuplicateKeys_(ss,id);
  var participantNormal=participantCatalog_(normal,wonKeys),participantFest=participantCatalog_(fest,wonKeys);

  if(d.action==='catalog')return {ok:true,participantId:r[0],confirmed:confirmed,remaining:confirmed?remaining:0,used:used,nextOrdinal:used+1,festEntitled:festEntitled,festUnlocked:festUnlocked,festAvailableFrom:festAvailableFrom,webDrawsUsed:history.length,normalOpen:gate.normalOpen,festOpen:gate.festOpen,normal:participantNormal,fest:participantFest};

  if(!/^[a-f0-9]{32}$/.test(d.drawId||'')||['通常','ラキフェス'].indexOf(d.mode)<0)return {ok:false,error:'抽選要求が不正です'};

  var previous=rows_(ss,DRAW_TAB).filter(function(x){return x[0]===d.drawId});
  if(previous.length){
    var old=previous[0];
    if(previous.length!==1||old[1]!==r[0]||old[2]!==id||old[4]!==d.mode)return {ok:false,error:'抽選IDを確認できません'};
    return {ok:true,participantId:r[0],drawId:old[0],prize:old[6],mode:old[4],ordinal:old[9],rarity:String(old[11]||''),image:String(old[12]||''),remaining:Math.max(total-(manual+history.length),0),replayed:true};
  }

  if(d.mode==='通常'&&!gate.normalOpen)return {ok:false,error:'メンシプガチャは現在停止中です'};
  if(d.mode==='ラキフェス'&&!gate.festOpen)return {ok:false,error:'ラキフェスガチャは現在停止中です'};
  if(!confirmed)return {ok:false,error:'メンシプ購入の確認をお待ちください'};
  if(remaining<1)return {ok:false,error:'残り回数がありません'};
  if(d.mode==='ラキフェス'&&!festEntitled)return {ok:false,error:'ラキフェスは総ガチャ権利'+festAvailableFrom+'回以上が対象です'};
  if(d.mode==='ラキフェス'&&history.length<festAvailableFrom-1)return {ok:false,error:'ラキフェスはWebで'+(festAvailableFrom-1)+'回抽選後、'+festAvailableFrom+'回目の抽選から利用できます'};

  var c=d.mode==='通常'?normal:fest;
  if(!c.ready)return {ok:false,error:c.message};

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

  ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),winner.chance,new Date(),used+1,'確定',safeText_(winner.rarity),winner.image,winner.duplicateKey]);
  SpreadsheetApp.flush();
  return {ok:true,participantId:r[0],drawId:d.drawId,prize:winner.name,mode:d.mode,ordinal:used+1,rarity:winner.rarity,image:winner.image,remaining:remaining-1,replayed:false};
}


/** 2人限定の管理者承認済みブラウザを元MIO-IDに紐付ける。
 * 既存の MIO_AdminVerifiedTwoBrowser.gs は管理者承認設定用として変更不要。
 * GASのdoPostからBRIDGE_SECRET検証・ロック取得後にだけ呼び出す。
 */
function mioAdminVerifiedTwoBrowserFromCode_(ss,web,d,heldLock){
  // DoPost's already-acquired lock is passed through; do not acquire a second Lock instance.
  var MIO_TWO_BROWSER_ALLOWLIST={
    'MIO-W-e1a31c322e98578b68f9b31c':'MIO-0010',
    'MIO-W-741785c3fb78c7be6f0bbbd3':'MIO-0018'
  };
  var webId=String(d.participantId||''),tokenHash=String(d.tokenHash||'');
  var id=String(d.masterId||''),expected=MIO_TWO_BROWSER_ALLOWLIST[webId];
  if(!expected||id!==expected||!/^[a-f0-9]{64}$/.test(tokenHash))
    return {ok:false,error:'RECOVERY_TARGET_INVALID'};
  if(Date.now()>Date.parse('2026-11-02T15:00:00.000Z'))
    return {ok:false,error:'RECOVERY_WINDOW_CLOSED'};
  if(!heldLock||typeof heldLock.hasLock!=='function'||!heldLock.hasLock())
    return {ok:false,error:'RECOVERY_LOCK_REQUIRED'};
  // Explicit administrator approval of these precise new-browser IDs is
  // required separately from confirming the participant's name.
  var approved=PropertiesService.getScriptProperties().getProperty('MIO_APPROVED_BROWSER:'+webId);
  if(approved!==id)return {ok:false,error:'BROWSER_NOT_ADMIN_CONFIRMED'};

  var entries=webActualRows_(web);
  var original=entries.filter(function(r){
    return r[7]===id&&r[10]===id&&r[5]==='承認済み'&&r[11]==='確認済み'&&
      r[16]!=='旧端末'&&/^[a-f0-9]{64}$/.test(String(r[1]||''))&&
      /^MIO-W-[a-f0-9]{24}$/.test(String(r[0]||''))&&r[0]!==webId;
  });
  if(original.length!==1)return {ok:false,error:'RECOVERY_ORIGINAL_AMBIGUOUS'};
  var base=original[0],name=String(base[2]||'');
  var people=rows_(ss,'emuzii_参加者').filter(function(p){return p[0]===id&&p[1]===name;});
  if(people.length!==1)return {ok:false,error:'RECOVERY_PERSON_MISMATCH'};
  if(entries.some(function(r){return String(r[1]||'')===tokenHash&&r[0]!==webId;}))
    return {ok:false,error:'RECOVERY_TOKEN_ALREADY_USED'};
  var found=entries.filter(function(r){return r[0]===webId;});
  if(found.length>1)return {ok:false,error:'RECOVERY_DUPLICATE_WEB_ID'};
  var row=0,newRecord=false;
  if(found.length===1){
    var old=found[0];
    if(!equal_(old[1],tokenHash)||String(old[2])!==name)
      return {ok:false,error:'RECOVERY_CANDIDATE_MISMATCH'};
    if(old[5]==='承認済み'){
      if(old[7]!==id||old[10]!==id||old[11]!=='確認済み'||!webIntegrityOk_(old)||old[16]==='旧端末')
        return {ok:false,error:'RECOVERY_ALREADY_LINKED_ELSEWHERE'};
      return {ok:true,verified:true,participantId:webId,integratedParticipantId:id,
              legacyName:name,status:'承認済み',alreadyLinked:true};
    }
    if(old[5]!=='承認待ち'||String(old[7]||'')!==''||old[11]!=='確認待ち')
      return {ok:false,error:'RECOVERY_CANDIDATE_NOT_PENDING'};
    row=findWebRowIndexById_(web,webId);
  }else{
    row=webNextRow_(web);
    if(!row)return {ok:false,error:'RECOVERY_SHEET_FULL'};
    newRecord=true;
  }
  if(newRecord){
    web.getRange(row,1,1,21).setValues([[
      webId,tokenHash,safeText_(name),'申告なし',new Date(),
      '承認済み',String(base[6]||'未確認'),id,
      'みお管理者確認済み・特例追加ブラウザ（旧端末保持）',
      '管理者照合済み',id,'確認済み',new Date(),
      '','','','使用中','2名限定の管理者確認済み復旧',new Date(),'',
      String(base[20]||'')
    ]]);
  }else{
    // Only allowlisted, hash-matched pending candidate is promoted.
    web.getRange(row,6).setValue('承認済み');
    web.getRange(row,7).setValue(String(base[6]||'未確認'));
    web.getRange(row,8).setValue(id);
    web.getRange(row,9).setValue('みお管理者確認済み・特例追加ブラウザ（旧端末保持）');
    web.getRange(row,10).setValue('管理者照合済み');
    web.getRange(row,11).setValue(id);
    web.getRange(row,12).setValue('確認済み');
    web.getRange(row,13).setValue(new Date());
    web.getRange(row,17).setValue('使用中');
    web.getRange(row,18).setValue('2名限定の管理者確認済み復旧');
    web.getRange(row,19).setValue(new Date());
    if(!String(found[0][20]||''))web.getRange(row,21).setValue(String(base[20]||''));
  }
  ensureWebDerivedRow_(web,row);
  SpreadsheetApp.flush();
  var verify=web.getRange(row,1,1,21).getValues()[0];
  if(!equal_(verify[1],tokenHash)||verify[0]!==webId||verify[2]!==name||
     !webIntegrityOk_(verify)||verify[7]!==id||verify[10]!==id)
    return {ok:false,error:'RECOVERY_COMMIT_NOT_VERIFIED'};
  // Existing audit sheet only; never rewrite original entries.
  var audit=ss.getSheetByName('emuzii_端末切替履歴');
  if(audit)audit.appendRow([new Date(),name,id,webId,'原本保持',
    newRecord?'未登録':'承認待ち','追加ブラウザ復旧・承認済み',
    '管理者みおが直接本人確認済み。認証ハッシュ・既存皆勤ガチャ原本保持']);
  return {ok:true,verified:true,participantId:webId,integratedParticipantId:id,
    legacyName:name,status:'承認済み',newRecord:newRecord};
}


/**
 * 2026-10-30 Web management LIVE gate: entirely inside Code.gs.
 * Uses existing sheet / existing BRIDGE_SECRET / existing doPost; only B2 or D2.
 * The optional GAS_WebGateOnly_20261030.gs can remain untouched.
 * DO NOT call setup() for this change.
 */
function gachaWebGateStateInline1030_(ss) {
  var admin=ss.getSheetByName('emuzii_管理画面');
  var panel=ss.getSheetByName('emuzii_ガチャ緊急管理_1030');
  if(!admin||!panel)throw new Error('管理シートがありません');
  if(String(admin.getRange('A141').getDisplayValue()).trim()!=='メンシプガチャ受付'||
     String(admin.getRange('A142').getDisplayValue()).trim()!=='ラキフェス受付'||
     String(panel.getRange('A2').getDisplayValue()).trim()!=='通常ガチャ'||
     String(panel.getRange('C2').getDisplayValue()).trim()!=='ラキフェス')
    throw new Error('ガチャ受付セル配置が一致しません');
  var normal=panel.getRange('B2').getValue(),fest=panel.getRange('D2').getValue();
  var readNormal=admin.getRange('B141').getValue(),readFest=admin.getRange('B142').getValue();
  if(typeof normal!=='boolean'||typeof fest!=='boolean'||
     typeof readNormal!=='boolean'||typeof readFest!=='boolean'||
     normal!==readNormal||fest!==readFest)
    throw new Error('管理シートと受付判定が一致しません');
  return {ok:true,gateConfigured:true,normalOpen:readNormal,festOpen:readFest};
}
function gachaWebGateActionInline1030_(ss,d){
  var before=gachaWebGateStateInline1030_(ss);
  if(d.action==='webGateRead')return before;
  if(d.action!=='webGateSet'||['通常','ラキフェス'].indexOf(d.mode)<0||
     typeof d.enabled!=='boolean'||typeof d.expected!=='boolean')
    throw new Error('不正な受付変更要求です');
  var was=d.mode==='通常'?before.normalOpen:before.festOpen;
  if(was!==d.expected)throw new Error('先に別の管理者が受付を変更しています');
  if(was===d.enabled)return before;
  var panel=ss.getSheetByName('emuzii_ガチャ緊急管理_1030');
  panel.getRange(d.mode==='通常'?'B2':'D2').setValue(d.enabled);
  SpreadsheetApp.flush();
  var after=gachaWebGateStateInline1030_(ss);
  if((d.mode==='通常'?after.normalOpen:after.festOpen)!==d.enabled)
    throw new Error('受付設定の保存結果を確認できません');
  return after;
}

// -- みお Web運営管理 (2026-10-30)
/**
 * MIO Web operator service. Add to EXISTING Apps Script; DO NOT run setup.
 * Dispatcher in existing doPost AFTER BRIDGE_SECRET comparison, inside ScriptLock:
 *   if(/^webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)$/.test(d.action))
 *     return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));
 * This file never changes check-in or draw logic.
 */
function mioAdminOps_(ss,d){
 var action=String(d.action||'');
 if(action==='webAdminOpsRead')return mioAdminOpsRead_(ss,d);
 if(action==='webAdminOpsApprove')return mioAdminOpsApprove_(ss,d);
 if(action==='webAdminOpsGrant')return mioAdminOpsGrant_(ss,d);
 if(action==='webAdminOpsCreate')return mioAdminOpsCreate_(ss,d);
 if(action==='webAdminOpsReview')return mioAdminOpsReview_(ss,d);
 if(action==='webAdminOpsIntake')return mioAdminOpsIntake_(ss,d);
 throw new Error('未対応の管理操作です');
}
function mioAdminOpsStr_(x){return String(x===null||x===undefined?'':x).trim()}
function mioAdminOpsName_(s){return mioAdminOpsStr_(s).normalize('NFKC').replace(/[\s\u3000]/g,'').toLowerCase()}
function mioAdminOpsSheet_(ss,name){var sh=ss.getSheetByName(name);if(!sh)throw new Error('必要な管理シートがありません');return sh}
function mioAdminOpsValues_(sh,lastCol){
 var n=sh.getLastRow()-1;
 if(n<1)return [];
 // Existing Web registration and simple intake each have up to 1000 rows.
 // Reject an unexpectedly larger table instead of silently dropping users.
 if(n>999||n*lastCol>25000)throw new Error('管理台帳の行数が検証上限です');
 return sh.getRange(2,1,n,lastCol).getValues();
}
function mioAdminOpsOne_(items,idx,value){
 var out=[];for(var i=0;i<items.length;i++)if(mioAdminOpsStr_(items[i][idx])===value)out.push({row:i+2,c:items[i]});
 if(out.length!==1)throw new Error(out.length?'同じIDが複数あります。手動確認してください':'対象の参加者が見つかりません');
 return out[0];
}
function mioAdminOpsPeople_(ss){return mioAdminOpsValues_(mioAdminOpsSheet_(ss,'emuzii_参加者'),10)}
function mioAdminOpsSummary_(ss,webRows){
 var people=mioAdminOpsPeople_(ss),gacha=mioAdminOpsValues_(mioAdminOpsSheet_(ss,'emuzii_ガチャ'),17),fresh=mioAdminOpsValues_(mioAdminOpsSheet_(ss,'emuzii_新規簡易登録'),6);
 var byId={};for(var i=0;i<people.length;i++){var id=mioAdminOpsStr_(people[i][0]);if(/^MIO-\d{4}$/.test(id))byId[id]={id:id,name:mioAdminOpsStr_(people[i][1])};}
 var grants={};for(var j=0;j<gacha.length;j++){var g=gacha[j],gid=mioAdminOpsStr_(g[0]);if(!/^MIO-\d{4}$/.test(gid))continue;if(!grants[gid])grants[gid]=[];grants[gid].push({mioId:gid,name:mioAdminOpsStr_(g[1]),total:Number(g[5]),remaining:Number(g[7]),special:Number(g[14]),checked:g[12]==='OK'&&g[13]==='OK'});}
 var web=[];for(var k=0;k<webRows.length;k++){var row=webRows[k],wid=mioAdminOpsStr_(row[0]);if(!/^MIO-W-[a-f0-9]{24}$/.test(wid))continue;var mioId=mioAdminOpsStr_(row[7]);web.push({webId:wid,name:mioAdminOpsStr_(row[2]),status:mioAdminOpsStr_(row[5]),member:mioAdminOpsStr_(row[6]),mioId:mioId,integrity:mioAdminOpsStr_(row[11]),linkedName:byId[mioId]?byId[mioId].name:'',gacha:(grants[mioId]||[]).length===1?grants[mioId][0]:null});}
 var pending=web.filter(function(r){return r.status!=='承認済み'||r.integrity!=='確認済み';}).slice(-80).reverse();
 var simple=[];for(var l=0;l<fresh.length;l++){var fr=fresh[l];if(!mioAdminOpsStr_(fr[1]))continue;simple.push({row:l+2,name:mioAdminOpsStr_(fr[1]),browserId:mioAdminOpsStr_(fr[2]),status:mioAdminOpsStr_(fr[4])||'未確認',note:mioAdminOpsStr_(fr[5]).slice(0,120)});}
 var roster=[];Object.keys(byId).forEach(function(id){var x=byId[id],gg=(grants[id]||[]);roster.push({mioId:id,name:x.name,gacha:gg.length===1?gg[0]:null,needsReview:gg.length!==1});});
 return {ok:true,pending:pending,roster:roster,simple:simple.slice(-60).reverse(),totalPending:web.filter(function(x){return x.status!=='承認済み'||x.integrity!=='確認済み'}).length};
}
function mioAdminOpsRead_(ss,d){
 var web=mioAdminOpsSheet_(ss,'emuzii_Web登録'),all=mioAdminOpsValues_(web,21);
 var result=mioAdminOpsSummary_(ss,all);
 var grantSheet=mioAdminOpsSheet_(ss,'emuzii_ガチャ付与履歴');
 var end=grantSheet.getLastRow();
 var start=Math.max(2,end-99),n=Math.max(0,end-start+1);
 var grants=n?grantSheet.getRange(start,1,n,9).getValues():[];
 result.grants=grants.filter(function(r){return /^MIO-\d{4}$/.test(mioAdminOpsStr_(r[1]))})
   .slice(-30).reverse().map(function(r){return {mioId:mioAdminOpsStr_(r[1]),name:mioAdminOpsStr_(r[2]),count:Number(r[3]),reason:mioAdminOpsStr_(r[4])};});
 return result;
}
function mioAdminOpsRequest_(d){
 var req=mioAdminOpsStr_(d.operationId);
 if(!/^[a-f0-9]{32}$/.test(req))throw new Error('操作IDが不正です');
 return req;
}
function mioAdminOpsLog_(ss){
 var log=ss.getSheetByName('emuzii_Web管理操作履歴');
 if(!log){
   log=ss.insertSheet('emuzii_Web管理操作履歴');
   log.getRange(1,1,1,10).setValues([['日時','操作ID','操作種別','Web参加ID','MIO-ID','変更前','変更後','処理状態','備考','対象名']]);
   log.setFrozenRows(1);
 }
 return log;
}
function mioAdminOpsExisting_(log,requestId){
 var n=log.getLastRow()-1;if(n<1)return null;
 var values=log.getRange(2,1,n,10).getValues();
 var matches=[];for(var i=0;i<values.length;i++)if(mioAdminOpsStr_(values[i][1])===requestId)matches.push({row:i+2,c:values[i]});
 if(matches.length>1)throw new Error('管理操作の重複記録を確認してください');
 return matches.length?matches[0]:null;
}
function mioAdminOpsWriteLog_(log,requestId,kind,webId,mioId,oldV,newV,note,name){
 var row=log.getLastRow()+1;
 log.getRange(row,1,1,10).setValues([[new Date(),requestId,kind,webId,mioId,oldV,newV,'処理中',note,name]]);
 SpreadsheetApp.flush();return row;
}

/* Create a new participant only after a human has confirmed an unlinked Web registration.
   Existing participant IDs and rows are never moved or rewritten. */
function mioAdminOpsCreate_(ss,d){
 var op=mioAdminOpsRequest_(d),wid=mioAdminOpsStr_(d.webId);
 if(!/^MIO-W-[a-f0-9]{24}$/.test(wid)||d.expectedStatus!=='承認待ち')
   throw new Error('新規受付の指定が不正です');
 var web=mioAdminOpsSheet_(ss,'emuzii_Web登録'),all=mioAdminOpsValues_(web,21),w=mioAdminOpsOne_(all,0,wid),name=mioAdminOpsStr_(w.c[2]);
 if(!name||name.length>40||mioAdminOpsStr_(w.c[5])!=='承認待ち'||mioAdminOpsStr_(w.c[7]))
   throw new Error('既存の登録先があります。新規MIO-IDを作成できません');
 var matched=all.filter(function(r){return mioAdminOpsName_(r[2])===mioAdminOpsName_(name)});
 if(matched.length!==1)throw new Error('同名のWeb登録が複数あります。本人確認が必要です');
 var people=mioAdminOpsSheet_(ss,'emuzii_参加者'),values=mioAdminOpsValues_(people,10);
 var log=mioAdminOpsLog_(ss),old=mioAdminOpsExisting_(log,op);
 if(old){
  if(old.c[2]!=='新規MIO-ID'||old.c[3]!==wid)throw new Error('操作IDの再利用は禁止です');
  var oldId=mioAdminOpsStr_(old.c[4]);
  if(old.c[7]==='確定')return {ok:true,replayed:true,mioId:oldId};
  var saved=values.filter(function(x){return x[0]===oldId&&mioAdminOpsName_(x[1])===mioAdminOpsName_(name)});
  if(saved.length===1){log.getRange(old.row,8).setValue('確定');return {ok:true,replayed:true,mioId:oldId};}
  throw new Error('保留中の新規登録を確認してください');
 }
 if(values.some(function(x){return mioAdminOpsName_(x[1])===mioAdminOpsName_(name)}))
   throw new Error('既存の参加者名です。参加者IDの照合をしてください');
 var drawing=mioAdminOpsSheet_(ss,'emuzii_当選履歴'),drawCount=drawing.getLastRow()-1;
 if(drawCount>20000)throw new Error('過去抽選履歴の照合対象が多すぎます');
 var usedDraw=drawCount>0?drawing.getRange(2,3,drawCount,1).getValues().map(function(x){return mioAdminOpsStr_(x[0]);}):[];
 var grants=mioAdminOpsSheet_(ss,'emuzii_ガチャ付与履歴'),grantCount=grants.getLastRow()-1;
 if(grantCount>20000)throw new Error('過去付与履歴の照合対象が多すぎます');
 var usedGrant=grantCount>0?grants.getRange(2,2,grantCount,1).getValues().map(function(x){return mioAdminOpsStr_(x[0]);}):[];
 var activeIds=all.map(function(x){return mioAdminOpsStr_(x[7]);});
 var slot=0,id='';
 for(var i=0;i<values.length;i++){
  var row=i+2,c=values[i];
  if(mioAdminOpsStr_(c[1])||c.slice(2).some(function(v){return v!==''&&v!==null;}))continue;
  var next='MIO-'+('0000'+(row-1)).slice(-4);
  if(usedDraw.indexOf(next)>=0||usedGrant.indexOf(next)>=0||activeIds.indexOf(next)>=0)continue;
  var formula=people.getRange(row,1).getFormula();
  if(typeof formula!=='string'||formula.indexOf('MIO-')<0)continue;
  if(people.getRange(row,2).getFormula())continue;
  slot=row;id=next;break;
 }
 if(!slot)throw new Error('安全に利用できる新規参加者行がありません');
 var logRow=mioAdminOpsWriteLog_(log,op,'新規MIO-ID',wid,id,'未登録',id,'本人確認後の参加者作成',name);
 people.getRange(slot,2).setValue(safeText_(name));
 SpreadsheetApp.flush();
 if(mioAdminOpsStr_(people.getRange(slot,1).getValue())!==id||mioAdminOpsName_(people.getRange(slot,2).getValue())!==mioAdminOpsName_(name))
   throw new Error('新規参加者IDの確認に失敗しました');
 log.getRange(logRow,8).setValue('確定');
 return {ok:true,mioId:id,name:name};
}

function mioAdminOpsApprove_(ss,d){
 var op=mioAdminOpsRequest_(d),wid=mioAdminOpsStr_(d.webId),id=mioAdminOpsStr_(d.mioId);
 if(!/^MIO-W-[a-f0-9]{24}$/.test(wid)||!/^MIO-\d{4}$/.test(id)||typeof d.memberConfirmed!=='boolean'||d.expectedStatus!=='承認待ち')
   throw new Error('承認条件を確認してください');
 var log=mioAdminOpsLog_(ss),previous=mioAdminOpsExisting_(log,op);
 if(previous){if(previous.c[2]!=='承認'||previous.c[3]!==wid||previous.c[4]!==id)throw new Error('操作IDの再利用は禁止です');if(previous.c[7]==='確定')return {ok:true,replayed:true};throw new Error('前の処理を管理者が確認中です');}
 var web=mioAdminOpsSheet_(ss,'emuzii_Web登録'),w=mioAdminOpsOne_(mioAdminOpsValues_(web,21),0,wid),person=mioAdminOpsOne_(mioAdminOpsPeople_(ss),0,id);
 if(w.c[5]!=='承認待ち')throw new Error('承認状態が変更されています');
 if(mioAdminOpsName_(w.c[2])!==mioAdminOpsName_(person.c[1]))throw new Error('参加者名が一致しません。別人を承認できません');
 if(w.c[7]&&mioAdminOpsStr_(w.c[7])!==id)throw new Error('別の参加者IDに紐付いています');
 if(w.c[15]&&mioAdminOpsStr_(w.c[15])!==id)throw new Error('端末復旧先IDと一致しません');
 if(String(w.c[16]||'')==='旧端末')throw new Error('旧端末の再承認は禁止です');
 if(mioAdminOpsValues_(web,21).some(function(r){return r[0]!==wid&&r[7]===id&&r[5]==='承認済み';}))
   throw new Error('このMIO-IDはすでに承認済みです。別端末復旧の本人確認が必要です');
 var row=mioAdminOpsWriteLog_(log,op,'承認',wid,id,'承認待ち','承認済み',d.memberConfirmed?'メンシプ確認済み':'メンシプ未確認',mioAdminOpsStr_(w.c[2]));
 if(!w.c[7])web.getRange(w.row,8).setValue(id); // H existing MIO-ID
 web.getRange(w.row,11).setValue(id); // K integrated MIO-ID
 web.getRange(w.row,12).setValue('確認済み'); // L identity confirmation
 web.getRange(w.row,7).setValue(d.memberConfirmed?'確認済み':'未確認'); // G member
 web.getRange(w.row,13).setValue(new Date());
 ensureWebDerivedRow_(web,w.row); // preserve N/O/P/T integrity formulas
 SpreadsheetApp.flush();
 web.getRange(w.row,6).setValue('承認済み'); // F LAST
 SpreadsheetApp.flush();
 var confirmed=web.getRange(w.row,1,1,21).getValues()[0];
 if(confirmed[5]!=='承認済み'||confirmed[7]!==id||confirmed[10]!==id||
    confirmed[11]!=='確認済み'||!webIntegrityOk_(confirmed))
   throw new Error('承認結果の本人整合を確認できません');
 log.getRange(row,8).setValue('確定');
 return {ok:true,mioId:id,status:'承認済み',member:confirmed[6]};
}
function mioAdminOpsRecordGrant_(ss,op,id,name,count,reason,before,after){
 var sh=mioAdminOpsSheet_(ss,'emuzii_ガチャ付与履歴');
 if(!mioAdminOpsStr_(sh.getRange(1,10).getValue()))sh.getRange(1,10).setValue('Web操作ID');
 // Scan the *entire* operation-id column, not only the first 499 records.
 var historyCount=Math.max(0,sh.getLastRow()-1),matches=[];
 if(historyCount>50000)throw new Error('付与履歴が照合上限です。管理者に確認してください');
 if(historyCount){
  var ids=sh.getRange(2,10,historyCount,1).getValues();
  for(var i=0;i<ids.length;i++)if(mioAdminOpsStr_(ids[i][0])===op)
    matches.push(sh.getRange(i+2,1,1,10).getValues()[0]);
 }
 if(matches.length>1)throw new Error('付与履歴の操作IDが重複しています');
 if(matches.length===1){
  var h=matches[0];
  if(mioAdminOpsStr_(h[1])!==id||Number(h[3])!==count||
     Number(h[5])!==before||Number(h[6])!==after)
    throw new Error('既存の付与履歴と操作内容が一致しません');
  return true;
 }
 var row=sh.getLastRow()+1;
 if(row>sh.getMaxRows())throw new Error('ガチャ付与履歴の行数が上限です');
 // H: total entitled, I: remaining are taken from live gacha formulas.
 var gacha=mioAdminOpsSheet_(ss,'emuzii_ガチャ');
 var g=mioAdminOpsOne_(mioAdminOpsValues_(gacha,17),0,id);
 var values=gacha.getRange(g.row,6,1,3).getValues()[0];
 sh.getRange(row,1,1,10).setValues([[new Date(),id,name,count,reason,before,after,
   Number(values[0]),Number(values[2]),op]]);
 SpreadsheetApp.flush();
 var check=sh.getRange(row,2,1,9).getValues()[0];
 if(mioAdminOpsStr_(check[0])!==id||Number(check[2])!==count||mioAdminOpsStr_(check[8])!==op)
   throw new Error('ガチャ付与履歴を確認できません');
 return true;
}

function mioAdminOpsGrant_(ss,d){
 var op=mioAdminOpsRequest_(d),id=mioAdminOpsStr_(d.mioId),count=d.count,expected=d.expectedSpecial;
 var reason=mioAdminOpsStr_(d.reason);
 if(!/^MIO-\d{4}$/.test(id)||!Number.isInteger(count)||count<1||count>50||
 !Number.isSafeInteger(expected)||expected<0||reason.length<2||reason.length>120)throw new Error('付与条件を確認してください');
 var people=mioAdminOpsOne_(mioAdminOpsPeople_(ss),0,id),name=mioAdminOpsStr_(people.c[1]);
 var sheet=mioAdminOpsSheet_(ss,'emuzii_ガチャ'),g=mioAdminOpsOne_(mioAdminOpsValues_(sheet,17),0,id);
 if(mioAdminOpsName_(g.c[1])!==mioAdminOpsName_(name)||g.c[12]!=='OK'||g.c[13]!=='OK')throw new Error('ガチャ管理行に要確認の項目があります');
 var log=mioAdminOpsLog_(ss),prev=mioAdminOpsExisting_(log,op);
 if(prev){
   if(prev.c[2]!=='付与'||prev.c[4]!==id||Number(prev.c[6])!==expected+count)throw new Error('操作IDの再利用は禁止です');
   if(prev.c[7]==='確定')return {ok:true,replayed:true,mioId:id};
   var current=Number(sheet.getRange(g.row,15).getValue());
   if(current===expected+count){mioAdminOpsRecordGrant_(ss,op,id,name,count,reason,expected,expected+count);log.getRange(prev.row,8).setValue('確定');return {ok:true,replayed:true,mioId:id};}
   if(current!==expected)throw new Error('保留中の付与記録を手動確認してください');
   // Retry the logged intent once, under the existing ScriptLock.
   sheet.getRange(g.row,15).setValue(expected+count);
   SpreadsheetApp.flush();
   if(Number(sheet.getRange(g.row,15).getValue())!==expected+count)throw new Error('付与結果が一致しません');
   mioAdminOpsRecordGrant_(ss,op,id,name,count,reason,expected,expected+count);
   log.getRange(prev.row,8).setValue('確定');
   return {ok:true,replayed:true,mioId:id};
 }
 var old=Number(sheet.getRange(g.row,15).getValue());
 if(old!==expected)throw new Error('先に付与回数が変更されています。再読込してください');
 var row=mioAdminOpsWriteLog_(log,op,'付与','',id,old,old+count,reason,name);
 sheet.getRange(g.row,15).setValue(old+count);
 SpreadsheetApp.flush();
 if(Number(sheet.getRange(g.row,15).getValue())!==old+count)throw new Error('付与結果が一致しません');
 mioAdminOpsRecordGrant_(ss,op,id,name,count,reason,old,old+count);
 log.getRange(row,8).setValue('確定');
 return {ok:true,mioId:id,granted:count,special:old+count};
}
function mioAdminOpsReview_(ss,d){
 var op=mioAdminOpsRequest_(d),row=d.row,status=mioAdminOpsStr_(d.expectedStatus);
 if(!Number.isInteger(row)||row<2||row>1000||status.length>60)throw new Error('簡易登録確認の指定が不正です');
 var sheet=mioAdminOpsSheet_(ss,'emuzii_新規簡易登録');
 var data=sheet.getRange(row,1,1,6).getValues()[0];
 var name=mioAdminOpsStr_(data[1]),actual=mioAdminOpsStr_(data[4])||'未確認';
 if(!name||actual!==status)throw new Error('簡易登録状態が変更されています');
 if(actual==='確認済み')return {ok:true,replayed:true};
 var log=mioAdminOpsLog_(ss),old=mioAdminOpsExisting_(log,op);
 if(old){if(old.c[7]==='確定'&&old.c[2]==='簡易確認')return {ok:true,replayed:true};throw new Error('操作履歴を確認してください');}
 var lrow=mioAdminOpsWriteLog_(log,op,'簡易確認','','',actual,'確認済み','Web受付状況確認',name);
 sheet.getRange(row,5).setValue('確認済み');
 SpreadsheetApp.flush();
 if(sheet.getRange(row,5).getValue()!=='確認済み')throw new Error('確認結果が一致しません');
 log.getRange(lrow,8).setValue('確定');
 return {ok:true,status:'確認済み'};
}

function mioAdminOpsIntake_(ss,d){
 var id=mioAdminOpsRequest_(d),name=mioAdminOpsStr_(d.name),note=mioAdminOpsStr_(d.note);
 if(!name||name.length>40||note.length>120||/[\x00-\x1f]/.test(name))
   throw new Error('受付名・メモを確認してください');
 var history=mioAdminOpsLog_(ss),past=mioAdminOpsExisting_(history,id);
 if(past){
   if(past.c[2]==='初訪問受付'&&mioAdminOpsName_(past.c[9])===mioAdminOpsName_(name)&&past.c[7]==='確定')
     return {ok:true,replayed:true};
   throw new Error('同じ操作の受付状態を確認してください');
 }
 var sh=mioAdminOpsSheet_(ss,'emuzii_新規簡易登録');
 var existing=mioAdminOpsValues_(sh,6).filter(function(r){
  return mioAdminOpsName_(r[1])===mioAdminOpsName_(name)&&mioAdminOpsStr_(r[4])!=='却下';
 });
 if(existing.length)throw new Error('同名の受付があるため、先に重複確認してください');
 var next=sh.getLastRow()+1;
 if(next>sh.getMaxRows())throw new Error('受付欄がいっぱいです');
 var audit=mioAdminOpsWriteLog_(history,id,'初訪問受付','','','','受付済み',note,name);
 sh.getRange(next,1,1,6).setValues([[new Date().toISOString(),safeText_(name),'','Web運営受付','管理確認待ち',safeText_(note)]]);
 SpreadsheetApp.flush();
 if(mioAdminOpsName_(sh.getRange(next,2).getValue())!==mioAdminOpsName_(name))
   throw new Error('受付の保存確認ができません');
 history.getRange(audit,8).setValue('確定');
 return {ok:true,status:'管理確認待ち'};
}
