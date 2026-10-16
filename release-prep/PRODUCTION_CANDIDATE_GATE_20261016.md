# みおシステム本番候補 — 2026-10-16 公開判定

## 開発ブランチ
`release/mio-production-candidate-20261016`
本番は `main`、本番固定URLは `https://emuzii-mio-1st-web-v12.vercel.app/`。本番は19時以降「終了時刻未定」のメンテナンス表示、固定URLは本番デプロイ `dpl_AwA6HBwKvKizhEa4n5YsptPi7aUV` に接続済み。メンテナンス解除は未承認。

## 完了済み
- 最終旧本番動作画面から参加登録・皆勤入力・個人進捗・ガチャの実接続UIを残し、新しいコミュニティ・音楽ギャラリーの導線を追加。
- 新規ページは現在、読み取り専用の案内。コミュニティで投稿不可、音楽ギャラリーでは記念曲の再生のみ可能。投稿・保存・権限審査は未実装であり、動作済みと表示しない。
- 本番候補の `api-register.js` には新規登録のデフォルト停止ゲートを追加済み（`MIO_REGISTRATION_RELEASE` 未設定時503）。`api-status.js`、`api-checkin.js`、`api-gacha.js`、`bridge.js`、`gacha-page.js` は変更していない。ガチャ既存画面はサーバー抽選結果を使う5秒演出を保持。ただし実データでの抽選テストは未実施。
- Vercelの候補配信のホーム、コミュニティ、ギャラリー、ガチャ、app.js、記念MP3、背景画像はHTTP 200。プレビュー側 `/api/status`、`/api/gacha`、`/api/register` は503で停止。参加者データへの書き込みを伴うテストは行っていない。
- GitHub Actions [MIO Production Candidate Safety](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38884345004) 合格。該当CIはトップ画面要素、静的追加、APIルート、認証ゲート、5秒演出などソース構成を検査したもので、実際の登録・抽選操作の合格ではない。

## 実参加者シートの読取専用照合済み
- 参加者37ID、Web登録38件（承認済み35件）、確定抽選履歴25件。
- 皆勤とガチャの正本37件の照合は一致。確定当選ID重複なし。景品設定は通常16、ラキフェス11で開発版データとID・名前・レアリティ・確率が一致。
- Web登録シートの23行目が既存の別名義・復旧先ID・整合状態不一致。10月11日のバックアップにも存在する。自動修正・端末失効・データ統合は厳禁。運営が本人確認するまで未解決。
- 既存名義のみで別ブラウザを認証する旧GAS実デプロイの実装状況は未確認。開発候補の別ブランチ `release/v2-next-integrated-replica` では登録自動承認・名前だけの自動連携を停止済みだが、本番GASへの反映ではない。

## 公開ブロッカー
1. GASの稼働中の実デプロイ版と処理を照合し、既存MIO-ID、承認権限、皆勤・FA・ガチャ履歴への安全な読み出しを検証。
2. Web登録シート23行目の本人確認/履歴紐付けを運営が確認。値が未確認のまま別人のデータを統合しない。
3. 利用者のメンテナンス解除可否、コミュニティ・ギャラリーを「準備中」で先行公開してよいかの最終承認。
4. 実ブラウザで既存端末ログイン・別端末・戻る・再読み込みなどを確認。公開APIでの実抽選をテスト目的で発火させない。
5. 本番の旧 `gacha.html` はURL直打ちで配信される。メンテナンス状態で実APIを完全停止したとは見なせない。必要ならGAS管理画面側の公開スイッチ・実状態を運営が確認。
6. 本番公開時には本番デプロイと固定URLのalias接続先が一致することを別々に確認。古いトップへ戻る再発を防ぐ。

## 禁止事項
- 開発ブランチを丸ごと `main` にmergeしない。
- 実参加者Sheet、GAS、抽選履歴、端末承認を自動編集しない。
- コミュニティやギャラリーのデモを本番に使わない。
- 既存データや安全性の裏付けがないのに本番公開完了と宣言しない。

