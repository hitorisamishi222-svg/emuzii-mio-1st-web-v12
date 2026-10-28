# みおシステム 次期大型アップデート — 統合公開判定（2026-10-28）

**判定: 公開不可 / 開発を継続。** Draft PR #43。main・本番URL・GAS・参加者データ・ガチャは変更しない。
確定対象は、(1)管理メニュー (2)ファンアート (3)皆勤賞管理 (4)姫/魔王背景 (5)お知らせ (6)ギャラリー (7)音楽/動画 (8)認証・公開前検証。

## 項目別の受入状況

| 対象 | 実装の根拠 | 実機・運用受入で残るもの | 判定 |
| --- | --- | --- | --- |
| 管理メニュー統合 | `admin-hub.html` から各ページへ導線、管理者と承認端末で表示ゲート | 本番認証済み端末で表示・遷移確認 | 実装あり / 未合格 |
| ファンアート応募・承認・掲載 | `gallery-submission-ui.js`, `api-gallery-submissions.js`, `gallery-submissions-admin.html` | DB移行、受付ON/OFF、審査・公開・取り下げ実操作、同意文と保存期間の確認 | 実装あり / 未合格 |
| 皆勤賞管理 | `attendance-admin.html`, `attendance-admin-csv.js`、読取専用・端末内CSV解析 | 正本シートのA〜AH列とCSV実物の照合、iOS/Android端末確認。付与・修正はまだ実装しない | 参照版のみ / 未合格 |
| 姫／魔王背景 | `api-background.js`, `background-theme.js`, `background-theme.css`、`db/anniversary-background.sql` | DB移行、実保存、競合、PC/iOS/Android描画、ガチャへの影響なし確認 | 実装あり / 未合格 |
| お知らせ管理 | 既存の `announcements-manage.html`, `api-announcements.js` の保存・公開・非公開。更新日時を整合させ、操作履歴を同一トランザクション化 | 既存DBスキーマ照合、管理端末で保存・公開・非公開・編集失敗時確認 | 実装あり / 未合格 |
| ギャラリー統合 | 既存の `gallery.html`, `gallery-manage.html`、審査済み作品のみ任意追加 | サムネイルと既存公開作品の維持、権利・非公開・削除操作の実機確認 | 実装あり / 未合格 |
| 音楽・動画管理 | `media-manage.html` と既存の審査データ経路。作品URLとサムネイルを登録し、再審査で公開 | 作品登録・編集→審査→公開を実DBで検証。直接ファイルアップロード・並び替えは未実装 | 実装あり / 未合格 |
| 認証・公開前検証 | 既存サーバー側の管理者セッション、承認端末、Originチェック、revision競合を利用 | 正規/不正セッション試験、2台同時操作、端末認証期限切れ、障害復旧、モバイル表示 | 一部模擬合格 / 未合格 |

## 今回の追加コード監査と変更

- `api-announcements.js`: 公開GETの日付 `updatedAt` の整合性を確認。作成・編集・公開・非公開・削除の書込みをDB監査ログと**同一トランザクション**に修正。競合・監査失敗はROLLBACK。JSON本文の実サイズを制限。
- `tests/mio-vnext-announcements.test.mjs`: GET、作成＋監査、競合、監査失敗、未認証、過大入力の新規テスト。
- `tests/mio-vnext-gallery-integration.test.mjs`: 応募閉鎖、管理者認証、応募保存は審査待ちのみ、音楽/動画管理者追加、承認、競合、監査失敗、公開許可フラグ、任意テーブル障害時の既存作品保護の新規テスト。
- `db/vnext-readonly-preflight.sql`: ギャラリー専用DBの識別子・必要テーブル・列・索引のみを見る読取専用チェック。**未実行**。
- 上記テストはGitHubへ登録済みだが、この記録時点で新しいコミットのGitHub Actions結果を未取得。**既存の133件合格を今回の新規テストの合格として流用しない。**

## 重大な公開ブロッカー

1. 本番のギャラリーDB正本とバックアップを所有者が確認するまでは、`db/announcements.sql`、`db/gallery-submissions.sql`、`db/anniversary-background.sql` を適用しない。
2. 本番の管理者・承認端末から実際の保存・審査・公開・非公開が確認できるまでは、公開しない。プレビューではAPIの本番ホスト制限により管理者実データテストができない。
3. `MIO_GALLERY_SUBMISSIONS_ENABLED`, `MIO_GALLERY_SUBMISSIONS_PUBLISH_ENABLED` は両方OFFを維持。審査済みでも後者がOFFなら新規応募作品を公開しない。
4. 接続由来の識別値（ハッシュ）の保持期間・削除手続き、応募者からの削除依頼、投稿作品の権利と掲載同意を確認。
5. CSVでの皆勤賞照合は読み取り専用を維持。本人登録・MIO-ID・皆勤履歴を変更しない。
6. ガチャ開発をこのPRに混ぜない。通常・ラキフェス・当選履歴・残回数の変更をしない。PR差分に gacha ファイルがないことを確認。
7. 本番のマージとデプロイは別途承認・公開判断が必要。いまのDraft PR #43を勝手にマージしない。

## 本番公開時の順序（未実施）

1. リリース対象差分のレビューと本番データのバックアップ確認。
2. 専用DBへ読取専用preflight → 必要な差分のみを承認後に移行 → schema再照合。
3. 運営のみでAPIと管理者セッションを確認。姫→魔王→姫、告知公開/停止、ファンアート・動画承認/停止、既存作品の維持。
4. 受付・公開フラグを別々に制御。初期状態は両方OFF。
5. iPhone Safari / Android Chrome / PCで未合格項目のみを重点検証。変更がなかった合格済みテストは繰り返さない。
6. 本番公開の最終承認を得てから、PRのマージ・本番デプロイを実施する。
7. 障害時は受付・新作品掲載をOFF、背景は姫デフォルトを維持。デプロイを元の正本に戻す。DBデータを無断削除しない。

## リンク
- PR: https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/pull/43
- 詳細: `docs/MIO_BACKGROUND_RELEASE.md`, `docs/MIO_CONTENT_MANAGEMENT_RELEASE.md`, `docs/MIO_GALLERY_SUBMISSIONS_RELEASE.md`, `docs/MIO_VNEXT_SCOPE_v1.md`

**実機操作: 現時点では不要。** 実DBの承認済み検証に移る前に、データ正本と移行安全性を確定する。
