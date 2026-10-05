/**
 * 翠央1周年 v1.8.7 端末変更・復旧アドオン
 * APPS_SCRIPT_Code_v1.8.7.gs と同じ既存Apps Scriptプロジェクトへ追加する。
 * 管理者が emuzii_Web登録 の「登録承認」を承認済みに変更した時だけ動作する。
 * 「翠央(お試し)」は自動却下しない。
 */

function setupV187Complete(){
  setup();
  setupWebRecoveryV187_();
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
