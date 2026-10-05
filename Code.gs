/**
 * 翠央1周年 v1.7.1 / Google Apps Script
 * 名前・回答・画像URLは匿名の公開APIへ出さない。
 * Vercelサーバーのsecretと端末用tokenHashを両方確認。
 */
var SHEET_ID = '1WqkXSV_UehRdpO9VVqRAL9ZTVXwD_GxlH3Ey50uX3PM';
var WEB_TAB = 'emuzii_Web登録';
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
}
function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)}
function equal_(a,b){a=String(a||'');b=String(b||'');var diff=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
function rows_(ss,name){var sh=ss.getSheetByName(name);return sh&&sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues():[]}
function safeText_(text){return /^[=+\-@]/.test(text)?"'"+text:text}
function jstYmd_(date){if(Utilities&&typeof Utilities.formatDate==='function')return Utilities.formatDate(date,'Asia/Tokyo','yyyy-MM-dd');var x=new Date(date.getTime()+9*60*60*1000);return x.toISOString().slice(0,10)}
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
    var all=rows_(ss,WEB_TAB),found=all.filter(function(r){return r[0]===d.participantId});
    if(d.action==='register') {
      if(found.length) {
        if(!equal_(found[0][1],d.tokenHash))return json_({ok:false,error:'unauthorized'});
        return json_({ok:true,verified:true,participantId:d.participantId,status:found[0][5]});
      }
      var name=String(d.name||'').trim();
      if(!name||name.length>40||/[\x00-\x1f]/.test(name))return json_({ok:false,error:'invalid name'});
      if(all.length>=499)return json_({ok:false,error:'登録上限です。運営に確認してください'});
      var duplicates=all.filter(function(r){return r[2]===name});
      var peopleByName=rows_(ss,'emuzii_参加者').filter(function(p){return p[1]===name});
      var linked=peopleByName.length===1?peopleByName[0][0]:'';
      var matchState=peopleByName.length>1?'重複要確認':peopleByName.length===1?'既存一致':'フォーム/Web新規';
      web.appendRow([d.participantId,d.tokenHash,safeText_(name),'申告なし',new Date(),'承認待ち','未確認',linked,duplicates.length?'同名Web登録あり・みお確認待ち':'',matchState,linked||d.participantId,'確認待ち','']);
      SpreadsheetApp.flush();
      var saved=rows_(ss,WEB_TAB).filter(function(r){return r[0]===d.participantId&&equal_(r[1],d.tokenHash)});
      return json_({ok:saved.length===1,verified:saved.length===1,participantId:d.participantId,status:'承認待ち'});
    }
    if(['status','catalog','draw','history','checkin'].indexOf(d.action)<0||found.length!==1||!equal_(found[0][1],d.tokenHash))return json_({ok:false,error:'unauthorized'});
    var r=found[0];
    if(d.action==='checkin')return json_(checkinAction_(ss,r,d));
    if(d.action!=='status')return json_(gachaAction_(ss,r,d));
    var out={ok:true,participantId:r[0],name:r[2],status:r[5]};
    if(r[5]!=='承認済み')return json_(out);
    // 運営が明示的に照合した参加者IDだけから予想・皆勤結果・回数を返す。
    var person=rows_(ss,'emuzii_参加者').filter(function(p){return p[0]===r[7]&&p[1]===r[2]});
    if(r[7]&&person.length!==1)return json_({ok:false,error:'運営による参加者IDの照合が必要です'});
    var id=person.length?person[0][0]:'';
    var att=rows_(ss,'emuzii_皆勤31日').filter(function(p){return id&&p[0]===id&&p[1]===r[2]});
    var gacha=rows_(ss,'emuzii_ガチャ').filter(function(p){return id&&p[0]===id&&p[1]===r[2]});
    var g=gacha.length===1?gacha[0]:null,confirmed=r[6]==='確認済み';
    if(g&&(g[12]!=='OK'||g[13]!=='OK'))return json_({ok:false,error:'ガチャ回数に要確認の項目があります'});
    var fa=rows_(ss,'emuzii_FA').filter(function(p){return p[1]===r[2]&&p[10]==='受付'});
    var used= g?(Number(g[6])||0)+(Number(g[9])||0)+draws_(ss,id).length:0;
    if(g&&used>Number(g[5]))return json_({ok:false,error:'使用回数を運営が確認中です'});
    var attendanceDays=att.length===1?Number(att[0][33])||0:0;
    var today=jstYmd_(new Date());
    var day=Number(today.slice(8,10)),todayDone=att.length===1&&today.slice(0,7)==='2026-10'&&att[0][day+1]==='○';
    out.progress={prediction:!!(person.length&&person[0][2]),attendanceAchieved:attendanceDays>=31,attendanceTodayDone:todayDone,fa:fa.length,
      gacha:{confirmed:confirmed,total:confirmed&&g?Number(g[5])||0:0,used:confirmed&&g?(Number(g[6])||0)+(Number(g[9])||0)+draws_(ss,id).length:0,remaining:confirmed&&g?Number(g[5])-used:0}};
    return json_(out);
  } catch(err) {return json_({ok:false,error:'連携処理を完了できませんでした'})}
  finally {lock.releaseLock()}
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
  if(!equal_(keyword,expected))return {ok:false,error:'確認文字が違います'};
  var sh=ss.getSheetByName('emuzii_皆勤31日'),values=sh.getRange(2,1,Math.max(sh.getLastRow()-1,1),2).getValues(),row=0;
  for(var i=0;i<values.length;i++)if(values[i][0]===r[7]&&values[i][1]===r[2]){row=i+2;break}
  if(!row)return {ok:false,error:'皆勤賞の参加者照合を確認してください'};
  var cell=sh.getRange(row,day+2);
  if(cell.getValue()==='○')return {ok:true,participantId:r[0],todayDone:true,message:'10/'+day+' は確認済みです'};
  cell.setValue('○');SpreadsheetApp.flush();
  return {ok:true,participantId:r[0],todayDone:true,message:'10/'+day+' の確認を受け付けました'};
}

