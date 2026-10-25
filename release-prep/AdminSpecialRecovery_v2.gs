/**
 * AdminSpecialRecovery_v2.gs — STAGING ONLY.
 * Requires explicit integration into Code.gs doPost after BRIDGE_SECRET validation
 * and BEFORE its normal participantId validation:
 * if (d.action === 'recover') return json_(adminSpecialRecoverV2_(d));
 * Do not deploy until integration tests and a production backup pass.
 */
var ASR2_TAB = 'emuzii_管理者復旧';
function asr2Digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map(function(b){return ('0'+(b<0?b+256:b).toString(16)).slice(-2)}).join('');
}
function asr2Hex_(n) {
  var bytes=[]; for(var i=0;i<n;i++)bytes.push(Math.floor(Math.random()*256));
  // Apps Script has no cryptographically secure byte RNG. Refuse to issue grants
  // until a secure random generator is provided by the server-side bridge.
  throw new Error('Secure grant generator not configured: no codes issued');
}
function asr2Tab_(ss) {
  var sh=ss.getSheetByName(ASR2_TAB);
  if(!sh)throw new Error('復旧管理シート未設定');
  return sh;
}
function adminSpecialRecoverV2_(d) {
  if(!/^[a-f0-9]{64}$/.test(String(d.grantHash||'')) ||
     !/^[a-f0-9]{64}$/.test(String(d.tokenHash||'')))
    return {ok:false,error:'invalid recovery proof'};
  var ss=SpreadsheetApp.openById(SHEET_ID),sh=asr2Tab_(ss);
  var rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,8).getValues():[];
  var matches=[];
  rows.forEach(function(r,i){if(r[1]===d.grantHash)matches.push({r:r,index:i+2})});
  if(matches.length!==1)return {ok:false,error:'invalid grant'};
  var m=matches[0],r=m.r,master=String(r[0]||'');
  if(['MIO-0010','MIO-0018'].indexOf(master)<0 || r[3]!=='承認済み')
    return {ok:false,error:'not authorized'};
  if(!(r[2] instanceof Date)||r[2].getTime()<=Date.now())
    return {ok:false,error:'expired'};
  if(r[4]==='使用済み') {
    // A retry is accepted only for the exact same bound token.
    if(r[6]!==d.tokenHash)return {ok:false,error:'already consumed'};
  } else if(r[4]!=='未使用')return {ok:false,error:'invalid grant state'};
  var web=ss.getSheetByName(WEB_TAB);
  if(!web)return {ok:false,error:'missing web table'};
  var webId=String(r[5]||'');
  if(!/^MIO-W-[a-f0-9]{24}$/.test(webId))
    return {ok:false,error:'pre-approved Web ID required'};
  var all=rows_(ss,WEB_TAB),matching=all.filter(function(x){return x[0]===webId});
  if(matching.length!==1)return {ok:false,error:'approved Web ID missing or duplicated'};
  var record=matching[0];
  if(record[5]!=='承認済み'||String(record[7])!==master)
    return {ok:false,error:'registration not approved'};
  if(r[4]==='未使用'){
    if(record[1]!==d.tokenHash)return {ok:false,error:'token not pre-bound'};
    sh.getRange(m.index,5,1,3).setValues([['使用済み',webId,d.tokenHash]]);
    SpreadsheetApp.flush();
  }
  return {ok:true,verified:true,recoveryApproved:true,recoveryConsumed:true,
    recoveryTokenBound:true,status:'承認済み',participantId:webId,
    approvedWebId:webId,integratedParticipantId:master,approvedMasterId:master,
    boundTokenHash:d.tokenHash};
}
