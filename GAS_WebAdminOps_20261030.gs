/**
 * MIO Web operator service. Add to EXISTING Apps Script; DO NOT run setup.
 * Dispatcher in existing doPost AFTER BRIDGE_SECRET comparison, inside ScriptLock:
 *   if(/^webAdminOps(?:Read|DrawLookup|Approve|Grant|Review|Create|Intake)$/.test(d.action))
 *     return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));
 * This file never changes check-in or draw logic.
 */
function mioAdminOps_(ss,d){
 var action=String(d.action||'');
 if(action==='webAdminOpsRead')return mioAdminOpsRead_(ss,d);
 if(action==='webAdminOpsDrawLookup')return mioAdminOpsDrawLookup_(ss,d);
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
 var pending=web.filter(function(r){return r.status==='承認待ち'||(r.status==='承認済み'&&r.integrity!=='確認済み');}).slice(-80).reverse();
 var simple=[];for(var l=0;l<fresh.length;l++){var fr=fresh[l];if(!mioAdminOpsStr_(fr[1]))continue;simple.push({row:l+2,name:mioAdminOpsStr_(fr[1]),browserId:mioAdminOpsStr_(fr[2]),status:mioAdminOpsStr_(fr[4])||'未確認',note:mioAdminOpsStr_(fr[5]).slice(0,120)});}
 var roster=[];Object.keys(byId).forEach(function(id){var x=byId[id],gg=(grants[id]||[]);roster.push({mioId:id,name:x.name,gacha:gg.length===1?gg[0]:null,needsReview:gg.length!==1});});
 // Private operator-only identity links. Never include tokenHash, login ID, or raw cookie.
 var webLinks=web.map(function(r){
  var approved=r.status==='承認済み'&&r.integrity==='確認済み'&&/^MIO-\d{4}$/.test(r.mioId)&&r.linkedName;
  return {webId:r.webId,name:approved?r.linkedName:r.name,mioId:approved?r.mioId:'',verified:!!approved};
 });
 return {ok:true,pending:pending,roster:roster,webLinks:webLinks,simple:simple.slice(-60).reverse(),totalPending:web.filter(function(x){return x.status==='承認待ち'||(x.status==='承認済み'&&x.integrity!=='確認済み');}).length,rejectedCount:web.filter(function(x){return x.status==='却下'}).length};
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
 if(previous){
  var note=d.memberConfirmed?'メンシプ確認済み':'メンシプ未確認';
  if(previous.c[2]!=='承認'||previous.c[3]!==wid||previous.c[4]!==id||
     mioAdminOpsStr_(previous.c[8])!==note)
    throw new Error('操作IDの再利用は禁止です');
  if(previous.c[7]==='確定')return {ok:true,replayed:true};
  // A network error may occur after F=承認済み but before the audit is finalized.
  // Verify the same browser, ID, identity, and member state before closing it.
  var retryWeb=mioAdminOpsSheet_(ss,'emuzii_Web登録');
  var retryRows=mioAdminOpsValues_(retryWeb,21);
  var confirmed=mioAdminOpsOne_(retryRows,0,wid).c;
  if(confirmed[5]==='承認済み'&&mioAdminOpsStr_(confirmed[7])===id&&
     mioAdminOpsStr_(confirmed[10])===id&&confirmed[11]==='確認済み'&&
     confirmed[6]===(d.memberConfirmed?'確認済み':'未確認')&&
     confirmed[16]!=='旧端末'&&webIntegrityOk_(confirmed)&&
     !retryRows.some(function(r){return r[0]!==wid&&r[7]===id&&r[5]==='承認済み'})){
    log.getRange(previous.row,8).setValue('確定');
    return {ok:true,replayed:true,mioId:id,status:'承認済み',member:confirmed[6]};
  }
  throw new Error('前の処理を管理者が確認中です');
 }
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
 if(!name)throw new Error('簡易登録の対象名がありません');
 var log=mioAdminOpsLog_(ss),old=mioAdminOpsExisting_(log,op);
 if(old){
   // Store the exact intake row in audit column D so that an interrupted
   // review cannot accidentally confirm a different person at a later row.
   var target='簡易受付:'+row;
   if(old.c[2]!=='簡易確認'||mioAdminOpsStr_(old.c[3])!==target||
      mioAdminOpsStr_(old.c[5])!==status||mioAdminOpsStr_(old.c[6])!=='確認済み'||
      mioAdminOpsName_(old.c[9])!==mioAdminOpsName_(name))
     throw new Error('操作IDの再利用は禁止です');
   if(actual!=='確認済み')throw new Error('簡易登録の変更状態を確認してください');
   if(old.c[7]!=='確定'){
     if(old.c[7]!=='処理中')throw new Error('操作履歴を確認してください');
     log.getRange(old.row,8).setValue('確定');
   }
   return {ok:true,replayed:true,status:'確認済み'};
 }
 if(actual!==status)throw new Error('簡易登録状態が変更されています');
 if(actual==='確認済み')return {ok:true,replayed:true};
 var lrow=mioAdminOpsWriteLog_(log,op,'簡易確認','簡易受付:'+row,'',actual,'確認済み','Web受付状況確認',name);
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
   if(past.c[2]!=='初訪問受付'||mioAdminOpsName_(past.c[9])!==mioAdminOpsName_(name)||
      mioAdminOpsStr_(past.c[8])!==note)
     throw new Error('操作IDの再利用は禁止です');
   if(past.c[7]==='確定')return {ok:true,replayed:true};
   if(past.c[7]!=='処理中')throw new Error('同じ操作の受付状態を確認してください');
   // If the first attempt wrote the intake row but lost its response, do not
   // append another record. Match the unique Web-created row and audit time.
   var pendingSheet=mioAdminOpsSheet_(ss,'emuzii_新規簡易登録');
   var started=Date.parse(past.c[0]);
   if(!Number.isFinite(started))throw new Error('受付履歴の日時を確認してください');
   var matching=mioAdminOpsValues_(pendingSheet,6).filter(function(r){
     var when=Date.parse(r[0]),status=mioAdminOpsStr_(r[4]);
     return mioAdminOpsName_(r[1])===mioAdminOpsName_(name)&&
       mioAdminOpsStr_(r[2])===''&&mioAdminOpsStr_(r[3])==='Web運営受付'&&
       (status==='管理確認待ち'||status==='確認済み')&&
       mioAdminOpsStr_(r[5])===note&&
       Number.isFinite(when)&&when>=started-5000&&when<=started+900000;
   });
   if(matching.length===1){
     history.getRange(past.row,8).setValue('確定');
     return {ok:true,replayed:true,status:mioAdminOpsStr_(matching[0][4])};
   }
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

// READ ONLY: exact draw ID, exact Web ID, verified canonical MIO ID. No draw, no grant.
function mioAdminOpsDrawLookup_(ss,d){
 var wid=mioAdminOpsStr_(d.webId),drawId=mioAdminOpsStr_(d.drawId);
 if(!/^MIO-W-[a-f0-9]{24}$/.test(wid)||!/^[a-f0-9]{32}$/.test(drawId))
  throw new Error('抽選照会IDが不正です');
 var web=mioAdminOpsValues_(mioAdminOpsSheet_(ss,'emuzii_Web登録'),21);
 var matched=web.filter(function(r){return mioAdminOpsStr_(r[0])===wid});
 if(matched.length!==1)return {ok:true,status:'identity_unverified'};
 var r=matched[0],id=mioAdminOpsStr_(r[7]);
 if(r[5]!=='承認済み'||r[11]!=='確認済み'||!/^MIO-\d{4}$/.test(id))
  return {ok:true,status:'identity_unverified'};
 var h=mioAdminOpsSheet_(ss,'emuzii_当選履歴'),length=h.getLastRow()-1;
 if(length>20000)throw new Error('当選履歴が読み取り検証上限を超えています');
 if(length<1)return {ok:true,status:'unconfirmed'};
 var rowNums=h.getRange(2,1,length,1).getValues(),rows=[];
 for(var i=0;i<rowNums.length;i++)if(mioAdminOpsStr_(rowNums[i][0])===drawId)rows.push(i+2);
 if(rows.length>1)return {ok:true,status:'conflict'};
 if(!rows.length)return {ok:true,status:'unconfirmed'};
 var x=h.getRange(rows[0],1,1,13).getValues()[0],ordinal=Number(x[9]);
 if(mioAdminOpsStr_(x[1])!==wid||mioAdminOpsStr_(x[2])!==id||
    mioAdminOpsStr_(x[10])!=='確定'||['通常','ラキフェス'].indexOf(mioAdminOpsStr_(x[4]))<0||
    !mioAdminOpsStr_(x[6])||!isFinite(ordinal)||ordinal<1||Math.floor(ordinal)!==ordinal)
  return {ok:true,status:'conflict'};
 return {ok:true,status:'confirmed',webId:wid,mioId:id,name:mioAdminOpsStr_(r[2]),
  drawId:drawId,mode:mioAdminOpsStr_(x[4]),prize:mioAdminOpsStr_(x[6]),
  ordinal:ordinal,rarity:mioAdminOpsStr_(x[11]),image:mioAdminOpsStr_(x[12])};
}
