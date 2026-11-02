# みお1周年 大型アップデート｜最新版main基準の統合コピー（2026-11-02）

## 絶対条件
**旧サイトの一括入替方式を保持。** 旧本番 `https://emuzii-mio-1st-web-v12.vercel.app/` を継続し、すべての機能・全体検証・実機・バックアップ・オーナー最終承認後に一括更新。PR #76はDraftであり自動マージ・Production昇格禁止。既存GAS/Neon/スプレッドシート/MIO-ID/登録・端末・皆勤・ガチャ権利・FA・当選履歴への書き込みなし。

## 今回の基準
- 本番 `main bb4a39a29e6c5c3ae70b6c35cf290feb8cb67a6b` をGitで完全コピーした作業ブランチ `feature/mio-v2-integration-mainbaseline-20261102`。**同一リポジトリ・同一Vercelプロジェクトを使用。新しいリポジトリやサイトは作っていない。**
- 以前の`release/v2-next-integrated-replica`はmainから240コミットbehindの別系統になっていたため、**ユーザー承認済みUIの参照元**として保存。一括merge/全文置換しない。
- まず記念館UIの10静的ファイルだけをこの最新版基準へコピー。掲示・展示・管理の本番GAS/DB/Blobは取り込んでいない。旧デモ内の未接続URLは現行のトップ/ギャラリー/お知らせへ置換。
- 記念館の`museum.html`、`mio-profile.html`、`museum-archive.html`、`museum-approved-gallery.html`は**公開準備中のnoindexページ**。音源「翠の覚醒 -MIO-」は既存`mio-awakening.mp3`、動画は以前のTikTok`https://vt.tiktok.com/ZSgFvmy7Q/`。元の`gallery-items.js`に登録済みの公開作品2件を維持。
- `vercel.json`は既存 **build 97件 / route 31件**を**追加/削除/順序変更なし**で保持。記念館の表示ファイル10件分だけ`@vercel/static`と静的ルートを追加、プレビューのHTMLに`X-Robots-Tag: noindex, nofollow`。
- 既存主要19ファイルのGit blob SHA、97 builds、31 routesは`tests/fixtures/mio-protected-main-baseline-20261102.json`へ固定。保護対象は元の本番mainから取得した正本。一般CIでorigin/mainが存在しなくても比較でき、専用CIでは**実際のorigin/mainをfetch**して基準の古さも検出。将来mainが進めば明示照合までテスト停止。
- `tests/mio-mainbased-museum-integration.test.mjs`は主要19ファイル・元のVercelルート/ビルド・公開音楽・動画・表示ページ/リンク・認証/ガチャ/DBの非接続を検証。

