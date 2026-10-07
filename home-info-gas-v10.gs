function homeInfoV10_(){
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('emuzii_連携設定');
  if(!sh)throw new Error('home info sheet missing');
  var now=new Date();
  var notices=homeNoticeRowsV10_(sh.getRange('A34:H49').getValues(),now);
  var schedules=homeScheduleRowsV10_(sh.getRange('A53:H68').getValues(),now);
  return {ok:true,serverTime:now.toISOString(),notices:notices,schedules:schedules};
}
function homeBoolV10_(v){return v===true||String(v).toLowerCase()==='true'||String(v)==='1'}
function homeDateV10_(v){
  if(v instanceof Date&&!isNaN(v.getTime()))return v;
  var s=String(v||'').trim();if(!s)return null;
  var m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if(!m)return null;
  var iso=m[1]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[3]).slice(-2)+'T'+('0'+(m[4]||0)).slice(-2)+':'+(m[5]||'00')+':00+09:00';
  var d=new Date(iso);return isNaN(d.getTime())?null:d;
}
function homeTimeV10_(v){
  if(v instanceof Date&&!isNaN(v.getTime()))return Utilities.formatDate(v,'Asia/Tokyo','HH:mm');
  var s=String(v||'').trim(),m=s.match(/^(\d{1,2}):(\d{2})/);
  return m?('0'+m[1]).slice(-2)+':'+m[2]:'';
}
function homeSafeUrlV10_(v){var s=String(v||'').trim();return /^https:\/\//i.test(s)?s:''}
function homeNoticeRowsV10_(rows,now){
  var rank={'緊急':0,'重要':1,'通常':2};
  return rows.map(function(r,i){
    var st=homeDateV10_(r[5]),en=homeDateV10_(r[6]);
    return {id:String(r[0]||('NEWS-'+(i+1))),show:homeBoolV10_(r[1]),level:String(r[2]||'通常'),title:String(r[3]||''),body:String(r[4]||''),start:st,end:en,url:homeSafeUrlV10_(r[7])};
  }).filter(function(x){return x.show&&x.title&&(!x.start||x.start<=now)&&(!x.end||x.end>=now)})
  .sort(function(a,b){var ra=rank[a.level]===undefined?2:rank[a.level],rb=rank[b.level]===undefined?2:rank[b.level];return ra!==rb?ra-rb:(b.start?b.start.getTime():0)-(a.start?a.start.getTime():0)})
  .slice(0,5).map(function(x){return {id:x.id,level:x.level,title:x.title,body:x.body,publishedAt:x.start?x.start.toISOString():null,url:x.url}});
}
function homeScheduleRowsV10_(rows,now){
  return rows.map(function(r,i){
    var date=r[2] instanceof Date?Utilities.formatDate(r[2],'Asia/Tokyo','yyyy/MM/dd'):String(r[2]||'').trim();
    var st=homeDateV10_(date+' '+(homeTimeV10_(r[3])||'00:00'));
    var en=homeDateV10_(date+' '+(homeTimeV10_(r[4])||'23:59'));
    if(st&&en&&en<st)en=new Date(en.getTime()+86400000);
    return {id:String(r[0]||('LIVE-'+(i+1))),show:homeBoolV10_(r[1]),start:st,end:en,title:String(r[5]||''),body:String(r[6]||''),url:homeSafeUrlV10_(r[7])};
  }).filter(function(x){return x.show&&x.title&&x.start&&(!x.end||x.end.getTime()>now.getTime())})
  .sort(function(a,b){return a.start-b.start}).slice(0,5)
  .map(function(x){return {id:x.id,startAt:x.start.toISOString(),endAt:x.end?x.end.toISOString():null,title:x.title,body:x.body,url:x.url}});
}
function homeInfoResponseV10_(){
  return ContentService.createTextOutput(JSON.stringify(homeInfoV10_()))
    .setMimeType(ContentService.MimeType.JSON);
}