var PRIZE_TAB='emuzii_景品設定',DRAW_TAB='emuzii_当選履歴';
function setupGacha_(){
 var ss=SpreadsheetApp.openById(SHEET_ID),p=ss.getSheetByName(PRIZE_TAB),h=ss.getSheetByName(DRAW_TAB);
 if(!p){p=ss.insertSheet(PRIZE_TAB);p.appendRow(['種類（通常/ラキフェス）','景品ID（重複不可）','景品名','レア度','確率（％・小数2桁まで）','有効','数量上限（空欄は制限なし）','運営メモ']);p.setFrozenRows(1);p.getRange('A1:H1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');p.getRange('A2:H101').setBackground('#fff2cc');p.getRange('A2:A101').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['通常','ラキフェス'],true).setAllowInvalid(false).build());p.getRange('F2:F101').insertCheckboxes();p.setColumnWidth(3,240);p.setColumnWidth(8,320);}
 p.getRange('E2:E101').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0,100).setAllowInvalid(false).setHelpText('各種類ごとに有効景品の確率合計を100％にしてください。小数第2位まで。').build()).setNumberFormat('0.00');
 p.getRange('G2:G101').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).setHelpText('0以上の整数。空欄は数量制限なし。').build()).setNumberFormat('0');
 p.getRange('E1').setNote('通常・ラキフェスそれぞれで、有効な景品の確率合計を100％にしてください。小数第2位まで。未設定や合計の不一致がある間は抽選できません。');
 p.getRange('H1').setNote('数量上限に達すると抽選は安全のため停止します。確率の再配分などを運営で確認してください。');
 var g=ss.getSheetByName('emuzii_ガチャ');
 if(g){
   g.getRange('C1:N1').setValues([['1ヶ月購入数','3ヶ月購入数','6ヶ月購入数','総ガチャ権利','通常ガチャ手動消費','総残り回数','ラキフェス解放','ラキフェス手動消費','ラキフェス残り候補','管理メモ','入力チェック','名前チェック']]);
   var used='COUNTIFS(\'emuzii_当選履歴\'!$C$2:$C,A2,\'emuzii_当選履歴\'!$K$2:$K,"確定")';
   var fest='COUNTIFS(\'emuzii_当選履歴\'!$C$2:$C,A2,\'emuzii_当選履歴\'!$E$2:$E,"ラキフェス",\'emuzii_当選履歴\'!$K$2:$K,"確定")';
   for(var row=2;row<=500;row++){
     var rowUsed=used.replace(/A2/g,'A'+row),rowFest=fest.replace(/A2/g,'A'+row);
     g.getRange(row,6).setFormula('=IF(B'+row+'="","",C'+row+'*\'emuzii_管理画面\'!$B$20+D'+row+'*\'emuzii_管理画面\'!$B$21+E'+row+'*\'emuzii_管理画面\'!$B$22)');
     g.getRange(row,8).setFormula('=IF(B'+row+'="","",MAX(F'+row+'-G'+row+'-J'+row+'-'+rowUsed+',0))');
     g.getRange(row,9).setFormula('=IF(B'+row+'="","",IF(F'+row+'>=\'emuzii_管理画面\'!$B$23,1,0))');
     g.getRange(row,11).setFormula('=IF(B'+row+'="","",IF(F'+row+'>=\'emuzii_管理画面\'!$B$23,MAX(H'+row+',0),0))');
     g.getRange(row,13).setFormula('=IF(B'+row+'="","",IF(OR(COUNT(C'+row+':E'+row+',G'+row+',J'+row+')<5,MIN(C'+row+':E'+row+',G'+row+',J'+row+')<0,C'+row+'<>INT(C'+row+'),D'+row+'<>INT(D'+row+'),E'+row+'<>INT(E'+row+'),G'+row+'<>INT(G'+row+'),J'+row+'<>INT(J'+row+'),G'+row+'+J'+row+'+'+rowUsed+'>F'+row+',AND(J'+row+'+'+rowFest+'>0,F'+row+'<\'emuzii_管理画面\'!$B$23)),"要確認","OK"))');
     g.getRange(row,14).setFormula('=IF(B'+row+'="","",IF(COUNTIF($B$2:$B$500,B'+row+')>1,"同名あり","OK"))');
   }
 }
 if(!h){h=ss.insertSheet(DRAW_TAB);h.appendRow(['抽選ID（変更不可）','Web参加ID','参加者ID','ColorSing名','種類','景品ID','景品名','確率（抽選時％）','抽選日時','通算何回目','結果']);h.setFrozenRows(1);h.getRange('A1:K1').setBackground('#092d60').setFontColor('#ffffff').setFontWeight('bold');h.getRange('I2:I1000').setNumberFormat('yyyy/mm/dd hh:mm:ss');}
}
function draws_(ss,id){return rows_(ss,DRAW_TAB).filter(function(x){return id&&x[2]===id&&x[10]==='確定'})}
function catalog_(ss,mode){
 var all=rows_(ss,PRIZE_TAB),active=all.filter(function(x){return x[0]===mode&&x[5]===true}),ids={},total=0,valid=active.length>0;
 var prizes=active.map(function(x){var chance=Number(x[4]),units=Math.round(chance*100),stock=x[6]===''?null:Number(x[6]);if(!/^[A-Za-z0-9_-]{1,40}$/.test(String(x[1]||''))||ids[x[1]]||!String(x[2]||'').trim()||!Number.isFinite(chance)||chance<=0||chance>100||Math.abs(chance*100-units)>0.00001||stock!==null&&(!Number.isSafeInteger(stock)||stock<0))valid=false;ids[x[1]]=true;total+=units;return {id:String(x[1]),name:String(x[2]),rarity:String(x[3]||''),chance:chance,units:units,stock:stock}});
 // 景品IDは種類をまたいでも重複させない。
 prizes.forEach(function(p){if(all.filter(function(x){return String(x[1])===p.id}).length!==1)valid=false});
 if(total!==10000)valid=false;
 var history=rows_(ss,DRAW_TAB);var exhausted=prizes.some(function(p){return p.stock!==null&&history.filter(function(x){return x[5]===p.id&&x[10]==='確定'}).length>=p.stock});
 return {ready:valid&&!exhausted,message:!valid?'景品と確率を設定中です（有効な景品の確率合計は100％）':exhausted?'数量上限に達した景品があります。運営の設定更新をお待ちください':'抽選できます',total:total/100,prizes:prizes};
}
function gachaAction_(ss,r,d){
 if(r[5]!=='承認済み')return {ok:false,error:'運営の登録承認をお待ちください'};
 var people=rows_(ss,'emuzii_参加者').filter(function(x){return x[0]===r[7]&&x[1]===r[2]});
 if(!r[7]||people.length!==1)return {ok:false,error:'運営による参加者IDの照合が必要です'};
 var id=r[7],history=draws_(ss,id),publicHistory=history.map(function(x){return {drawId:x[0],mode:x[4],prize:x[6],date:x[8],ordinal:x[9]}});
 if(d.action==='history')return {ok:true,participantId:r[0],history:publicHistory.slice(-50).reverse()};
 var gs=rows_(ss,'emuzii_ガチャ').filter(function(x){return x[0]===id&&x[1]===r[2]}),g=gs.length===1?gs[0]:null;
 if(!g||g[12]!=='OK'||g[13]!=='OK')return {ok:false,error:'運営によるガチャ回数の確認が必要です'};
 var manual=Number(g[6])+Number(g[9]),total=Number(g[5]),used=manual+history.length,remaining=total-used,confirmed=r[6]==='確認済み';
 if(!Number.isSafeInteger(manual)||!Number.isSafeInteger(total)||manual<0||total<0||remaining<0)return {ok:false,error:'ガチャ回数を運営が確認中です'};
 var normal=catalog_(ss,'通常'),fest=catalog_(ss,'ラキフェス');
 if(d.action==='catalog')return {ok:true,participantId:r[0],confirmed:confirmed,remaining:confirmed?remaining:0,used:used,festUnlocked:total>=5,normal:normal,fest:fest};
 if(!/^[a-f0-9]{32}$/.test(d.drawId||'')||['通常','ラキフェス'].indexOf(d.mode)<0)return {ok:false,error:'抽選要求が不正です'};
 var previous=rows_(ss,DRAW_TAB).filter(function(x){return x[0]===d.drawId});
 if(previous.length){var old=previous[0];if(previous.length!==1||old[1]!==r[0]||old[2]!==id||old[4]!==d.mode)return {ok:false,error:'抽選IDを確認できません'};return {ok:true,participantId:r[0],drawId:old[0],prize:old[6],mode:old[4],ordinal:old[9],replayed:true};}
 if(!confirmed)return {ok:false,error:'メンシプ購入の確認をお待ちください'};
 if(remaining<1)return {ok:false,error:'残り回数がありません'};
 if(d.mode==='ラキフェス'&&total<5)return {ok:false,error:'ラキフェスは総ガチャ権利5回以上で解放されます'};
 var c=d.mode==='通常'?normal:fest;if(!c.ready)return {ok:false,error:c.message};
 // 複数のUUIDのハッシュから32ビット値を作る。ブラウザーの抽選値は使用しない。
 var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.getUuid()+Utilities.getUuid());
 var random=0;for(var i=0;i<4;i++)random=random*256+((bytes[i]+256)%256);
 var point=Math.floor(random/4294967296*10000),sum=0,winner=null;
 for(var j=0;j<c.prizes.length;j++){sum+=c.prizes[j].units;if(point<sum){winner=c.prizes[j];break}}
 if(!winner)return {ok:false,error:'抽選設定を確認してください'};
 // 履歴の1行だけを確定情報とし、回数はそこから集計する。再試行時はこの行を返す。
 ss.getSheetByName(DRAW_TAB).appendRow([d.drawId,r[0],id,safeText_(r[2]),d.mode,winner.id,safeText_(winner.name),winner.chance,new Date(),used+1,'確定']);SpreadsheetApp.flush();
 return {ok:true,participantId:r[0],drawId:d.drawId,prize:winner.name,mode:d.mode,ordinal:used+1,replayed:false};
}