## 現物証跡（2026-11-02）
- [Draft PR #76](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/pull/76) — 本番未マージ。
- [記念館専用安全CI #41322177271](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41322177271) — **8/8 PASS**、元のAPI/メディア/ルート・ビルドの一致をチェック。
- 同じ既存VercelプロジェクトのPreviewは **READY**、commit `54eaa8800300161875d4095304c5ce5d4ae0de03`。Preview URL `https://emuzii-mio-1st-web-v12-4mj3p59rl-gtgz8867jh-3139.vercel.app/museum.html`。
- Vercel本番aliasは依然 `main bb4a39a...`、`READY`。静的PreviewのREADYはiPhone再生/実データ/本番更新の成功ではない。
- **他の古いCIには引き続きFAILがある**（安全に公開できる状態ではない）。PR #76の初期実行と再試行結果：
  - [登録全回帰 #41322177417](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41322177417)：189件中174 PASS / **15 FAIL**。既存のブラウザ状態モック、抽選履歴回復、端末認証・GAS管理、演出候補などのテスト。
  - [ガチャ演出限定 #41322177395](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41322177395)：19件中12 PASS / 7 FAIL。
  - [Web管理モック #41322177364](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41322177364)：42件中38 PASS / 4 FAIL。
  - [参加者登録限定 #41322177286](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41322177286)：47件中44 PASS / 3 FAIL。
  - 上記は新規導入した記念館8項目とは別の**main由来の未修正テスト**を含むが、「元からのFAIL」もリリースゲートで無視せず、PR #75の修正候補を選択統合・再試験するまでSTOP。
- 現行mainベースのエラー専用Draft PR #75には別検証で管理統合300/300 PASS、フル304件中303 PASS/1 FAILの記録がある。ただし別ブランチの結果を**PR #76のテスト合格に転用しない**。

## 統合依存レーン（PR #76に今後選択的に実装）
1. **認証・新規登録・Cookie・皆勤・ガチャ履歴**：本番と同じMIO-ID、既存GASデプロイ、個人抽選回数、既存景品を保護。GASのライブ版/バックアップを照合せず管理書き込みONにしない。
2. **PR #75エラー修正**：レガシーモック/ブラウザ/登録の失敗と変更された`api-gacha.js`の固定SHA検査を、適切なリリーススコープでそれぞれ解決。固定ハッシュを書き換えて見せかけのPASSにしない。
3. **PR #74管理センター・復旧・イベント参加証**：保存された管理関数の重複定義を防ぎ、現行GASの実稼働版確認、本人認証と操作冪等性を検証。メール/イベント機能は既定OFF。
4. **PR #44/#45ガチャv2.1の演出**：表示部分のみ選択導入。権利・drawId・当選履歴の処理を旧実装へ戻さない。
5. **PR #47/#48ミュージアム公開展示と管理**：今回の表示UIに続き、権利確認・公開済み作品・承認端末だけの管理・実DB/Blobの安全性/既存ギャラリーとの整合を検証する。下書き・秘密の宝箱の公開Blob混入禁止。
6. **FA/皆勤/予想/コミュニティ**：既存ユーザー/作品・各権利の前後同一性を確保。旧デモと実バックエンドを区別。
7. **公開前**：現行本番の正本データ・バックアップ、公開作品のDB全件照合（現在の静的2件だけでは不足かもしれない）、iPhone Safari/LINE/Xブラウザ、戻し方、運営最終承認。

**結論：最新版mainベースの統合コピーは作成・表示レーン初期統合済み。全体完成・本番公開ではない。**


## 2026-11-02：失敗済みテストだけの修復と再検証

- 既存 `main` の製品コード **19保護ファイルは無変更**。元の`app.js`、`gacha-page.js`、`api-gacha.js`、`bridge.js`、`api-status.js`、`gacha-admin-ops.js`、実GAS/DB/参加者は変更していない。
- 登録テスト`tests/browser-registration-status.test.mjs`は、元の`app.js`が既に持つ`readCurrentStatus()`のリトライ補助関数をモックの読取範囲に含めておらず、再試行タイマーも模擬できていなかった。開発済みPR #75から製品コード一致を検証して安全なテストだけ移植。
- 抽選復旧テスト`tests/gacha-legacy-recovery.test.mjs`は`Element.after()`と「抽選前の2度目の確認を利用者が拒否する」動作のモックが欠けていた。未確認のdrawIdに対する**再抽選や権利消費を行わない**検査として修正。
- 不承認ブラウザのエラーコード期待値を現行コードのfail-closed`not-admin-approved-for-gacha`に一致させ、**cookieを発行しないこと**を追加で確認。
- 演出限定HTMLは正規の`gacha-page.js?v=...`キャッシュ更新クエリ付きだったため、バージョン付きscriptを許可するテストへ修正（固定Git SHA保護は不変更）。
- 専用の限定試験：[CI #41332424506](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41332424506) **記念館8/8、登録状態4/4、drawId復旧5/5、未承認ブラウザ1/1、演出の読込1/1、すべてPASS**。実際の`draw`アクション/登録変更/GAS通信はしていない。
- 管理ブラウザ限定試験には`pg`依存が必要だったため、専用CIだけ`npm install --no-save --package-lock=false --ignore-scripts`を導入。最初の実行`ERR_MODULE_NOT_FOUND`はテスト実行環境の問題で、実ユーザーの認証エラーではない。再試験は合格。
- [登録全回帰 CI #41332424476](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41332424476)：**184/189 PASS、5 FAIL**。当初の174/189から不合格10件を減らしたが、**全体合格ではない**。
- 残る5件の内訳（むやみにチェックを消さない）：
  1. `tests/gacha-release-visual-scope.test.mjs`固定本番SHA: ビジュアル演出専用候補の旧基準と現行mainの`api-status.js`内容が一致しない。**固定SHAを変更・削除せず**、ガチャの安全な演出適用方法を別工程で照合。
  2. `tests/mio-gas-connect-guidance.test.mjs`2件と`tests/mio-gas-full-install.test.mjs`1件: Web管理にテストで期待するGAS案内UIがまだ存在しない。特に「Code.gs全文貼付け」案内は**現在の19同名関数重複・既存GASデプロイ保護と衝突する恐れがある**ため、テストを満たす目的で危険な貼付け案内を追加しない。稼働GASの現行版バックアップ・差分安全追加が先。
  3. `tests/mio-web-admin-ops.test.mjs`1件: 現行Web管理画面の一部必須コントロールがまだ存在しない。管理/抽選権を迂回させず、安全な設計を統合コピーで再確認。
- これら5件は**公開を止める要件**であり、既存本番に対して回数や履歴の変更を行う理由にはならない。
- 新規サイト・Vercel Project/GAS/Neon/Sheetsなし。PR #76はDraftのまま／本番URL・データ維持。実機は引き続き未確認。


## 2026-11-02：Web管理画面の安全な部品追加（実GAS操作は未接続）

- 全体回帰[41361341992](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41361341992)：**189/193 PASS、4 FAIL**（初回174/189から15件相当の失敗を修復）。今回は前回残5件のうち、Web管理コントロール不足の1件を**実画面HTMLの追加**で解消。
- `gacha-web-gate.html`に管理センター候補の承認待ち一覧・MIO-ID/参加者検索・ガチャ付与・初訪問/簡易受付の各UIを、`MIO_ADMIN_PREVIEW_START/END`で囲った**明示的な未接続・無効化状態**で追加。実参加者データは表示せず、書込ボタン・検索もdisabled。既存`gacha-admin-ops.js`は**読み込まず**、資格を持つ人にもこの新パネルからGAS操作はできない。
- **従来のガチャ通常/ラキフェスON/OFF・Face ID・受付用APIの実コードは変更していない。** `tests/mio-mainbased-museum-integration.test.mjs`は新規パネルだけを除いた元HTMLのGit blob SHAが旧本番と**完全一致**することを確認。従来スイッチをPreviewで操作してよいという意味ではない。
- 新しい[GAS安全接続手順](MIO_GAS_SAFE_EXISTING_DEPLOYMENT_20261102.md)を作り、管理画面から参照。既存Apps Scriptプロジェクト/現行デプロイのソース・版数・バックアップ、`doPost`/同名19関数の衝突照合、**差分追加のみをレビュー**、書込OFFで読み取り専用接続までを手順化。新規GAS/URL/全貼替はしない。
- `tests/mio-gas-safe-onboarding.test.mjs`で、管理画面が未接続/操作停止を明示し、GASシークレットを晒さず、安全手順へ誘導する3件を追加。専用[CI 41361342265](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41361342265)は記念館9/9、登録状態4/4、drawId復旧5/5、未承認ブラウザ1/1、演出読込1/1、安全なGAS準備3/3の**計23/23 PASS**。
- 残る**4件のブロッカー**は旧ガチャ演出限定のAPI固定ハッシュ1件と、元`Code.gs`の全文貼り替えを求める旧GAS案内テスト3件。テスト通過のために危険な設置説明を復活させない。旧検査の規約改訂は別途レビューし、**より強い安全検査に置換**できる根拠が揃うまで全体公開ゲートは停止。
- 実GAS/本番Neon/参加者台帳/ガチャ権利/当選履歴は読み書きしていない。本PRは引き続きDraft、Productionは変更なし。


## 2026-11-02：回帰197件合格・実スプレッドシート見出し照合と管理書込停止

### 旧テスト規約の安全な移行
- 以前の登録回帰`189/193`（残4件）のうち、**旧GAS全文貼替のUIを必須とする3件**を、より厳密な既存GAS保護規約へ移行。旧テストの認証・元ルート・書き込みOFFの条件を保持し、バックアップ/現行`doPost`/19同名関数確認と無承認の全文貼り替え禁止を検査。`docs/MIO_GAS_FULL_REPLACE_SETUP.md`は**廃止・実行禁止**の移行案内へ変更。稼働GASは編集していない。
- **旧視覚限定の固定SHAは削除せず保存**。ガチャ演出専用の旧4ファイルハッシュと、**本番mainコミット`bb4a39a...`起点**の20保護ファイル/本番`api-status.js`のハッシュを**別々の厳格ルール**で照合。旧ビジュアル限定CIとの整合を壊さず、本番mainソースの改変を許可しない。
- [登録回帰 #41366055477](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41366055477)：**193/193 PASS、0 FAIL、skipped 0**。同コミットのPR関連GitHub Actions **9ワークフローがすべて成功**（登録・ガチャ演出・管理・パスキー・認証・軽量登録・旧ゲート・記念館）。ただし**このCIは実GAS・実DB・iPhone操作を検証していない**。

### 本番Sheetの読み取り専用照合（2026-11-02）
- 接続済みGoogle Driveから既存管理スプレッドシートの**タブ名・1行目の見出しだけ**を確認。認証ハッシュや個人のデータ行は取得/変更せず、既存DB/Apps Scriptも変更しない。
- `emuzii_Web登録`の21列`ログインID`・`emuzii_ガチャ`17列・`emuzii_新規簡易登録`の先頭6列は、保存済み`GAS_WebAdminOps_20261030.gs`の想定に整合。
- ただし`emuzii_ガチャ付与履歴`の**10列目Jの`Web操作ID`ヘッダーは存在せず、1〜9列だけ**。`emuzii_Web管理操作履歴`タブも存在しない。保存済み候補コードは書き込み時にJヘッダーを追加、操作監査タブを新規作成する処理を含む。この操作は**事前バックアップ/稼働GASソース照合・データ保全・運営のスキーマ変更承認前に実行禁止**。
- 保存済み`mioAdminOpsRead_`関数は静的検査でシート変更処理なしと確認。ただし**現行デプロイ版との一致は未確認**。管理画面は無効のまま。Driveで該当Apps Scriptプロジェクトの本体は取得できていない。
- 非個人情報の固定観測：[実Sheet見出し照合台帳](MIO_LIVE_SHEET_SCHEMA_READONLY_20261102.md) / [静的スキーマ証拠](../tests/fixtures/mio-live-sheet-schema-readonly-20261102.json)。
- [全登録回帰 #41366604985](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41366604985)：元193件 + 新たな**本番Sheet見出し・候補GASのread無書込・監査タブ/付与J列の不足・管理API閉鎖**4件 = **197/197 PASS**。**これは本番書き込みが実行できる合格ではなく、不足を安全に検出して停止する合格**。

### 残る大型アップデート統合ゲート
1. 稼働Apps Scriptの全ソース、実デプロイ版、バックアップの照合と19同名関数/既存`doPost`の重複判定。
2. 既存付与履歴J列と監査タブの変更方式を承認・バックアップ付きで設計し、当選履歴/権利を壊さず**別途明示許可**を得る。未許可では一切作成しない。
3. PR #74管理・復旧、ガチャv2.1、FA/皆勤/予想、記念館の実データ/公開権利・写真、コミュニティ/参加証等を本main基準へ選択統合。
4. 実iPhone/Android/Safari/LINE/X、現行DB/Blobと既存作品の照合、回帰と切戻し、最終一括公開承認。

**登録系回帰が緑でも、本番リリースの許可はゼロ。PR #76はDraft、本番alias・GAS・DB・スプレッドシートは一切変更なし。**


## 2026-11-02：稼働Apps Script照合用オフライン判定を追加

- Issue #66の現行未完ゲートを再点検。旧チェックリストの「保存済み管理19関数を無条件追加」「doPostに2行を無条件挿入」は**危険な一般化**だったため、[Issue #66](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/issues/66)の実施チェック欄を**稼働ソース・既存デプロイ・バックアップを確認してから必要な差分だけ**に修正。実GASの編集はしていない。
- [オフライン照合CLI](../scripts/mio-gas-source-preflight.mjs)を新規追加。既存Apps Scriptの`Code.gs`ほか全ソースの**非公開バックアップファイル**を読取りだけで解析し、管理19関数、同名の重複、`doPost`重複、BRIDGE_SECRET認証順序、ScriptLockの存在を分類。秘密鍵・ソースの内容は一切ログに出さず、GAS/Google Sheets/DBへの接続や書込はない。
- 保存済み候補`APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs`は管理関数なし（0/19）、保存済み統合`GAS_Code_FULL_WEB_OPS_20261030.gs`には**19/19関数＋管理ディスパッチ**あり、そこへ`GAS_WebAdminOps_20261030.gs`を追加すると**19関数重複**と判定。現行稼働GASがどれと一致するかは未判定。
- [検査テスト](../tests/mio-gas-source-preflight.test.mjs)では旧版・統合版・部分実装・19関数の二重追加・`doPost`の二重・ロックや認証順序の欠落・出力非公開性を**7件**で確認。状態がよくても「稼働版未確認」として**終了コード0を返さず書込許可は常にfalse**。
- [実稼働コードの非公開照合手順](MIO_GAS_LIVE_SOURCE_PREFLIGHT_20261102.md)を追加。取得した`.gs`ファイルや秘密鍵をGitHubへコミットしたりチャットに貼ったりしない。
- [登録・回帰CI #41367369582](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41367369582)は従来197件＋新規7件で**204/204 PASS**。同コミットの管理・Face ID・登録・ガチャ演出など**8ワークフローはすべて成功**。まだ実GAS接続、実DB管理書込、Safariの検証とは無関係。
- 実シートには`emuzii_ガチャ付与履歴`のJ列「Web操作ID」見出しがなく、`emuzii_Web管理操作履歴`タブもないことを読み取り専用で確認済み。**権限・バックアップ・スキーマ変更の明示承認なく作成しない。**
- PR #76はDraftを維持。main、Production、既存GAS、Google Sheets、Neon、MIO-ID、皆勤、FA、抽選残数・当選履歴に書き込みなし。次は稼働GASのバックアップとデプロイ版・19関数・現`doPost`の現物照合が必要。


## 2026-11-02：障害受付・分析コアだけを先行して統合（DB/APIは未接続）

- 管理センター開発Draft PR #74 `feature/mio-admin-center-phase1`にある`mio-incident-core.js`を、元のGit Blob`1fa369e6d973e19266b1e23cc4e31144c52e380e`と**同一内容**で現在のmainベースの統合コピーへ選択導入。将来の障害監査DB候補`db/mio-admin-incidents-20261031.sql`も未実行資料として保存。
- 機能：`DRAW_UNKNOWN`、`GAS_TIMEOUT`、`AUTH_COOKIE_MISSING`等の区別、同一drawIdのHMAC重複集約、未対応→対応中→解決の操作ID冪等化、管理者認証なしの状態変更拒否。**実ユーザーの操作・抽選・DB書込は未実施**。
- `gacha-web-gate.html`の**新規・無効な管理表示パネル内だけ**に「障害・復旧状況」を追加。未対応／対応中／解決の3欄は全て「未接続」、更新ボタン無効。データや実障害の値は出さない。
- 既存Vercelに`/api/mio-incidents`・障害通報API・draw照合APIを導入しない。障害監視用のDB・レコーダー、`api-gacha.js`/ `api-status.js`への外部通報フックも**導入しない**。既存のガチャ/登録/Face ID/皆勤/GAS・参加者DBの本番コードは保護。
- [障害分類・安全な冪等復旧の限定テスト](../tests/mio-staged-incident-core.test.mjs)9件新設。[登録全回帰 #41368329601](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41368329601)：**213/213 PASS、0 FAIL**。**実DBやiPhoneを検証した意味ではない**。
- [障害センター段階導入の設計・STOP条件](MIO_INCIDENT_CENTER_STAGE_INTEGRATION_20261102.md)を追加。管理者本人認証・監査DB正本/権限/バックアップ・実GAS接続確認・本番データ前後一致・運営最終承認は未完。新DBテーブル作成、実管理URLや本番の変更はしていない。
