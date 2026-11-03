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
- [障害分類・安全な冪等復旧の限定テスト](../tests/mio-staged-incident-core.test.mjs)10件新設（未接続の表示・更新ボタン無効の検査を含む）。[登録全回帰 #41368547882](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41368547882)：**214/214 PASS、0 FAIL**。**実DBやiPhoneを検証した意味ではない**。
- [障害センター段階導入の設計・STOP条件](MIO_INCIDENT_CENTER_STAGE_INTEGRATION_20261102.md)を追加。管理者本人認証・監査DB正本/権限/バックアップ・実GAS接続確認・本番データ前後一致・運営最終承認は未完。新DBテーブル作成、実管理URLや本番の変更はしていない。


## 2026-11-02：チャット障害に左右されない連続開発・スマホ診断統合
- 開発PR #76で障害復旧の再送時状態ずれを修復（解決済みの案件に古い開始操作が届いても解決状態を維持）。監査結果が矛盾・重複すると停止。抽選や本番APIは未変更。
- 以前の記念館Draft PR #48から**端末単独で動く3静的ファイルのみ**選択導入：`museum-device-check.html`、`museum-device-check.js`、`museum-image-client.js`。最新main版の記念館フッターから「スマホ動作チェック（開発版）」を選択可能にした。
- 診断は画面幅、操作部品、端末内の試験画像変換、任意の写真のローカル変換、個人識別情報のないJSON結果ダウンロード。API、Cookie、DB、参加者、ガチャ操作、写真アップロードなし。Safari/iPhone/Androidの実端末確認は**未実施**。
- `vercel.json` の旧本番 **97ビルド・31ルートを順序含め変更せず**、記念館静的追加合計13件の構成にした（総110ビルド・44ルート）。`museum-device-check.html` も `noindex,nofollow` / `no-store`。新しいVercelプロジェクトは作っていない。
- 既存PR #48の端末チェック4件を選択導入し、main版との差異を見直した。記念館保護テストでも旧本番ファイルのSHAとルートを維持したまま検証。
- [Registration regression #41383392402](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41383392402) **230/230 PASS・0 FAIL**。Vercelの当該コミットのPreviewはREADY（`target=null`）。ブラウザHTTPアクセス・iPhone実機・写真変換を実地確認できた意味ではない。
- **次の本当のブロッカー**：Issue #66の現行GASの全ファイル・稼働デプロイ版と復元用バックアップが未取得、管理19関数/既存`doPost`の現物照合、付与履歴J列`Web操作ID`と監査タブの追加許可、公開中DB/作品の読み取り照合、iPhone/Android検証、全体の切戻し計画。
- **引き続きDraft、main/Production/GAS/Sheets/DB・MIO-ID/皆勤/FA/景品/ガチャ残数/当選履歴は変更せず、Web管理書き込み・実抽選の試行もしない。**


## 2026-11-02：スマホ画像メモリ保護とギャラリー閲覧機能の連続改善（Draft）

- 開発ブランチの `museum-image-client.js` で、Canvas画像変換が成功して早期returnした場合や、変換途中で失敗した場合でも、必ず `canvas.width=0;canvas.height=0` を実行するように修正。写真連続変換時の端末メモリ負荷を抑えるための改修で、実iPhone上のメモリ量は未測定。
- `tests/mio-museum-image-memory.test.mjs` に4件追加。正常終了、画像エンコード失敗、全3サイズで容量超過、連続5回の変換について、Canvasと一時URLの解放を模擬環境で確認。
- 既存の `museum-approved-gallery.html` / `museum-approved-gallery.js` に、公開済み作品だけを対象とするローカル検索（作品名・制作者・説明）と「すべて／動画／音楽」切替、結果0件の表示を追加。公開許可済みの2作品、記念曲MP3とTikTok作品リンクは維持。非公開作品、管理API、Cookie、GAS、DB、ガチャには接続しない。
- `tests/mio-staging-mobile-chromium.mjs` の実Chrome確認を320/375/390/430pxの4幅で、スマホ診断・承認済み音楽/動画・新検索/種類切替・展示室のカテゴリー切替/戻るまで拡張。公開許可されていない展示は0件で準備中の案内を維持。
- アクティブな `.github/workflows/registration-tests.yml` のスクリーンショット保存対象に展示画面も加えた。ギャラリー/展示室/診断/写真プレビューの4枚がCI成果物に含まれることを確認。既存の診断JSONは許可された失敗理由のみ記録し、写真・氏名・端末IDを保存しない。
- [全登録・管理回帰＋実Chrome #41385774060](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41385774060)：**236/236 PASS / 0 FAIL**、実Chrome4幅成功、テスト中のサーバー書き込み0。コミット `1a9b203db06fd7a1b6a26c3c3619b6f257ea23a2` に紐付くGitHub Actions **8本すべて成功**。
- 画面表示の証拠はGitHub Actions成果物 `mio-staging-mobile-chrome-evidence`、保存期間7日。端末はLinux上のChrome模擬モバイルであり、**実iPhone Safari／Android Chromeを検証済みとはしない**。
- **残件**：Issue #66の稼働GAS全ソースと実デプロイ版/復元可能バックアップの照合、同名19関数と既存`doPost`衝突、監査表と付与履歴のスキーマ許可、管理センターの実接続、既存作品DB/Blob照合、iPhone/Android実機、全体の復旧・切戻し・管理者公開判断。
- **本番 `main bb4a39a`、Vercel Production、既存GAS、DB、スプレッドシート、MIO-ID、参加者、皆勤・FA・景品・抽選残数・当選履歴は変更せず**。PR #76はDraft、実管理の書込はOFF、実抽選0件。


## 2026-11-02：音楽再生維持・Safari画像互換・公開作品カテゴリー共有（開発版限定）

- 記念館の承認済み作品フィルタが毎回 DOM を作り直し、再生中の記念曲が検索で中断しうる問題を修正。承認済み作品だけを一度生成し、検索・種類変更で `hidden` を切り替える。非表示にした楽曲のみ `pause()`、表示が続く楽曲の元の `audio` 要素は維持。
- `.museum-approved-card[hidden]{display:none}` を追加。CSS の `display:flex` が HTML の `hidden` を打ち消さないことを実Chromeでも検証した。公開未承認の作品は DOM にも追加しない。
- 作品ジャンルの直接リンク `/museum-approved-gallery.html?kind=music` / `?kind=video` を追加。画面のカテゴリ切替で URL に反映し、ブラウザの戻る操作で選択が復元される。検索語は URL・Cookie・storage・サーバーへ記録しない。
- `museum-image-client.js` では一部Safari等で WebP の `canvas.toBlob()` が null を返した場合、JPEG への再エンコードを行う。画像変換に使用したCanvasの成功/失敗後の解放は維持。Unit mock 2件を追加し、実Chromeでも null WebP エンコーダーを模擬してJPEGへの代替変換を検証。
- [登録/管理回帰+実Chrome #41391286117](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41391286117) は **238/238 PASS、0 FAIL**。320/375/390/430pxで音楽プレイヤーの実ノード維持、非表示時だけpause、カテゴリURL・history.back、診断の写真変換を確認。ブラウザ試験中のサーバー書き込み0。
- 上記はLinuxの実Chromeとモックであり、**iPhone Safari実機や稼働GASの接続成功ではない**。管理センター承認/回数付与は未接続・OFFのまま。
- 対象PRは #76 Draft。公開中のmain、Vercel Production、稼働GAS、DB、Sheet、参加者・皆勤・FA・景品・ガチャ回数・当選履歴に変更なし。


## 2026-11-03：大型アップデート一括公開の新仕様（ギャラリー中心）

### 決定事項（運営指示）
1. **ギャラリーが主役**。記念館トップはヒーロー直後に公開作品・アイコン・思い出展示を案内。楽曲・お知らせ・プロフィールは次の導線に整理する。暗いブルーと金色、宝石の輝きがある上品な館内演出。スマートフォン幅で横はみ出し・文字の読みにくさを許容しない。
2. **皆勤賞は新しい公開サイトのページ／メニューから外すが、記録は削除しない。** 既存の参加者、出席・皆勤、企画実施履歴、復元対象、ガチャ・当選等の台帳・DB・API・バックアップを削除／初期化／上書きしない。旧ソースと実データを保管し、同種企画の再開催時に権限・期間の確認をした上で再利用できるようにする。新UIからの旧ページ導線だけをDraftで外す。**本番の既存画面を今すぐ停止・削除したわけではない。**
3. **チャット機能は今回保留。** チャットAPI・保存先・通知やUIの新規公開を、今回の公開条件に含めない。別の開発案件として保留し、既存機能を壊さない。
4. **SEIRAサイト方式の管理容易性を採用**。管理者が1画面で、展示タイトル／画像、並び順、注目作品、公開・非公開を切り替え、来場者プレビューで確認できること。将来の実接続には認証・ロール権限・監査・公開承認・戻し操作・メディア権利確認が必須。
5. **大型アップデートは1回の公開切替を目標**。本番URLを維持し、開発Draft内で画面、管理、展示データ、試験、復元手順を完成させる。本番環境の機能やDBへ先行して書き込まない。公開ゲートは全検証完了・復元可能なバックアップ・運営の最終承認。

### 今回のDraftに実装した範囲
- `museum.html` の展示室をメインコンテンツの先頭へ移動し、ギャラリーの掲載許可済み既存作品を強調。記念曲MP3と既存TikTokリンクは保持。
- `museum.css` / `museum-approved-gallery.html` / `museum-archive.css` に館内・展示カードの装飾。CSSは記念館だけに作用し、本番ガチャや旧登録画面のデザインは変更しない。
- 新しい記念館ページから旧`/`への出席・参加者導線を除去。旧`index.html` / `app.js` / `api-checkin.js` と本番データは保護・存置。
- 既存の **オフライン操作リハーサル**（`mio-admin-rehearsal.html/js`）に、架空作品のみの模擬キュレーターを追加。並び替え、注目指定、表示切替、タイトル変更、端末内画像の一時プレビューを実操作できる。**サーバーへの保存・アップロード・実ギャラリー操作・公開は不可**。メモリ内の模擬変更はページ更新で消える。

### 一括公開を妨げる残条件（自動公開禁止）
- 実ギャラリーの正本DB/Blob/既存承認済み作品の読み取り照合。権利者の公開許可がない画像・スクショを先行掲載しない。
- 既存GAS全ソース・稼働デプロイ版・復元バックアップ、19関数とdoPostの重複照合、監査タブと操作ID列の変更審査（Issue #66）。
- 本物の管理者認証を通した「下書き→レビュー→公開」操作の専用DB/API設計、操作履歴と競合防止、画像差し替えと旧作品保護。現在のリハーサルを本番接続できたと扱わない。
- 皆勤・参加者・ガチャ・当選履歴のバックアップと完全保持の照合（公開前後の件数・識別子・内容が不変）。**ページ非表示とデータ削除を混同しない。**
- Safari/iPhone・Android、PC、Chromeの画面・音楽・作品表示と管理操作の検査、CI全PASS、公開失敗時の戻し手順と運営承認。
- Previewの`noindex,nofollow`は検索除外用で**アクセス制御ではない**。未公開作品の実データをPreviewに置く前に、保護された管理画面・デプロイのアクセス制御を別途確認する。現状の展示は承認済み公開物と架空データのみ。
- **Draft PR #76を維持。merge、Production昇格、稼働GAS・DB・Sheet変更、新規プロジェクト／公開URL作成はしない。**


### 2026-11-03：実公開切替と管理編集の未解決点を明確化

- **今の公開トップ `/` は `vercel.json` の `/index.html` に接続したまま**で、皆勤賞の古い画面・導線が残る。新記念館のナビからリンクを消しただけでは、最終仕様である「皆勤賞ページをなくす」を実現したことにはならない。
- 一括公開時には、公開トップを `museum.html` に切り替えるルート設計に加えて、従来の `/index.html` への直接アクセス時の扱い（記念館へ移す／必要な運営用機能を適切に分離）を別途レビューする。**現在は公開ルートも旧ページも変更せず**、復旧用として保持する。
- `api-checkin.js` や皆勤データと紐づく既存API／データは初期化・削除せず、次回の同種イベントで履歴を再利用できる状態を保つ。旧URLを消す判断と旧データを消す判断を混同しない。
- 既存の `api-gallery-items.js` はDBの公開停止状態を正本として扱うため、**既存の公開作品ファイルの `hidden:false` だけで公開許可とみなさない**。実ギャラリー管理APIは個別の内容変更・表示切替に対応しているが、まとめての展示順序と注目作品の競合防止は別設計が必要。
- `museum-curation-plan.mjs` は編集結果をサーバーへ送らず、受け取った正本承認ID・隠し／削除フラグ・現在の改訂番号だけを使って配置案を組み立てる純粋関数。未承認作品・表示停止作品は配置案にも混入させない。編集順序、注目作品と表示切替は改訂番号の競合で停止する。**本物の保存・公開・管理者認証は未実装**。
- 公開用保存の次工程では、所有者／管理者の権限、追加作品の権利確認、レビュー承認、操作監査、同一操作ID再送、DBトランザクション、失敗時の元配置復元、最終公開版のキャッシュ整合を審査する。実DB正本と稼働GAS未照合の現段階では、環境変数による実公開を有効化しない。
- 現状のPreview URLと `noindex` は**閲覧制限ではない**。未承認写真・個人情報・下書き作品をそのURLに掲載しない。機密の仮展示が必要になれば、既存プロジェクトの保護設定を先に確認する。


### 2026-11-03：既存Vercel環境の接続メタデータだけを確認（値は非取得）

- 既存Vercelプロジェクト `emuzii-mio-1st-web-v12` の環境変数**キー名・対象環境のみ**読み取り。秘密の値、DB接続文字列、トークンは取得・表示・更新していない。
- `GALLERY_DATABASE_URL` はProductionとPreview両方に設定の存在を確認。ただし、**正本DBの実体、権限、テーブル構造、現行作品の承認状態や更新履歴が検証された意味ではない**。
- `BLOB_READ_WRITE_TOKEN` も環境変数名の存在のみ確認。Previewが未保護の状況では、未承認写真の投入やこの認証情報を使ったアップロード試験は行わない。
- 列挙されたキーには `GALLERY_MODERATION_ENABLED` が見当たらなかった。既存 `api-gallery-manage.js` は、この値が文字列 `true` でない場合に書込を拒否するため、**現行管理書込の解放済みとは扱わない**。今はこのフラグを有効化しない。
- 本Draftのレイアウトプランは既存API・DB・Blobに接続せず、純粋な提案とモック試験に留める。実接続時は既存の管理者セッション・承認デバイス権限、更新競合防止、監査、バックアップ、旧作品保持との連動を確認する。


### 2026-11-03：管理者が簡単に入れ替える操作の模擬拡張（実本番は未接続）

- 既存の `mio-admin-rehearsal.html/js` の架空作品エディタに、新しい展示を**非公開の模擬下書きとして追加**する入力欄を追加。確認されないまま来場者プレビューに出さず、模擬確認 → 模擬表示を分けた。
- 展示を外す操作は削除ではなく、**保管（非表示）→保管から戻す**で元の架空レコードとタイトル・並びを保持する。復元直後には自動公開しない。注目作品を非公開または保管した場合は注目指定も外す。
- `tests/mio-staging-mobile-chromium.mjs` に実Chromeの模擬操作（新規追加→非公開確認→模擬承認→模擬公開→保管→復元→再表示→リセット）を追加。320/375/390/430pxで画面幅を確認。
- 作品種別は既存公開ギャラリーの分類名に合わせた。ローカルBlobの画像プレビューはメモリ内で扱い、ページ更新・リセット時に破棄する。**DB保存・一般公開API・管理者認証・メディア投稿・GAS・皆勤・ガチャ書き込みは一切未接続**。
- ここは将来の運営向けUXの検証版。実作品の権利確認、公開許可と監査、複数管理者の競合や公開直前の再検証は今後の一括リリースゲートに残る。


### 2026-11-03：PR #48 の既存DB確認成果を安全な現在版に選択統合

- 旧Draft `feature/mio-museum-archive-phase2-20261028` / PR #48 から `museum-preflight-core.js` と `db/museum-public-exhibits.sql` の**同一内容を選択取り込み**。旧PR #48 全体、旧 `vercel.json`、公開/管理API、DB/Blob書き込みをコピーしていない。
- `museum-preflight-core.js` は、ギャラリー管理者/承認端末/セッション/監査/公開展示の5テーブルについて、列の存在・型・NOT NULL・公開状態チェック・必須外部キー・DB識別一致を純粋関数で判定する。**本Draft内で実DBへ問い合わせたり、診断APIを公開したわけではない。**
- `tests/mio-museum-schema-stage.test.mjs` で空テーブル、型不一致、NULL許可、CHECK不正、未検証FK、ID不一致、任意スキーマ分離を回帰確認。試験データは各ケースで深くコピーし、互いの結果を汚染しない。
- `db/museum-public-exhibits.sql` は未適用。過去の作品/画像を勝手に挿入せず、削除/物理削除や本番に対する移行は行わない。
- 追加の `db/museum-gallery-layout-stage.sql` は既存ギャラリーをALTERせず、展示順・公開候補・注目IDの**下書きと公開済みの履歴を分離する新規テーブル案だけ**を保存。32桁操作IDの冪等性・運営担当FKと監査列を持つが、**SQLだけで公開承認を保証できるわけではない**。毎回、正本DBで権利承認と既存非公開/削除指定を再照合する運用が必須。
- `tests/mio-museum-gallery-layout-schema.test.mjs` では追加SQLのDDL-only、既存テーブル不変、公開版が未設定である状態、ID・監査、ルート/API未接続を確認。実DBの移行・下書き保存・実画像アップロード/公開は未実施。
- **STOP**: `GALLERY_DATABASE_URL` の正本・実スキーマ・復元可能バックアップが照合できず、既存管理者端末認証と操作ログの実データ接続も未検証。特にPreviewは閲覧制限なし。SQLや検査がCIに通っても、ライブ運営操作や一括公開を許可する条件にはならない。


### 2026-11-03：公開済み展示への非公開・削除指定を必ず優先（Draftのみ）

- `museum-gallery-published-core.mjs` と `tests/mio-museum-gallery-published.test.mjs` を追加。**未ルーティングの純粋関数**で、保存済みの公開レイアウトと、その時点の正本DBから再取得された公開許可/表示停止状態を照合する設計。
- 過去に公開された並び順や注目作品があっても、後から非公開・削除・承認取消された作品を返さない。注目作品が停止されたときは、別作品を勝手に注目へ変更しない。下書き変更・不正URL・重複ID・競合状態を公開ページへ通さない。
- 公開スナップショット自体が存在しない場合は、未承認作品へフォールバックしない。この関数は静的承認済みの既存2作品の現行表示を**変更しておらず**、実際の読み取り接続を完了したものでもない。
- 正本データを渡すのは、認証・スキーマ・権利・削除指定を照合した**将来のサーバー側処理だけ**。ブラウザ引数 `sourceVerified` を根拠に権限付与してはいけない。コードは現在外部HTTP、Cookie、DB、Blobへ接続しない。
- 既存の架空管理者リハーサルでは、新しい作品の模擬承認前に「作品の使用・掲載許可」「画像・説明の個人情報」を両方確認するUIを追加。片方だけでは承認ボタンが無効。**あくまでモック**であり、実際の権利確認や公開許諾にはならない。
- 次のゲートは稼働DBの正本と復元バックアップ、既存セッション/端末権限の実接続確認、下書き/公開版のトランザクションと冪等性、再承認・一括公開・切戻しの検証。皆勤・参加者・ガチャ・当選履歴のデータは保護し、チャット機能は保留。


### 2026-11-03：展示レイアウトの下書き保存トランザクション（実接続前）

- `museum-gallery-draft-store.mjs` を**開発ブランチだけ**へ追加。実公開ルートやVercel buildに未登録、実DB接続・SQL適用なし。管理画面の模擬操作だけでなく、将来の保存に必要なエラー処理を独立モジュールとして作った。
- 保存の流れ: 専用DB clientでBEGIN → **サーバー側の既存管理者/承認端末照合**（現段階では注入コールバックのモック）→レイアウト行ロック → 操作IDの重複確認 → 改訂番号の競合確認 → **正本の公開許可・非公開・削除指定を読み直すコールバック**（現段階ではモック）→非公開下書きだけUPDATE →監査操作IDとSHA-256 payload hashを同じトランザクションで記録 →COMMIT確認。
- 同一操作ID・本人・同一payloadを再送した場合は、監査結果から **replay（重複保存なし）** として返す。異なる本人・内容・未承認作品・古い改訂番号は拒否。COMMIT応答不明は成功とせず、同じ操作IDの照会を必要とする。処理途中の失敗はROLLBACK。*専用clientであることは呼び出し側で保証が必要*。
- 監査の設計候補 `db/museum-gallery-layout-stage.sql` に `payload_hash` を追加。未適用のため本番スキーマは変わっていない。**公開版の列をUPDATEするコードは今回実装していない**。公開許可・下書き表示・編集内容と実際の公開権限は区別。
- `tests/mio-museum-gallery-draft-store.test.mjs` でインメモリPostgreSQL模擬clientを使い、保存・競合・冪等再送・別管理者/別payload・COMMIT不明・監査失敗・ロールバック・認証拒否・権利確認不足・権限偽装などを確認。**実PGのロック特性、稼働管理者Cookie、GAS、Blob、iPhone Safari は未試験**。
- 実接続前に運営が確認すべき必須項目: 使用中DBの正本識別/復元可能バックアップ、既存権限の有効なログイン経路、公開許可の正本、DBスキーマ/移行審査、同時編集を含む専用DB接続試験、公開版の一括切替と取り消し試験。Previewへ非公開画像・個人情報・秘密コンテンツを置かない。


### 2026-11-03：ギャラリーの公開・復元ゲートを開発用に追加（**本番接続なし**）

- `museum-gallery-publication-stage.mjs` を追加。**公開API未登録、Production/既存DB未接続、SQL未適用**。運営本人の明示的な確認文字列、既存管理者権限（ownerのみ）、改訂番号一致、操作IDの冪等性、現在の作品承認/非公開指定の再照合を全て要求する。下書き保存と来場者公開は別。
- `museum-gallery-owner-stage.mjs` は既存 `gallery-auth-shared.js` のCookie + 承認済み端末ログインを利用し、同一Origin・POST・JSON・owner条件でしか認証結果を返さない。**新規ログイン/セッション発行はなし**。今はスタンドアロンの未配備アダプター。
- 開発用SQL `db/museum-gallery-layout-stage.sql` に以前のコピー時の構文崩れを発見して修復。未適用のまま、`layout_stage`（下書きと公開版の分離）、`layout_history_stage`（公開版スナップショットの永続履歴）、`layout_audit_stage`（操作者・操作ID・payloadハッシュ）を設計。現在の公開ページや参加者台帳をALTER/DELETE/初期化しない。
- 復元（rollback）は旧公開版の参照を直接差し替えるのではなく、**過去のスナップショットから新しい公開版番号を作る**。その時点の承認撤回・削除・公開停止を再検証し、非公開作品の再登場を防ぐ。既存バージョン・監査行・皆勤/ガチャ・参加者データは削除しない。
- 公開処理は`BEGIN ISOLATION LEVEL SERIALIZABLE`を指定し、**同じ専用DB clientで**認証・正本の公開許可/非公開指定・ロック・履歴挿入・監査・COMMITを実行する契約。SERIALIZABLEだけに依存せず、将来の公開管理APIでは更新競合と運営操作の再検証、未確定COMMIT時の照会が必要。実PostgreSQL同時実行試験は未実施。
- SQL側にも、展示順に無い作品を公開対象にすることや非表示の作品を注目指定することを防ぐ JSONB 包含/存在チェックを追加。**静的構文チェックとモックは実DBの移行成功を保証しない。**
- `tests/mio-museum-gallery-publication-stage.test.mjs` と `tests/mio-museum-gallery-owner-stage.test.mjs` に、owner/端末/Origin拒否、下書きと公開の分離、複数版、権利撤回、同時編集、操作IDの重複、履歴付き復元、監査/COMMIT不明/途中エラーの検証を追加。
- **一括公開の停止条件は継続**：DBの実体・保護設定・バックアップ/復元テスト、GAS現行原本とデプロイ版・権限/監査照合、iPhone実機、公開URLの切替手順、復旧操作、最終オーナー承認が必要。Previewのnoindexは認証ではない。チャット保留・皆勤記録保存・ギャラリー最優先。


### 2026-11-03：Neonの読み取り専用メタデータ調査（本番接続先とは**未照合**）

- 接続可能なNeonプロジェクト `dry-feather-67791501` について、**branch/table/column/constraintのメタデータのみ**確認。SQL書込・データ行の取得・シークレット読取・新規Branch作成は行っていない。
- `main`（`br-winter-forest-b7eq6rpz`）の `neondb` には、現時点で `mio_registration_v2` 等の登録関連テーブル4つが確認された。**`gallery_admin_*`、`museum_public_exhibits`、`museum_gallery_layout_stage` は一覧で確認できなかった**。
- `gallery-admin-isolated`（`br-bold-credit-b7y6frdo`）には `gallery_admin_users` / `gallery_admin_sessions` / `gallery_admin_devices` / `gallery_admin_audit` / `gallery_live_overrides` / `gallery_published_items` 等が存在。`gallery-passkey-auth-review-isolated` も同種の管理テーブルあり。ただし**両ブランチとも `museum_public_exhibits` と新しいlayout/history/audit stageテーブルは一覧で確認できない**。
- `gallery_published_items` は既存の隔離ブランチにあるが、確認できた列は `id/title/category/creator/external_url/thumbnail_url/created_by/created_at/updated_at` 等で、公開権利確認・表示停止・プライバシー審査の独立状態はこの表の列からは証明できない。**この表が存在するだけで新規作品の公開を許可しない**。
- `gallery_live_overrides` の `hidden/deleted` はBOOLEAN・NOT NULL、`item_id` は現在の静的ギャラリーと整合する形式。新しい `museum-gallery-source-stage.mjs` は既存の静的許可リストと、この表示停止指定、および将来の `museum_public_exhibits` を読み取り専用で照合する設計。
- Vercelの `GALLERY_DATABASE_URL` は存在確認のみで、**接続先Project/Branch/Databaseの実体は未照合**。したがって上記Neonメタデータが稼働中の公開ギャラリーDBであるとは断定しない。稼働DB識別子の正式照合・バックアップ・復元試験まで、**DBマイグレーション、管理操作APIの有効化、作品アップロード、一括公開は禁止**。
- `db/museum-public-exhibits.sql` を未承認の非公開下書きを保存できる構造へ修正。権利・個人情報の確認、承認者、公開日時はドラフト時NULL可能だが、`status='published'` に進むときには全4条件を満たすDB CHECKが必要。これを `museum-preflight-core.js` で検査する。
- `museum-gallery-source-stage.mjs` はミュージアム展示が未適用なら例外で停止するため、未確認DBから適当に公開カタログを組み立てない。公開ページにもまだ接続していない。


### 2026-11-03：実ギャラリーの読み取り契約・公開スナップショットの仕上げ（未配備）

- `museum-gallery-source-stage.mjs` を追加。静的に掲載承認済みの既存2作品と、権限・公開停止指定を保持する `gallery_live_overrides`、将来の `museum_public_exhibits` を、**同一の専用DB接続**で読み取る候補。重複ID・壊れたレスポンス・未承認状態・権利/個人情報/公開日時の欠落は拒否し、DBテーブル未導入・停止時は**静的作品へ無断フォールバックしない**。今は未ルーティングで本番から実行されない。
- `museum-gallery-published-core.mjs` を画像だけの展示（リンクなし）にも対応させる。未承認作品、後からの公開停止や削除指定は従来どおり非表示。
- `museum-gallery-public-read-stage.mjs` を追加。公開済み版の配置だけを `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` の一貫したDBスナップショットで読み、新しい展示と既存作品の最新公開停止情報を再照合。公開版が無ければ空の展示を返す。公開担当者UUIDと公開日時が破損していれば拒否。下書きは読み取らない。**本番API・公開URLにはまだ未接続**。
- `db/museum-public-exhibits.sql` の下書き審査列をNULL許容とし、`status='published'` 時だけ権利/個人情報確認・承認者・公開日時の全条件をDBで必須とする。検査用 `museum-preflight-core.js` は、**非公開下書きを書けるNULL許容性と、公開条件を強制する実DB制約**の双方を必須に変更。
- 各純粋／モック検査は `tests/mio-museum-gallery-source-stage.test.mjs`, `tests/mio-museum-gallery-public-read-stage.test.mjs`, `tests/mio-museum-schema-stage.test.mjs`, `tests/mio-museum-gallery-published.test.mjs` に追加。DB読み取り連動テストは架空レコードのみで、実Vercel認証情報や秘密の作品を使わない。
- **公開を止める条件：** 実Vercel `GALLERY_DATABASE_URL` とNeon project/branch/databaseの照合、正本テーブルの存在、バックアップ/復元、既存GAS・参加者データ保護の実確認、管理者による権利審査と最終承認、実iPhone/Android/PC確認、ロールバック確認が未完了。今のCI合格は本番実装完了ではない。
