/**
 * 翠央1周年 認証層統合候補 v1.9.4 BROWSER-PAIR (TEST/REVIEW ONLY)
 * 同名の新規人物登録を防止。未確認ブラウザを独立した接続申請表へ保存し、管理者承認後のみ既存MIO-IDへ接続。
 * 既存ブラウザの認証・皆勤・ガチャ履歴・当選履歴を維持。新規ブラウザを名前だけで自動承認しない。
 * 名前・回答・画像URLは匿名の公開APIへ出さない。
 * Vercelサーバーのsecretと端末用tokenHashを両方確認。
 * 既存スプレッドシート紐付けApps Scriptへ適用し、新規Apps Scriptプロジェクトは作らない。
 */
var SHEET_ID = '1WqkXSV_UehRdpO9VVqRAL9ZTVXwD_GxlH3Ey50uX3PM';
var WEB_TAB = 'emuzii_Web登録';
var CHECKIN_MAX_ATTEMPTS = 2;
var LOGIN_ID_COL = 21;
var BROWSER_REQUEST_TAB = 'emuzii_ブラウザ接続申請';


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

function safeApprovedDuplicateBase_(duplicates,linked){
  linked=String(linked||'');
  if(!/^MIO-\d{4}$/.test(linked))return null;
  var active=duplicates.filter(function(r){
    return String(r[5]||'')==='承認済み' &&
      String(r[7]||'')===linked &&
      String(r[10]||'')===linked &&
      String(r[11]||'')==='確認済み' &&
      String(r[16]||'')!=='旧端末';
  });
  if(active.length<1)return null;
  var bad=duplicates.filter(function(r){
    var h=String(r[7]||''),k=String(r[10]||'');
    return (h&&h!==linked)||(k&&k!==linked);
  });
  if(bad.length)return null;
  return active[0];
}

function appendBrowserCandidate_(web,d,name,linked,auth,member,memo,matchState,confirmState,deviceState,deviceMemo,loginId){
  var row=webNextRow_(web);
  if(!row)return {ok:false,error:'登録上限です。運営に確認してください'};
  web.getRange(row,1,1,LOGIN_ID_COL).setValues([[
    d.participantId,d.tokenHash,safeText_(name),'申告なし',new Date(),
    auth,member,linked,memo,matchState,linked||d.participantId,confirmState,
    confirmState==='確認済み'?new Date():'',
    '','','',deviceState,deviceMemo,new Date(),'',loginId
  ]]);
  ensureWebDerivedRow_(web,row);
  SpreadsheetApp.flush();
  return {ok:true,row:row};
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

/**
 * New browsers are NOT new participants. Keep their review records separate from
 * emuzii_Web登録 and never create a second entitlement-bearing participant row.
 * Sheet editors must verify the request out-of-band before approving D/E.
 * Browser state is not a hardware device identifier.
 */
function browserRequestSheet_(ss){
  var sh=ss.getSheetByName(BROWSER_REQUEST_TAB);
  if(!sh){
    sh=ss.insertSheet(BROWSER_REQUEST_TAB);
    sh.appendRow(['ブラウザ申請ID','認証ハッシュ','ColorSing名','承認先MIO-ID','状態','申請日時','確認日時','運営メモ','参考候補MIO-ID（自動承認不可）']);
    sh.setFrozenRows(1);
    sh.getRange('E2:E500').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['確認待ち','承認済み','却下'],true).setAllowInvalid(false).build()
    );
  }
  return sh;
}
function findBrowserRequest_(ss,participantId,tokenHash){
  var sh=ss.getSheetByName(BROWSER_REQUEST_TAB);
  if(!sh)return null;
  var data=rows_(ss,BROWSER_REQUEST_TAB), matches=[];
  for(var i=0;i<data.length;i++){
    if(String(data[i][0]||'')===String(participantId||'') && equal_(data[i][1],tokenHash))matches.push(data[i]);
  }
  return matches.length===1?matches[0]:null;
}
function queueBrowserRequest_(ss,d,name,proposedMioId){
  var sh=browserRequestSheet_(ss);
  if(findBrowserRequest_(ss,d.participantId,d.tokenHash))return true;
  if(sh.getLastRow()>=500)return false;
  sh.appendRow([d.participantId,d.tokenHash,safeText_(name),'',
    '確認待ち',new Date(),'','承認先MIO-IDは本人確認後に管理者がD列へ記入',
    /^MIO-\d{4}$/.test(String(proposedMioId||''))?proposedMioId:'']);
  SpreadsheetApp.flush();
  return true;
}
/**
 * Only approved browser claims may resolve to the EXISTING identity row.
 * Keep request Web-ID for the signed cookie/API response; all event lookups
 * continue to use the canonical MIO-ID in column H of the original record.
 */
