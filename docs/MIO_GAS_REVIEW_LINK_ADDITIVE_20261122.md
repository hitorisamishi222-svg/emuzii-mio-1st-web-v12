# 復旧専用の既存GAS連携差分（隔離候補・未適用）

正本の既存 `doPost`、共有秘密比較、`ScriptLock`、通常登録・抽選・履歴処理は維持する。
既存 `Code.gs` の共有秘密検証直後、通常 Web-ID の入力検証より前、同じロックの範囲内に次の分岐だけを挿入する。

```diff
 if(!secret||!equal_(d.secret,secret))return json_({ok:false,error:'unauthorized'});
+if(/^mioReviewLink(?:Read|Prepare|Approve)$/.test(d.action))
+  return json_(mioReviewLinkOps_(SpreadsheetApp.openById(SHEET_ID),d,lock));
```

既存コードのインデント等は実ファイルに合わせる。`GAS_WebAdminOps_20261030.gs`（既存候補の再利用）、`GAS_ReviewLinkAdapter.gs` を別ファイルとして追加し、全ファイルの関数重複を再確認する。前者に記載される一般管理操作の dispatcher 例は**追加しない**。ガチャ付与、既存端末の切替、新規 MIO-ID 発行を本機能の入口から実行できない設計。

実シートを読み取りで確認した結果、既存4台帳の列構成はアダプターに反映済み。ただし `emuzii_Web管理操作履歴` は未整備と確認したため、本番リリース条件は未達。リリース用プロパティは未設定のまま維持する。

## 次工程（未実施）

1. Issue #66 に沿って実稼働版の全ソース・版・スプレッドシートの保全と復旧手順を確認。
2. 隔離スプレッドシートで監査タブの10列を定義し、別のテスト用IDで再現試験。正本への作成は別工程。
3. 隔離GAS、隔離DB、既存リポジトリの変更候補を接続して署名Cookie、読み取りAPI、操作IDの一意性、実ブラウザを検証。通常登録や抽選の既存合格結果は保持する。
4. 全条件合格後、別の本番適用工程で同じURLを維持して反映する。現行の書き込み停止条件をバイパスしない。承認後も元の署名Cookieが確認できる端末にだけ通常セッション発行を許す。

参照：既存リポジトリ main `1913923799bd340d3a59674e3ce1271ccbb94287`、既存管理Ops候補 `2a713813961aeee7ab73fa067057a887f283a400`、[Apps Script Lock Service](https://developers.google.com/apps-script/reference/lock/lock-service)。