## 10/16 本番GAS特定・追加セキュリティ修正
- 本番GASの既存ウェブアプリデプロイは、ユーザーが既存Apps Scriptの「デプロイを管理」で見つけた **バージョン12（2026-10-16 16:14）**。WebアプリURLが Vercel production `APPS_SCRIPT_URL` と `main/bridge.js` のURLに完全一致。接続先未特定という旧ブロッカーは解消した。
- 公開中のバージョン12 `Code.gs` は v1.9.1 LOGIN-ID。名前+短い旧ログインIDで新ブラウザを自動承認し、MIO-IDを紐付ける実装を確認。このバージョンは **公開時の本人確認安全要件を満たさない**。
- GitHub `APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs` には本人確認待ち制御と10件の合格済みテストがあるが、承認待ち端末の再登録などで名前からIDを補完する経路が一部残存。
- より厳しい候補 `APPS_SCRIPT_Code_v1.9.7_MANUAL_IDENTITY_RELEASE.gs` を開発ブランチに新規作成。名前一致だけでMIO-IDを修復/割当しない方式。既存の認証済みブラウザ・皆勤・ガチャ処理は変更しない。
- `release-prep/identity-safe-v197.test.mjs` を追加（旧10ケース+4ケース）、既存の5ケースとまとめてGitHub Actionsで計19ケースに拡大。CI: https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38914940940 **合格**。
- 新規登録のデフォルト停止 `api-register.js` は候補ブランチのみ更新済み: `0a8147a3975f91803c3e9c7fd84badba26d71cc4`。本番の参加状況・皆勤・ガチャAPIはそのまま。
- **実GASにv1.9.7を保存/デプロイしたわけではない。** Google Apps Script側への変更権限/操作が必要。既存スプレッドシートの人名/端末情報の正本は一切変更なし。
- 修正版GASについて、実ユーザーを使わない合成データでの単体テストは合格。GASの実デプロイ環境、管理者承認時の端末切替補助コード、スプレッドシートトリガー、公開API、Web登録23行目の本人照合は引き続き別確認が必要。

### 公開判定
**未承認。** 少なくとも「本番GASを安全版に更新→バージョン・接続先確認→既存端末と手動承認の実環境検証→23行目の本人確認・不一致処理→本番候補の公開承認」が必要。無検証で main / 固定URL に反映しない。

### 追加確認（23:xx JST）: 実GAS補助ファイル・端末トリガーの互換性
- ユーザーの既存GAS編集画面に `Code.gs`, `DeviceRecoveryV187.gs`, `GachaAdminV188.gs`, `BrowserAddV189Patch.gs` の4ファイルが存在することを確認。
- ユーザー提供の `BrowserAddV189Patch.gs` ソースを確認。管理画面 `emuzii_重複整理` の「確認済み」+「このブラウザを追加」を受け、`approveAdditionalBrowserV189Patch_` が H/K/P/L の整合、一意の名前・MIO-ID、対象WebIDの一意性を確認して承認。追加処理は既存承認端末の却下を実施せず、監査ログに記録する。
- 同ファイルの `setupBrowserAddV189Patch` は旧 `webRecoveryOnEdit_` トリガーを消して `webRecoveryOnEditBrowserPatchV189_` を新設するが、**setupが実行済みか不明**。実稼働中のトリガー一覧をApps Script画面で確認するまで、旧端末が安全に維持されると断定しない。
- 旧 `APPS_SCRIPT_DeviceRecovery_v1.8.7_NO_BACKUP.gs` の `webRecoveryOnEdit_` はWeb登録F列の「承認済み」への変更で同MIO-IDの他の承認済みWebIDを「却下／旧端末」に変更する。この古いトリガーが現行で有効なら「ブラウザを追加」の要件と衝突する。
- `BrowserAddV189Patch.gs` の「この端末へ切替」経路は `switchApprovedWebRegistrationV189_` を呼ぶが、ユーザー提供のファイル本文に定義なし。GitHubの旧DeviceRecoveryアドオンにも定義なし。**実GASのDeviceRecoveryファイルの本文・補助ファイル/関数の有無は未確認**。
- 追加承認関数は対象レコードの H/K/P/L をあらかじめ整合済みとして要求する。一方 v1.9.7 の新ブラウザ登録は本人確認前にHを空欄にする。したがって**承認前の管理者による安全な明示的本人照合・ID紐付け手順（権限・監査・既存ID非破壊）が必要**。Web登録23行目は本人確認なしに自動補修禁止。
- 次はApps Scriptの「トリガー」画面のスクショで稼働トリガーを確認し、`DeviceRecoveryV187.gs` を読取専用で確認する。 `setupBrowserAddV189Patch` / `setupV187Complete` を実行しない。GASや参加者Sheetを勝手に保存・デプロイしない。

