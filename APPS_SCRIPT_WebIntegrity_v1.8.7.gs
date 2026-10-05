/**
 * 翠央1周年 v1.8.7 Web登録行ヘルパー
 * 空行へ数式を事前投入せず、実データ行だけに復旧・整合判定を付与する。
 * 同名の新端末を管理者が承認した時だけ、安全に旧端末を整理する。
 * 「翠央(お試し)」は自動却下しない。
 */
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

function setupWebRecoveryV187_(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction()==='webRecoveryOnEdit_')ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('webRecoveryOnEdit_').forSpreadsheet(SHEET_ID).onEdit().create();
}

function webRecoveryOnEdit_(e){
  if(!e||!e.range)return;
  var sh=e.range.getSheet();
  if(sh.getName()!==WEB_TAB||e.range.getRow()<2||e.range.getColumn()!==6)return;
  if(String(e.value||'')!=='承認済み')return;

  var ss=sh.getParent(),row=e.range.getRow();
  var webId=String(sh.getRange(row,1).getDisplayValue()||'');
  var name=String(sh.getRange(row,3).getDisplayValue()||'').trim();
  if(!webId||!name)return;

  var people=rows_(ss,'emuzii_参加者').filter(function(p){
    return p[1]===name&&/^MIO-\d{4}$/.test(String(p[0]||''));
  });

  if(people.length!==1){
    sh.getRange(row,18).setValue((name==='翠央(お試し)'?'管理者テスト保護／':'')+'承認済みだがMIO-IDを一意に確認できません');
    sh.getRange(row,19).setValue(new Date());
    ensureWebDerivedRow_(sh,row);
    return;
  }

  var id=String(people[0][0]);
  sh.getRange(row,8).setValue(id);
  sh.getRange(row,10).setValue('既存一致');
  sh.getRange(row,11).setValue(id);
  sh.getRange(row,12).setValue('確認済み');
  sh.getRange(row,17).setValue('使用中');
  sh.getRange(row,18).setValue((name==='翠央(お試し)'?'管理者テスト保護／':'')+'承認端末を使用中に設定・'+id+'へ統合確認');
  sh.getRange(row,19).setValue(new Date());
  ensureWebDerivedRow_(sh,row);
  SpreadsheetApp.flush();

  if(name!=='翠央(お試し)'){
    var last=webActualLastRow_(sh);
    var values=last>=2?sh.getRange(2,1,last-1,20).getValues():[];
    for(var i=0;i<values.length;i++){
      var otherRow=i+2,r=values[i];
      if(otherRow===row||String(r[2]||'')!==name||r[5]!=='承認済み')continue;
      var otherId=String(r[7]||r[10]||r[15]||'');
      if(otherId!==id)continue;
      sh.getRange(otherRow,6).setValue('却下');
      sh.getRange(otherRow,17).setValue('旧端末');
      sh.getRange(otherRow,18).setValue('新端末 '+webId+' 承認により旧端末へ自動整理／'+id+'維持');
      sh.getRange(otherRow,19).setValue(new Date());
      ensureWebDerivedRow_(sh,otherRow);
    }
  }

  SpreadsheetApp.flush();
  try{backupAfterWebMutation_(ss,webId,name,'端末復旧承認',name==='翠央(お試し)'?'管理者テスト保護・旧端末自動却下なし':id+'へ統合・同一ID旧端末を整理')}catch(ignore){}
}
