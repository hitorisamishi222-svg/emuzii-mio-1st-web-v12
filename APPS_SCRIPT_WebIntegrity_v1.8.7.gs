/**
 * 翠央1周年 v1.8.7 Web登録行ヘルパー
 * 空行へ数式を事前投入せず、実データ行だけに復旧・整合判定を付与する。
 * 既存 APPS_SCRIPT_Code_v1.8.6.gs と同じ Apps Script プロジェクトへ追加する。
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
