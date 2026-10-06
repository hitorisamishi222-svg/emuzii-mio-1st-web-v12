from pathlib import Path

core_path=Path('APPS_SCRIPT_Code_v1.8.8_NO_DUPLICATES.gs')
core=core_path.read_text(encoding='utf-8')
old="""    return {id:p.id,name:p.name,rarity:p.rarity,chance:effective,stock:p.stock,image:p.image,duplicateKey:p.duplicateKey};"""
new="""    return {id:p.id,name:p.name,rarity:p.rarity,chance:effective,stock:p.stock,image:p.image};"""
if old not in core:
    raise SystemExit('public catalog row not found')
core=core.replace(old,new,1)
core_path.write_text(core,encoding='utf-8')

recovery_path=Path('APPS_SCRIPT_DeviceRecovery_v1.8.8.gs')
recovery=recovery_path.read_text(encoding='utf-8')
old="""  var admin=ss.getSheetByName(GACHA_ADMIN_TAB),grantHistory=ss.getSheetByName(GACHA_GRANT_HISTORY_TAB);
  var gachaAdminReady=!!(admin&&grantHistory),gate=gachaAdminReady?gachaOpenState_(ss):{normalOpen:false,festOpen:false};
"""
new="""  var adminTab=typeof GACHA_ADMIN_TAB==='undefined'?'emuzii_管理画面':GACHA_ADMIN_TAB;
  var grantTab=typeof GACHA_GRANT_HISTORY_TAB==='undefined'?'emuzii_ガチャ付与履歴':GACHA_GRANT_HISTORY_TAB;
  var admin=ss.getSheetByName(adminTab),grantHistory=ss.getSheetByName(grantTab);
  var gachaAdminReady=!!(admin&&grantHistory&&typeof gachaOpenState_==='function');
  var gate=gachaAdminReady?gachaOpenState_(ss):{normalOpen:false,festOpen:false};
"""
if old not in recovery:
    raise SystemExit('verify admin block not found')
recovery=recovery.replace(old,new,1)
recovery_path.write_text(recovery,encoding='utf-8')

handoff_path=Path('V1.8.8_GACHA_ADMIN_PREP_HANDOFF.md')
handoff=handoff_path.read_text(encoding='utf-8')
extra='''\n## Apps Script置換時の必須確認\n- 旧v1.8.7へ追記せず、Core / GachaAdmin / DeviceRecoveryをv1.8.8候補へ置換・追加する。\n- 旧バックアップ専用コードファイルがApps Scriptプロジェクト内に残っている場合は、本番コードから除外する。\n- プロジェクト全体検索で `SECONDARY_SHEET_ID` / `BACKUP_SWEEP_MINUTES` / `setupBackupV187_` / `verifyBackupV187_` / `backupAfter` / `backupMirror` / `backupAppend_` の実装が0件であることを確認する。\n- `backupSweep_` は削除対象トリガー名としてDeviceRecoveryに文字列が残るのは正常。関数実装・トリガーは0件にする。\n- 3ファイルのどれかが欠けた場合、verifyは `gachaAdminReady:false` で公開不可と判断できる構成にする。\n'''
if '## Apps Script置換時の必須確認' not in handoff:
    handoff += extra
handoff_path.write_text(handoff,encoding='utf-8')
