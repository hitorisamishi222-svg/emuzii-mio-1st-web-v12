/**
 * ガチャ公開設定の診断補助。既存Apps Scriptへ統合する前の参考ファイル。
 * このファイル単体では本番の公開スイッチは変更しない。
 * catalog_ response should include gateConfigured boolean, computed by
 * typeof gachaOpenState_ === 'function'. Do not default missing gates to open.
 */
function gachaGateDiagnostic_(){
  return {gateConfigured:typeof gachaOpenState_==='function'};
}