### 10/17 JST: v1.8.9 端末切替の過去版コードを発見・互換テスト
- GitHubの過去ブランチ `feature/mio-device-switch-v189` に `APPS_SCRIPT_DeviceRecovery_v1.8.9_V188_INTEGRATED.gs` と `test-device-switch-v189.cjs` が存在した。開発候補には読取専用の比較用ソース `release-prep/DeviceRecovery_v189_source_reference.gs` を別ファイルとして保存した。**実GASのコードを上書きしていない**。
- 過去コードの `switchApprovedWebRegistrationV189_` は Lock、Web-ID一意性、H/K/P/L、MIO-IDと名前、既存ユーザー・管理者テストユーザー保護、操作ログ、ベストエフォート巻き戻しを含む。
- 新コア `APPS_SCRIPT_Code_v1.9.7_MANUAL_IDENTITY_RELEASE.gs` と過去切替処理を模擬実行する `release-prep/test-v197-device-switch-compat.cjs` を追加。過去テストの安全条件に合格した。統合CI: https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38921128572 で合格。
- **注意: ユーザーが送った現在の実GAS `DeviceRecoveryV187.gs` の冒頭は過去GitHub版と完全一致しない。** 現行の `setupV189Complete` は `setupWebRecoveryV189_` を呼び旧 `webRecoveryOnEdit_` を再作成可能だが、過去GitHub版は `setupV189DuplicateReview_` のみ。両者を同一コードとみなさず、**現行スクリプトの `switchApprovedWebRegistrationV189_` 本文確認まで本番切替安全性は未確定**。
- 端末管理トリガー画面は1件、`webRecoveryOnEditBrowserPatchV189_`、エラー率表示0%。旧 `webRecoveryOnEdit_` のトリガー表示なし。ただしユーザーに見えない別所有者のトリガーの不存在までは証明しない。
- 本番GAS v12は本人認証の安全対策が未適用であり、修正版v1.9.7も実プロジェクトへ未保存/未デプロイ。公開可否は引き続き不合格。

### 10/17 JST: 稼働プロジェクトのDeviceRecoveryV187.gs全文を本人提供で確認
- 実GASの `DeviceRecoveryV187.gs` はラベルこそV187だが、内部は `v1.8.9 端末切替・重複整理`。関数 `switchApprovedWebRegistrationV189_` が存在し、旧GitHubブランチの同名関数と処理構成が一致：Lock、対象WebIDの一意照合、既存のMIO-ID/名前/H-K-P-L状態の整合、管理者テスト参加者の保護、対象と同一MIO-IDの承認済み旧端末のみ「却下／旧端末」、既存メンシプ継承、操作履歴、例外時のベストエフォート復元。
- 重要な差異: 現行GASの `setupV189Complete()` は `setupV189DuplicateReview_()` の後に `setupWebRecoveryV189_()` を実行して旧 `webRecoveryOnEdit_` トリガーを**新規作成する**。**実行禁止**。現在の画面で確認した稼働トリガーは `webRecoveryOnEditBrowserPatchV189_` のみであり、新トリガーを追加すると追加と切替の操作が競合する危険がある。既存トリガーは変更しない。
- 実GAS内の `webRecoveryOnEdit_` は、スプレッドシート Web登録 F列の「承認済み」を操作すると、条件次第で名前照合からH/K/Lを自動確定する。稼働トリガーがないと確認された所有者の範囲では実行されていないが、**設定を再実行すれば認証安全対策を回避し得る**。
- 明示的切替本体 `switchApprovedWebRegistrationV189_` は参加者/皆勤/ガチャ/当選シートを直接書き換えない。失敗時は変更したWeb登録行のF/G/Q/R/S列の戻しを試みるが、Sheetsの複数更新が原子的である保証はない。実環境での安全性はまだ保証されない。
- 新規登録承認フローの未整備箇所: v1.9.7では新しいブラウザが既存名義に一致してもH/K/Lを自動確定しない。一方 `BrowserAddV189Patch.gs` の `approveAdditionalBrowserV189Patch_` は H/K/P/Lの確定を必須とするため、本人確認を行った運営だけが明示的にMIO-IDを登録し、再照合・監査できる手順が必要。
- 実GASバージョン12のv1.9.1自動承認処理はまだ未修正。本番 `main` は依然メンテナンス中。この修正候補は `release/mio-production-candidate-20261016` にのみ存在。