function browserIdentityFor_(ss,web,d){
  var req=findBrowserRequest_(ss,d.participantId,d.tokenHash);
  if(!req)return null;
  var status=String(req[4]||'');
  var name=String(req[2]||'');
  if(status!=='承認済み')return {pending:true,status:status==='却下'?'却下':'承認待ち',name:name};
  var id=String(req[3]||'');
  if(!/^MIO-\d{4}$/.test(id))return {pending:true,status:'承認待ち',name:name};
  var people=rows_(ss,'emuzii_参加者').filter(function(p){return String(p[0]||'')===id&&nameKey_(p[1])===nameKey_(name)});
  if(people.length!==1)return {pending:true,status:'承認待ち',name:name};
  var bases=webActualRows_(web).filter(function(r){
    return String(r[5]||'')==='承認済み' &&
      String(r[7]||'')===id && String(r[10]||'')===id &&
      String(r[11]||'')==='確認済み' &&
      String(r[16]||'')!=='旧端末' &&
      nameKey_(r[2])===nameKey_(name) &&
      webIntegrityOk_(r);
  });
  if(!bases.length)return {pending:true,status:'承認待ち',name:name};
  var r=bases[0].slice();
  r[0]=d.participantId;
  r[1]=d.tokenHash;
  return {pending:false,record:r};
}


/**
 * v1.9.4: browser self-service pairing.  Never infer same hardware from
 * screen/user-agent/fingerprint.  Proof is a one-time 256-bit link minted
 * ONLY by a currently approved signed browser session.
 * No original attendance/gacha/member/FA row is modified.
 */
var PAIR_TAB='emuzii_ブラウザ接続キー';
var PAIR_TTL_MS=3*60*1000;
function pairSheet_(ss){
  var sh=ss.getSheetByName(PAIR_TAB);
  if(!sh){
    sh=ss.insertSheet(PAIR_TAB);
    sh.appendRow(['キーSHA256','発行元WebID','発行元認証ハッシュ','MIO-ID','ColorSing名','発行日時','期限','状態','接続先WebID','利用日時']);
    sh.setFrozenRows(1);
  }
  return sh;
}
function approvedBrowserSource_(ss,web,participantId,tokenHash){
  var rows=webActualRows_(web).filter(function(r){return r[0]===participantId});
  var r=null;
  if(rows.length===1 && equal_(rows[0][1],tokenHash))r=rows[0];
  else if(rows.length===0){
    var delegated=browserIdentityFor_(ss,web,{participantId:participantId,tokenHash:tokenHash});
    if(delegated&&!delegated.pending)r=delegated.record;
  }
  if(!r||r[5]!=='承認済み'||activeWebDeviceErrorV189_(r)||!webIntegrityOk_(r))return null;
  // Legacy v1.9.2 name-only browser approvals must not bootstrap another browser.
  // They remain valid for existing activity until an operator performs migration review.
  if(String(r[16]||'')==='旧端末'||/別ブラウザ自動承認|同一ColorSing名・既存承認済みMIO-ID一致/.test(String(r[8]||'')+' '+String(r[17]||'')))return null;
  var id=String(r[7]||''),name=String(r[2]||'');
  if(!/^MIO-\d{4}$/.test(id))return null;
  var people=rows_(ss,'emuzii_参加者').filter(function(x){
    return String(x[0]||'')===id&&nameKey_(x[1])===nameKey_(name);
  });
  return people.length===1?{id:id,name:name,member:String(r[6]||'未確認')}:null;
}
/** Maximum five distinct approved browser credentials for each existing MIO-ID.
 * Network/IP/user-agent signatures are NOT identity credentials.
 * Existing approved logins are never revoked if legacy data already exceeds this cap.
 */
var MAX_APPROVED_BROWSERS_PER_MIO=5;
function approvedBrowserCount_(ss,web,mioId){
  if(!/^MIO-\d{4}$/.test(String(mioId||'')))return 0;
  var identities={};
  webActualRows_(web).forEach(function(r){
    var id=String(r[0]||'');
    if(/^MIO-W-[a-f0-9]{24}$/.test(id) && String(r[5]||'')==='承認済み' &&
       String(r[7]||'')===mioId && String(r[10]||'')===mioId &&
       String(r[11]||'')==='確認済み' && String(r[16]||'')!=='旧端末')
      identities[id]=true;
  });
  if(ss.getSheetByName(BROWSER_REQUEST_TAB))rows_(ss,BROWSER_REQUEST_TAB).forEach(function(r){
    var id=String(r[0]||'');
    if(/^MIO-W-[a-f0-9]{24}$/.test(id) && String(r[3]||'')===mioId &&
       String(r[4]||'')==='承認済み')identities[id]=true;
  });
  return Object.keys(identities).length;
}

