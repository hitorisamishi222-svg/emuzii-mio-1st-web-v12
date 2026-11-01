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
