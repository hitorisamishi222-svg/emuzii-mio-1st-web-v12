# みおシステム｜既存本番GAS v1.9.7 安全差し替えファイル対応表（準備中）

**2026-10-17 JST。これは実作業前のマニフェスト。本番GAS・Google Sheets・Vercel本番を一切変更していない。**

## 実GASの4ファイルとの対応

| 実プロジェクトのファイル | 安全版候補 | 備考 |
|---|---|---|
| `Code.gs` | `APPS_SCRIPT_Code_v1.9.7_MANUAL_IDENTITY_RELEASE.gs` | 既存MIO-ID認証を維持し、新規ブラウザを名前/旧ID一致だけで自動承認しない。**v1.9.1実デプロイv12には未適用**。 |
| `DeviceRecoveryV187.gs` | `release-prep/DeviceRecoveryV197_SAFE_INTEGRATION_CANDIDATE.gs` | 旧トリガー再設置の `setupV189Complete`, `setupWebRecoveryV189_` を拒否。明示的端末切替の照合と履歴は維持。 |
| `BrowserAddV189Patch.gs` | `release-prep/BrowserAddV197_SAFE_CANDIDATE.gs` | 既存トリガー `webRecoveryOnEditBrowserPatchV189_` を再利用。全承認待ちを一覧化、再確認、既存旧端末保護、結果監査・復旧。 |
| `GachaAdminV188.gs` | **現行の実ファイルを維持** | ガチャ管理の既存実装は未照合。GitHubの旧版で不用意に上書きしない。 |

## 守ること
- 対象：Apps Scriptプロジェクト `11cJZBh9YzbFTd9ciqMbfgOWdfUEtfAbLAhdvkYipxT0B0_cMhes_xmJe`
- 既存WebアプリのデプロイURL末尾：`AKfycbyR2ujPRmZFBzdx8NGjIH4HmwHQYlpAgsLgZE5qJS-XkHuz6yZn1rfj2L27g6oKTyMIYA/exec`。別デプロイのURLを新たに作って差し替えない。
- 現行の **GAS version 12** は安全変更未適用。新規登録処理の危険な旧ロジックが残っている。
- Vercel `main` は引き続きメンテナンス表示。リリース候補は `release/mio-production-candidate-20261016` のみ。
- 実参加者データの変更、GASのバージョン更新、デプロイ、トリガーの削除/追加は**本人の明示的な公開作業承認まで行わない**。
- 以下の関数を本番で実行しない：`setup()`, `setupV189Complete()`, `setupWebRecoveryV189_()`, `setupBrowserAddV189Patch()`, `setupV187Complete()`。
- 既存トリガー所有者の一覧画面では `webRecoveryOnEditBrowserPatchV189_` 1件、古い `webRecoveryOnEdit_` は表示されなかった。他所有者の実行トリガーの不存在は断定不可。
- 実 `emuzii_Web登録` **23行目**のH/K/P/L等の不整合は未解消。本人照合なしに自動修復しない。

## 現時点の試験合格範囲
- `release-prep/identity-safe-v197.test.mjs`：名前/短いログインIDだけでの別ブラウザ自動認証を拒否する模擬テスト
- `release-prep/test-v197-device-switch-compat.cjs`：過去端末切替ロジックとの互換テスト
- `release-prep/test-v197-device-switch-safety.cjs`：退役済み旧端末の切替再承認拒否
- `release-prep/test-v197-three-module-integration.cjs`：v1.9.7+端末切替+ブラウザ追加の3モジュールを統合した**15ケース**の模擬試験
- 総合CI: https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38927642510

## 本番更新前の未完了事項
1. **現行 `GachaAdminV188.gs` の実コードとv1.9.7との差分互換性**。GASの4ファイルすべてが矛盾せず起動できることを確認。
2. **P列の計算式は名前から先頭一致MIO-IDを返す**可能性がある。同名別MIO-IDの正当な参加者が手動で本人証明しても、H/K/Pの不一致で承認できないケースは明示的に保留し、独立照合できる管理フローを別途設計。既存23行のP列を含め数式一括変更はしない。
3. 本番GASの全ファイルを事前バックアップし、差分照合。権限および古い管理関数の存在を再点検。
4. 書込みテストは**隔離した合成データのみ**。本番Sheet・ガチャ景品・当選履歴で試験しない。
5. 本番切替の操作（既存Webアプリデプロイの新バージョンへの更新）は必要な権限がある人による手順を明示。更新後に実登録/APIが無関係な他人の情報へ接続できないか確認し、問題があれば直ちに停止・巻戻す。
6. 運営本人による実行承認、ホーム画面とガチャ等の品質確認を終えてからのみ `main` と本番表示を更新する。

**本人確認手順**：`release-prep/BROWSER_APPROVAL_V197_OPERATOR_GUIDE.md`。


## 10/17 JST 補足：ガチャ管理との候補版4モジュール統合
- 登録済みトリガーが `webRecoveryOnEditBrowserPatchV189_` 1件であることを受け、`BrowserAddV197_SAFE_CANDIDATE.gs` に `emuzii_管理画面` の編集を `handleGachaAdminEdit_(e)` へ明示的に中継する処理を追加。別トリガーは作成しない。
- `release-prep/GachaAdminV188-FULL-REPLACE.gs` は **GitHub保存版の候補** としてのみ読み込み。本番実ファイルの同一性は未確認。既存管理シートを上書きしない。
- `release-prep/test-v197-four-module-integration.cjs`：4候補モジュールの合成データ21ケース、GitHub Actions https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38929536133 で合格。管理画面J25 TRUEの関数ディスパッチ、ガチャ受付OFF条件、異MIOの不正紐付け拒否、退役端末の再承認拒否、トップレベル関数名の重複ゼロ、トリガーの新規作成コードゼロ等を確認。
- **このテストは実GAS `GachaAdminV188.gs` と本番データに接続していない。** GachaAdmin実ファイルのコード本文確認および実シートのガチャスイッチ位置・編集トリガーとの相性は別途必須。
- 同名別MIO-IDの新しいブラウザでは、P列がC列の名前から最初の参加者を参照する現行の数式のため、正しいH/KでもH/P不一致になることがある。テストは **誤承認を拒否して保留** することを確認した。**本人確認フローを別途設計するまで対応完了とはしない**。
- 本番GASの4ファイル、参加者データ、Vercel main、固定URLは未変更。


### 10/17 JST ガチャ回数付与の合成テスト
- 候補ガチャ補助モジュールを直接読み込んで試験する `release-prep/test-v197-gacha-grants-real-code.cjs` をCIへ追加した。単一参加者に指定回数を付与し履歴を記録する処理、重複ID・数値エラー・履歴エラー・該当者不在の拒否、失敗時の回数復旧など **7ケースが合格**。CI: https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38953403978
- これは**GitHub候補版**のテストであり、実プロジェクト `GachaAdminV188.gs` のソースとの照合にはならない。現ガチャ管理画面のスイッチや回数付与イベントとUI座標が不一致の可能性がある。既存コードは上書き禁止。
