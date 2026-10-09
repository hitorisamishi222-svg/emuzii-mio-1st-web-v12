# 大型アップデート複製版 / v1.9.1

**独立開発ブランチ** `release/v2-next-integrated-replica` は本番 `main` (基点 ee16f24e891ebd52589b1e33eaeddbe75b853ce8) を複製したものです。

## 準備済みの画面
- `/next-preview.html`：複製専用トップ。プレビューのルートはこのページ。
- `/home-top-demo.html`：配信中、次回予定、最新お知らせのデモ。
- `/home-updates-demo.html`：通知・予定の表示パターン確認。
- `/news.html` と `/schedule.html`：架空データだけを表示。
- `/community-demo.html`：ローカル状態だけで動くチャット／動画／画像デモ。
- `/gacha-cinematic-demo.html`：抽選APIを呼ばないクジラ演出デモ（N/R/SR/UR/ラキフェス）。

- `/attendance-deluxe-demo.html`：31日の出欠カレンダーと記念メダルの演出試作。
- `/mypage-deluxe-demo.html`：皆勤・ガチャ・作品のサンプル統合プロフィール。
- `/admin-center-demo.html`：運営機能の端末内モック（本物の管理者権限なし）。

## 統合済みのコード（本番未有効）
- `security/guard.js`、`security/authorization.js`：入力、権限、承認、監査、停止等の基礎ロジック。
- `community-policy.js`：投稿可否、メッセージ入力、公開審査フィルター。
- v1.9.1ログインID/半自動重複整理の既存ソースは複製元 `main` に含まれる。

## プレビュー安全構成
- `vercel.json` で**static files のみ明示的にビルド**。`api-*.js`、`bridge.js`、`index.html`、`gacha.html` は配信しない。
- `/api/**` は404。プレビューから稼働中のApps Script / Google Sheetsに接続する経路なし。
- `home-updates.js` は、ダミーデータだけを使用し、APIフェッチを明示的に除去。
- 現在の本番機能のソースはGitHubブランチに保存したまま。後日TEST専用の認証/GAS/DBへ接続する際は別のビルド構成を追加する。
- このブランチを本番mainへマージしてはいけない。静的デモ専用ルーティングが本番に適用されるため。
- **本番データ、現在のGASデプロイ、旧端末管理、ガチャ履歴を変更しない**。

## 続き
1. TEST専用データベース/Sheet/保管領域/専用シークレットを明示的に用意（新規契約/課金は事前承認）。
2. v1.9.1の稼働GASおよび端末識別の最終版を確認し、認証と操作権限を完全連携。
3. 実データではなくテストID・テスト作品・テスト履歴で、投稿・承認・本人照合・ガチャ・皆勤を検証。
4. 本番版と統合版の全差分をレビューし、テスト/バックアップ/ロールバックを通過。
5. ユーザーの明示的な本番切替承認後、既存Vercelプロジェクトの固定URLへ安全に反映。試験用静的ルーティングは本番用に差し替える。
