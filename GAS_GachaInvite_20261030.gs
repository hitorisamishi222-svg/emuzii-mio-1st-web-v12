/**
 * 招待ガチャ専用・追加GASファイル（既存のシート紐づけApps Script用）。
 * GASの既存 doPost 内、BRIDGE_SECRETとparticipantId/tokenHash検証後、
 * ssとwebの取得が済んだ位置に次の1行を追加する：
 * if(d.action==='inviteRedeem')return json_(gachaInviteRedeem_(ss,web,d));
 * doPostは既存のScriptLock内で動作するため、コード消費は排他制御される。
 * このファイル単独では公開機能を有効にしない。
 */
var GACHA_INVITE_TAB='emuzii_ガチャ招待';
function gachaInviteHash_(code){
 return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,code)
 .map(function(v){return ('0'+((v+256)%256).toString(16)).slice(-2)}).join('');
}
function gachaInviteTable_(ss,create){
 var sh=ss.getSheetByName(GACHA_INVITE_TAB);
 if(!sh&&create){
  sh=ss.insertSheet(GACHA_INVITE_TAB);
  sh.getRange(1,1,1,9).setValues([['コードSHA256','MIO-ID','対象者名','有効期限','使用日時','使用Web-ID','発行管理者','発行日時','状態']]);
  sh.setFrozenRows(1);
  sh.hideColumns(1); // The code hash is not a user-facing value.
 }
 return sh;
}
function gachaInviteRows_(sheet){
 if(!sheet)return [];
 var n=Math.max(0,sheet.getLastRow()-1);
 return n?sheet.getRange(2,1,n,9).getValues():[];
}
function gachaInviteQualified_(ss,memberId){
 if(!/^MIO-\d{4}$/.test(memberId))throw new Error('対象のMIO-IDが不正です');
 var p=rows_(ss,'emuzii_参加者').filter(function(r){return r[0]===memberId&&String(r[1]||'').trim();});
 var g=rows_(ss,'emuzii_ガチャ').filter(function(r){return r[0]===memberId&&p.length===1&&r[1]===p[0][1]});
 if(p.length!==1||g.length!==1)throw new Error('既存の参加者IDとガチャ台帳を照合できません');
 if(g[0][12]!=='OK'||g[0][13]!=='OK')throw new Error('ガチャ台帳の入力または名前の確認が必要です');
 var remaining=Number(g[0][7]),total=Number(g[0][5]);
 if(!Number.isSafeInteger(remaining)||!Number.isSafeInteger(total)||remaining<1||total<1)
   throw new Error('ガチャ回数の付与と残回数を確認してください');
 return {id:memberId,name:String(p[0][1]),remaining:remaining};
}
/** Run from the EXISTING bound script as one of the two verified administrators. */
function gachaInviteIssue(memberId,hours){
 if(typeof gachaRapidAdmin_!=='function')throw new Error('既存の二管理者認証機能が必要です');
 var admin=gachaRapidAdmin_();
 var lock=LockService.getScriptLock();
 if(!lock.tryLock(15000))throw new Error('別の運営操作中です');
 try{
  var ss=SpreadsheetApp.openById(GACHA_RAPID_SHEET_ID),member=gachaInviteQualified_(ss,String(memberId||''));
  var table=gachaInviteTable_(ss,true),now=new Date();
  if(gachaInviteRows_(table).some(function(r){return r[1]===member.id&&r[8]==='有効'&&r[3] instanceof Date&&r[3]>now;}))
    throw new Error('すでに有効な招待コードがあります。旧コードを無効化してから発行してください');
  var h=Number(hours===undefined?48:hours);
  if(!Number.isSafeInteger(h)||h<1||h>72)throw new Error('有効時間は1〜72時間にしてください');
  var code='MI'+gachaInviteHash_(Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid()).slice(0,16).toUpperCase();
  var expires=new Date(now.getTime()+h*3600000);
  table.appendRow([gachaInviteHash_(code),member.id,member.name,expires,'','',admin.email,now,'有効']);
  return {code:'MI-'+code.slice(2,6)+'-'+code.slice(6,10)+'-'+code.slice(10,14)+'-'+code.slice(14,18),
   participantId:member.id,name:member.name,remaining:member.remaining,expires:expires.toISOString()};
 }finally{lock.releaseLock()}
}
/** Administrators can revoke an unused code for an exact MIO-ID. */
function gachaInviteRevoke(memberId){
 if(typeof gachaRapidAdmin_!=='function')throw new Error('既存の二管理者認証が必要です');
 gachaRapidAdmin_();
 var lock=LockService.getScriptLock();
 if(!lock.tryLock(15000))throw new Error('別の運営操作中です');
 try{
  var ss=SpreadsheetApp.openById(GACHA_RAPID_SHEET_ID),t=gachaInviteTable_(ss,false);
  if(!t)return 0;
  var count=0;
  gachaInviteRows_(t).forEach(function(r,i){
   if(r[1]===memberId&&r[8]==='有効'&&!r[4]){t.getRange(i+2,9).setValue('無効');count++}
  });
  return count;
 }finally{lock.releaseLock()}
}
/** Called ONLY from verified doPost after the existing secret/identity checks, inside its lock. */
function gachaInviteRedeem_(ss,web,d){
 var code=String(d.code||'').toUpperCase().replace(/[\s-]/g,'');
 if(!/^MI[0-9A-F]{16}$/.test(code))return {ok:false,error:'招待コードが不正です'};
 if(!/^MIO-W-[a-f0-9]{24}$/.test(d.participantId||'')||!/^[a-f0-9]{64}$/.test(d.tokenHash||''))
   return {ok:false,error:'招待端末の本人確認に失敗しました'};
 var t=gachaInviteTable_(ss,false);
 if(!t)return {ok:false,error:'現在、招待ガチャは受付準備中です'};
 var matched=gachaInviteRows_(t).map(function(r,i){return {data:r,row:i+2};})
   .filter(function(x){return x.data[0]===gachaInviteHash_(code)});
 if(matched.length!==1)return {ok:false,error:'招待コードを確認できません'};
 var x=matched[0],r=x.data,memberId=String(r[1]||''),existing=webActualRows_(web)
   .filter(function(w){return w[0]===d.participantId});
 // Idempotency for an unknown network outcome: only the original device can recover.
 if(r[8]==='使用済み'&&r[5]===d.participantId&&existing.length===1&&
    equal_(existing[0][1],d.tokenHash)&&existing[0][7]===memberId&&existing[0][5]==='承認済み')
   return {ok:true,verified:true,participantId:d.participantId,status:'承認済み',remaining:gachaInviteQualified_(ss,memberId).remaining};
 if(r[8]!=='有効'||r[4]||r[5])return {ok:false,error:'この招待コードは使用済みか無効です'};
 if(!(r[3] instanceof Date)||r[3].getTime()<=Date.now())return {ok:false,error:'招待コードの期限が切れています'};
 if(existing.length)return {ok:false,error:'この端末の招待登録を管理者が確認中です'};
 var member=gachaInviteQualified_(ss,memberId);
 if(member.name!==r[2])return {ok:false,error:'発行時から参加者名が変更されています'};
 if(webActualCount_(web)>=499)return {ok:false,error:'端末受付上限です'};
 var row=webNextRow_(web);
 if(!row) return {ok:false,error:'登録先の空きがありません'};
 // Consume first: a partial failure must not allow code replay for another browser.
 t.getRange(x.row,5,1,2).setValues([[new Date(),d.participantId]]);
 t.getRange(x.row,9).setValue('使用済み');
 SpreadsheetApp.flush();
 web.getRange(row,1,1,21).setValues([[
  d.participantId,d.tokenHash,member.name,'招待ガチャのみ',new Date(),
  '承認済み','確認済み',member.id,'招待コード認証・会員登録不要','既存一致',
  member.id,'確認済み',new Date(),'','',member.id,'未指定',
  'ガチャ専用・皆勤入口では利用不可',new Date(),'',''
 ]]);
 ensureWebDerivedRow_(web,row);
 SpreadsheetApp.flush();
 var v=web.getRange(row,1,1,21).getValues()[0];
 if(v[0]!==d.participantId||!equal_(v[1],d.tokenHash)||v[7]!==member.id||
    v[10]!==member.id||v[11]!=='確認済み'||v[5]!=='承認済み'||!webIntegrityOk_(v))
   return {ok:false,error:'管理台帳の反映確認が必要です。再発行は管理者に依頼してください'};
 return {ok:true,verified:true,participantId:d.participantId,status:'承認済み',remaining:member.remaining};
}
