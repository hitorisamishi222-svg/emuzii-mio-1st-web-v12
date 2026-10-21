# 主要機能の関数単位回帰比較（2026-10-21）

比較対象: GitHub の `APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs` と `APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs`。関数の開始位置から対応する閉じ波括弧までの文字列を比較した静的結果。

| 関数 | 結果 |
|---|---|
| checkinAction_ | IDENTICAL |
| gachaAction_ | IDENTICAL |
| setupGacha_ | IDENTICAL |
| draws_ | IDENTICAL |
| catalog_ | IDENTICAL |
| wonDuplicateKeys_ | IDENTICAL |
| participantCatalog_ | IDENTICAL |
| activeWebDeviceErrorV189_ | IDENTICAL |

8/8が文字列一致。新規登録の安全修正候補により、上記8関数の本体は変更されない。ただし依存関数・他の.gsファイル・シートの状態やデプロイ済みv12の一致は未検証であり、機能全体の回帰試験合格を意味しない。

次の本番ゲート: v12実コードと他の.gsファイルの確認 → 隔離GAS実行テスト → 既存デプロイURLを維持して更新。現時点ではHOLD。本番環境・参加者データは未変更。