function createPair_(ss,web,d){
  if(!/^[a-f0-9]{64}$/.test(String(d.pairHash||'')))return {ok:false,error:'接続キーが不正です'};
  var approved=approvedBrowserSource_(ss,web,d.participantId,d.tokenHash);
  if(!approved)return {ok:false,error:'承認済みのブラウザから開始してください'};
  if(approvedBrowserCount_(ss,web,approved.id)>=MAX_APPROVED_BROWSERS_PER_MIO)
    return {ok:false,error:'接続できるブラウザは最大5件です。端末整理を管理者へ依頼してください'};
  var pairs=pairSheet_(ss),values=rows_(ss,PAIR_TAB),now=Date.now();
  var recent=values.filter(function(x){
    return String(x[1]||'')===d.participantId && (now-new Date(x[5]).getTime())<60*60*1000;
  });
  if(recent.length>=6)return {ok:false,error:'接続リンクの発行上限です。時間をおいてください'};
  if(values.some(function(x){return equal_(x[0],d.pairHash)}))return {ok:false,error:'接続キーが重複しました'};
  if(pairs.getLastRow()>=3000)return {ok:false,error:'接続キー保存の上限です'};
  var expiry=new Date(now+PAIR_TTL_MS);
  pairs.appendRow([d.pairHash,d.participantId,d.tokenHash,approved.id,
    safeText_(approved.name),new Date(now),expiry,'未使用','','']);
  SpreadsheetApp.flush();
  return {ok:true,participantId:d.participantId,expiresAt:expiry.toISOString(),expiresInSeconds:180};
}
function claimPair_(ss,web,d){
  if(!/^[a-f0-9]{64}$/.test(String(d.pairHash||'')))return {ok:false,error:'接続リンクを確認してください'};
  var pairs=ss.getSheetByName(PAIR_TAB);
  if(!pairs)return {ok:false,error:'接続リンクが見つかりません'};
  var items=rows_(ss,PAIR_TAB),matches=[];
  for(var i=0;i<items.length;i++)if(equal_(items[i][0],d.pairHash))matches.push({row:i+2,v:items[i]});
  if(matches.length!==1)return {ok:false,error:'接続リンクが無効です'};
  var pair=matches[0],record=pair.v;
  if(String(record[7])!=='未使用'||!record[6]||new Date(record[6]).getTime()<=Date.now())
    return {ok:false,error:'接続リンクは使用済み、または期限切れです'};
  if(String(record[1])===d.participantId)return {ok:false,error:'元のブラウザと同じ接続IDです'};
  var origin=approvedBrowserSource_(ss,web,String(record[1]),String(record[2]));
  if(!origin||origin.id!==String(record[3])||nameKey_(origin.name)!==nameKey_(record[4]))
    return {ok:false,error:'元のブラウザの認証が無効になりました'};
  // Re-check under the same ScriptLock: links already issued cannot exceed the five-browser limit.
  if(approvedBrowserCount_(ss,web,origin.id)>=MAX_APPROVED_BROWSERS_PER_MIO)
    return {ok:false,error:'接続できるブラウザは最大5件です。端末整理を管理者へ依頼してください'};
  var existingWeb=webActualRows_(web).map(function(r,i){return {v:r,row:i+2};})
    .filter(function(x){return String(x.v[0])===d.participantId});
  if(existingWeb.length>1)return {ok:false,error:'重複したブラウザ情報を運営が確認中です'};
  // A v1.9.2 pending browser can join safely without receiving a new Web-ID.
  if(existingWeb.length===1){
    var w=existingWeb[0],recordWeb=w.v;
    if(!equal_(recordWeb[1],d.tokenHash)||nameKey_(recordWeb[2])!==nameKey_(origin.name)||
       String(recordWeb[5])!=='承認待ち'||String(recordWeb[16])==='旧端末'||
       (recordWeb[7]&&String(recordWeb[7])!==origin.id)||
       (recordWeb[10]&&String(recordWeb[10])!==origin.id&&String(recordWeb[10])!==d.participantId))
      return {ok:false,error:'登録済みブラウザの本人確認が必要です'};
    web.getRange(w.row,6).setValue('承認済み');
    web.getRange(w.row,7).setValue(origin.member);
    web.getRange(w.row,8).setValue(origin.id);
    web.getRange(w.row,11).setValue(origin.id);
    web.getRange(w.row,12).setValue('確認済み');
    web.getRange(w.row,13).setValue(new Date());
    web.getRange(w.row,17).setValue('使用中');
    web.getRange(w.row,18).setValue('ワンタイムリンクで元の認証済みブラウザと接続');
    ensureWebDerivedRow_(web,w.row);
  }else{
  var sh=browserRequestSheet_(ss),claims=rows_(ss,BROWSER_REQUEST_TAB);
  var existing=claims.map(function(r,i){return {v:r,row:i+2}}).filter(function(x){return String(x.v[0])===d.participantId});
  if(existing.length>1)return {ok:false,error:'ブラウザ申請の重複を運営が確認中です'};
  if(existing.length===1){
    var x=existing[0];
    // A previously approved browser must never be reassigned to another MIO-ID.
    if(String(x.v[4])==='承認済み')
      return {ok:false,error:'すでに認証済みのブラウザです。別アカウントへ切り替える場合は管理者に連絡してください'};
    if(!equal_(x.v[1],d.tokenHash)||nameKey_(x.v[2])!==nameKey_(origin.name)||
       String(x.v[4])==='却下'||
       (x.v[3]&&String(x.v[3])!==origin.id))
      return {ok:false,error:'すでに別の接続申請があるため管理者確認が必要です'};
    sh.getRange(x.row,4).setValue(origin.id);
    sh.getRange(x.row,5).setValue('承認済み');
    sh.getRange(x.row,7).setValue(new Date());
    sh.getRange(x.row,8).setValue('認証済みブラウザ発行のワンタイムリンクで自動接続');
  }else{
    if(sh.getLastRow()>=500)return {ok:false,error:'接続申請の保存上限です'};
    sh.appendRow([d.participantId,d.tokenHash,safeText_(origin.name),origin.id,
      '承認済み',new Date(),new Date(),'ワンタイムリンクによる自動接続',origin.id]);
  }
  }
  pairs.getRange(pair.row,8).setValue('使用済み');
  pairs.getRange(pair.row,9).setValue(d.participantId);
  pairs.getRange(pair.row,10).setValue(new Date());
  SpreadsheetApp.flush();
  return {ok:true,verified:true,participantId:d.participantId,status:'承認済み',
    integratedParticipantId:origin.id,linked:true};
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
    ensureLoginIdHeader_(web);

    var all=webActualRows_(web),found=all.filter(function(r){return r[0]===d.participantId});
    // Both actions run under the existing ScriptLock and require bridge secret.
    if(d.action==='pair_create')return json_(createPair_(ss,web,d));
    if(d.action==='pair_claim')return json_(claimPair_(ss,web,d));

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
      var nameKey=nameKey_(name);
      var duplicates=all.filter(function(r){return nameKey_(r[2])===nameKey});
      var peopleByName=rows_(ss,'emuzii_参加者').filter(function(p){return nameKey_(p[1])===nameKey});
      var linked=peopleByName.length===1?peopleByName[0][0]:'';
      var matchState=peopleByName.length>1?'重複要確認':peopleByName.length===1?'既存一致':'フォーム/Web新規';
      // An existing person's name never creates another person/entitlement record.
      // Display name, user agent, login ID, or browser fingerprint alone never grants access.
      if(duplicates.length || peopleByName.length){
        if(!queueBrowserRequest_(ss,d,name,linked))
          return json_({ok:false,error:'接続申請が混み合っています。運営へ連絡してください'});
        return json_({ok:true,verified:true,participantId:d.participantId,
          status:'承認待ち',pendingReview:true,reviewType:'browser',loginId:''});
      }
      if(webActualCount_(web)>=499)return json_({ok:false,error:'登録上限です。運営に確認してください'});

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

    // Pending browser claims can only see their own review status.
    // Approved claims resolve to the EXISTING MIO-ID, never their own new history.
    if(found.length===0){
      var browserIdentity=browserIdentityFor_(ss,web,d);
      if(browserIdentity){
        if(browserIdentity.pending){
          if(d.action!=='status')return json_({ok:false,error:'新しいブラウザの利用を管理者が確認中です'});
          return json_({ok:true,participantId:d.participantId,
            name:browserIdentity.name,status:browserIdentity.status});
        }
        found=[browserIdentity.record];
      }
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
  var gate=typeof gachaOpenState_==='function'?gachaOpenState_(ss):{normalOpen:false,festOpen:false};
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
