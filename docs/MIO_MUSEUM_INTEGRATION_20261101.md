# 翠央1周年ミュージアム｜大型アップデート一括統合の準備（2026-11-01）

## 運用ルール
大型アップデートは**コピー版に全機能をまとめて検証し、最終承認後に既存URLで一括更新**。記念館だけ先に本番公開しない。
- GitHub existing repo: `hitorisamishi222-svg/emuzii-mio-1st-web-v12`
- Current production Vercel alias: `emuzii-mio-1st-web-v12.vercel.app`
- Museum Phase1 Draft PR #47, Phase2 Draft PR #48: **どちらも未マージ・公開禁止**
- 旧大型更新デモ: `release/v2-next-integrated-replica`。現在の本番mainと大幅に分岐しているため**このデモをまるごとmainへ入れない**。
- 管理/復旧別開発 `feature/mio-admin-center-phase1` Draft PR #74、登録回帰修正 #75は別スコープのまま維持する。

## 既存実装の再確認（追加で作り直さない）
- 第1段階: 記念館の公開入口 `museum.html`、翠央プロフィール `mio-profile.html`、記念曲/既存ギャラリー/お知らせへの導線、メタ情報/スマホCSS。
- 第2段階: `museum-archive.html` の歴代アイコン・思い出アルバム・イベント履歴、カテゴリ絞り込みと公開済み作品だけの表示。
- 管理: `museum-curate.html` の検索、下書き保存、公開/非公開、ゴミ箱→非公開下書き復元、画像アップロード、権利確認と個人情報確認。書込は既定でOFF。
- 安全性: `/api/gallery/museum/*` の既存オーナー/承認端末認証、`/api/museum/exhibits`の公開済み展示GET、画像参照のオーナー専用読み取り、DB事前診断、DB監査ログ。
- 確認: 小画面Chromiumの模擬操作と隔離PostgreSQLの契約検査は過去に成功。ただし本番の実データ、実Blob、iPhone Safariの実操作は未確認。

## 今回修正（未公開）
- `museum-news.js`で取得先が`/api/announcements`（Vercelルート未定義）だったため、既存の公開ニュースAPIルート `/api/gallery/announcements` に修正。
- `tests/mio-museum-phase1.test.mjs` を既存ルートに一致する検査へ更新。
- `tests/mio-museum-news-route.test.mjs` を追加し、実際のルートとビルド登録、未公開ニュース除外、HTML文字列の非実行表示、最大3件、障害時のお知らせリンクを検証。
- 実際のVercelプレビューはホスト固定の管理/記事APIが本番用に限定されるため、プレビューで公開お知らせが見えなくても、それだけでProductionの配信テスト合格とは言わない。
- CI `.github/workflows/mio-museum-phase2.yml`へ新規テストを追加。CI実行結果と、ローカル隔離PG/Chromiumの結果を公開判断に区別して記録する。

## 最新mainへの統合で衝突する領域
`feature/mio-museum-archive-phase2-20261028`は最新mainから分岐済みで、2026-11-01時点で **ahead 130 / behind 32**。以下は**mainを先に保護**し、museum候補のファイルだけ選択的に導入する。
- `index.html`, `vercel.json`: 登録/皆勤/ガチャ/公開ギャラリー/既存管理のルート・ビルド設定を変更しないまま、記念館リンクと関連ファイルだけ追加する。
- `api-announcements.js`, `gallery-admin-*`: 既存APIと認証Cookieは現行mainを正本とする。記念館側で管理者認証を独自再発行しない。
- `api-gacha.js`, `api-checkin.js`, `api-status.js`, `api-register.js`, `bridge.js`, GAS/Neon/Sheets: 記念館リリースの変更対象にしない。
- `api-museum-exhibits.js`, `api-museum-image.js`, `api-museum-assets.js`, `api-museum-preflight.js` は現在のadmin auth/Blob/DBスキーマと事前照合後に実際のテストコピーへ段階導入。

## 本番前に残るゲート
1. 現行mainベースの**統合コピーで**記念館2段階と管理センター・ガチャ・皆勤・FA・予想・記念館の各ルートを結合。古いmuseum開発ブランチの`vercel.json`をmainへそのままコピーしない。
2. `GALLERY_DATABASE_URL`と既存ギャラリー管理スキーマの正本・バックアップ・必要なDB移行の**読み取り専用照合**。未適用`db/museum-public-exhibits.sql`を本番で無断実行しない。
3. 保存/公開/画像アップロードの環境フラグは初期OFF。下書き画像は公開Vercel BlobのURLから閲覧できるので、非公開写真・個人情報入りスクショは保存禁止。秘密の宝箱とは**別管理**。
4. iPhone Safari/Android Chromeで`museum-device-check.html`の**端末内だけ**の変換確認。実写真は運営の許可がない限りサーバーに送らない。
5. 記念館と既存ギャラリー・皆勤・ガチャ・登録・端末・管理認証の一括回帰とバックアップ、切戻し手順、運営の最終承認。公開リンクやSEO設定は最後に確認。

**現在の判定：Draft／統合中／本番未公開。** 記念館だけ先にアップデートしない。
