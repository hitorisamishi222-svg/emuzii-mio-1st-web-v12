/**
 * MIO Web operator service. Add to EXISTING Apps Script; DO NOT run setup.
 * Dispatcher in existing doPost AFTER BRIDGE_SECRET comparison, inside ScriptLock:
 *   if(/^webAdminOps(?:Read|Approve|Grant|Review)$/.test(d.action))
 *     return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));
 * This file never changes check-in or draw logic.
 */
function mioAdminOps_(ss,d){
 var action=String(d.action||'');
 if(action==='webAdminOpsRead')return mioAdminOpsRead_(ss,d);
 if(action==='webAdminOpsApprove')return mioAdminOpsApprove_(ss,d);
 if(action==='webAdminOpsGrant')return mioAdminOpsGrant_(ss,d);
 if(action==='webAdminOpsReview')return mioAdminOpsReview_(ss,d);
 throw new Error('未対応の管理操作です');
}
function mioAdminOpsStr_(x){return String(x===null||x===undefined?'':x).trim()}
function mioAdminOpsName_(s){return mioAdminOpsStr_(s).normalize('NFKC').replace(/[\s\u3000]/g,'').toLowerCase()}
function mioAdminOpsSheet_(ss,name){var sh=ss.getSheetByName(name);if(!sh)throw new Error('必要な管理シートがありません');return sh}
function mioAdminOpsValues_(sh,lastCol){
 var n=Math.min(sh.getLastRow(),500)-1;
 return n>0?sh.getRange(2,1,n,lastCol).getValues():[];
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
 return mioAdminOpsSummary_(ss,all);
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
 var row=mioAdminOpsWriteLog_(log,op,'承認',wid,id,'承認待ち','承認済み',d.memberConfirmed?'メンシプ確認済み':'メンシプ未確認',mioAdminOpsStr_(w.c[2]));
 if(!w.c[7])web.getRange(w.row,8).setValue(id);
 web.getRange(w.row,7).setValue(d.memberConfirmed?'確認済み':'未確認');
 web.getRange(w.row,6).setValue('承認済み');
 SpreadsheetApp.flush();
 var confirmed=web.getRange(w.row,6,1,7).getValues()[0];
 if(confirmed[0]!=='承認済み'||mioAdminOpsStr_(confirmed[2])!==id)throw new Error('承認結果を確認できません');
 log.getRange(row,8).setValue('確定');
 return {ok:true,mioId:id,status:'承認済み',member:confirmed[1]};
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
   if(current===expected+count){log.getRange(prev.row,8).setValue('確定');return {ok:true,replayed:true,mioId:id};}
   if(current!==expected)throw new Error('保留中の付与記録を手動確認してください');
   // Retry the logged intent once, under the existing ScriptLock.
   sheet.getRange(g.row,15).setValue(expected+count);
   SpreadsheetApp.flush();
   if(Number(sheet.getRange(g.row,15).getValue())!==expected+count)throw new Error('付与結果が一致しません');
   log.getRange(prev.row,8).setValue('確定');
   return {ok:true,replayed:true,mioId:id};
 }
 var old=Number(sheet.getRange(g.row,15).getValue());
 if(old!==expected)throw new Error('先に付与回数が変更されています。再読込してください');
 var row=mioAdminOpsWriteLog_(log,op,'付与','',id,old,old+count,reason,name);
 sheet.getRange(g.row,15).setValue(old+count);
 SpreadsheetApp.flush();
 if(Number(sheet.getRange(g.row,15).getValue())!==old+count)throw new Error('付与結果が一致しません');
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
