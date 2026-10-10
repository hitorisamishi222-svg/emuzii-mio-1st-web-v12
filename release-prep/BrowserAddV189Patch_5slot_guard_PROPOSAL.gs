/** 
 * 本番適用前レビュー専用：BrowserAddV189Patch.gs の最大5ブラウザ上限ガード。
 * ファイル全体の代替ではない。Code.gs v1.9.4 に approvedBrowserCount_ があることが前提。
 * 既存ユーザーの承認/皆勤/ガチャ/FAを一切変更しない。
 */
function assertBrowserSlotsBeforeManualAddV199_(ss, web, targetRowData, expectedMioId) {
  var id=String(expectedMioId||'');
  if(!/^MIO-\d{4}$/.test(id))throw Error('MIO-IDが不正です');
  if(typeof approvedBrowserCount_!=='function'||typeof MAX_APPROVED_BROWSERS_PER_MIO!=='number')
    throw Error('ブラウザ管理の更新準備中です');
  var record=targetRowData||[];
  if(String(record[7]||'')!==id||String(record[10]||'')!==id||
     String(record[11]||'')!=='確認済み'||String(record[16]||'')==='旧端末')
    throw Error('本人確認されたブラウザではありません');
  var webId=String(record[0]||'');
  var alreadyApproved=String(record[5]||'')==='承認済み';
  var counted=approvedBrowserCount_(ss,web,id);
  // Existing approved browser counts as its own slot. A no-op reapproval is safe.
  if(!alreadyApproved && counted>=MAX_APPROVED_BROWSERS_PER_MIO)
    throw Error('認証済みブラウザは最大5件です。既存ブラウザを整理してください');
  if(alreadyApproved && counted>MAX_APPROVED_BROWSERS_PER_MIO)
    throw Error('既存ブラウザが5件を超えています。追加はできません');
  return {ok:true,mioId:id,current:counted,webId:webId};
}

/**
 * 組込み方法（未反映）：
 * BrowserAddV189Patch.gs の approveAdditionalBrowserV189Patch_ 内、
 * H/K/P/L と本人MIO-ID/名前一意性の既存検証が終わり、
 * audit.appendRow / web.getRange(target.row,6).setValue('承認済み') より前に
 * assertBrowserSlotsBeforeManualAddV199_(ss, web, r, mioId);
 * を追加する。
 * 既存の switchApprovedWebRegistrationV189_ には追加しない。
 * 切替は「旧端末を無効化する」明示操作であり、追加とは別。
 * 本番Code.gsと補助ファイルの原文照合・バックアップ前には導入禁止。
 */
