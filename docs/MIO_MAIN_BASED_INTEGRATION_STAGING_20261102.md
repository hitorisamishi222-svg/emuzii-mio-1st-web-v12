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
