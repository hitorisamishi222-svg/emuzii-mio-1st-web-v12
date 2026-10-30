/**
 * 2026-10-30 emergency: only TWO switches controlled by Web management page.
 * Must be added to the EXISTING GAS, not a new project.
 * In its existing doPost, after verifying BRIDGE_SECRET and opening the sheet,
 * before MIO-W identity validation, branch admin-only actions:
 *
 * if(d.action==='webGateRead'||d.action==='webGateSet'){
 *   return json_(gachaWebGateAction_(SpreadsheetApp.openById(SHEET_ID),d));
 * }
 *
 * IMPORTANT: Above branch MUST remain after the existing BRIDGE_SECRET check,
 * and INSIDE the existing ScriptLock. No other functions are replaced.
 */
function gachaWebGateState_(ss){
 var admin=ss.getSheetByName('emuzii_管理画面');
 var panel=ss.getSheetByName('emuzii_ガチャ緊急管理_1030');
 if(!admin||!panel)throw new Error('管理シートの接続がありません');
 // Guard against unrelated columns or moved labels.
 if(String(admin.getRange('A141').getDisplayValue()).trim()!=='メンシプガチャ受付'||
    String(admin.getRange('A142').getDisplayValue()).trim()!=='ラキフェス受付'||
    String(panel.getRange('A2').getDisplayValue()).trim()!=='通常ガチャ'||
    String(panel.getRange('C2').getDisplayValue()).trim()!=='ラキフェス')
    throw new Error('管理スイッチの配置が一致しません');
 var n=panel.getRange('B2').getValue(),f=panel.getRange('D2').getValue();
 var liveN=admin.getRange('B141').getValue(),liveF=admin.getRange('B142').getValue();
 if(typeof n!=='boolean'||typeof f!=='boolean'||
    typeof liveN!=='boolean'||typeof liveF!=='boolean'||
    n!==liveN||f!==liveF)
    throw new Error('管理画面のON/OFF連動が確認できません');
 return {ok:true,gateConfigured:true,normalOpen:liveN,festOpen:liveF};
}
function gachaWebGateAction_(ss,d){
 var before=gachaWebGateState_(ss);
 if(d.action==='webGateRead')return before;
 if(d.action!=='webGateSet'||['通常','ラキフェス'].indexOf(d.mode)<0||
    typeof d.enabled!=='boolean'||typeof d.expected!=='boolean')
    throw new Error('ON/OFFの指定が不正です');
 var old=d.mode==='通常'?before.normalOpen:before.festOpen;
 if(old!==d.expected)throw new Error('別の操作で受付状態が変更されています。画面を更新してください');
 if(old===d.enabled)return before;
 var panel=ss.getSheetByName('emuzii_ガチャ緊急管理_1030');
 var address=d.mode==='通常'?'B2':'D2';
 panel.getRange(address).setValue(d.enabled);
 SpreadsheetApp.flush();
 var after=gachaWebGateState_(ss);
 if((d.mode==='通常'?after.normalOpen:after.festOpen)!==d.enabled)
   throw new Error('受付設定の反映を確認できません。シートをご確認ください');
 return after;
}
