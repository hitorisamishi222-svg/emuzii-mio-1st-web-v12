# みおシステム 防御強化計画 v0.1

## 現行ソースの読取り確認（2026-10-08）
- GitHub repository visibility = public。mainにApps Script過去版ソースも存在。
- bridge.js: Vercel環境変数APPS_SCRIPT_SECRET/URL、HTTPS限定接続、署名付きHttpOnly/Secure/SameSite=Lax Cookie、署名改ざん検証、同一Host Origin比較（Originが存在する場合）あり。
- Apps Script旧版にScriptProperties秘密値の照合箇所あり。ただし実際に稼働中の最新GAS全体や直接アクセス経路、管理者権限は未監査。
- api-register.js / api-checkin.js / api-gacha.js に明示的なAPI個別レート制限やCAPTCHA検証は現時点では見当たらない。
- vercel.jsonに明示的なsecurity headersは設定されていない。bridge.jsはX-Content-Type-Optionsを付与。
- GitHub/Vercel/Googleの実際の2FA、公開範囲、WAF設定、Secret Scanning、有効なルール、GASデプロイ権限の確認は未実施（読み取り権限不足）。
- GitHub公開ソースの現行スキャンで明白なパスワード文字列の直接代入は検出されなかったが、漏えいなしとは断定できない。Git履歴まで含めてSecret Scanningが必要。

## 優先度A：コミュニティ実接続・本番一括切替より前
1. GitHub・Vercel・Google各アカウントで2FA/パスキー・回復手段・共同管理者と接続アプリの権限を確認。
2. 公開GitHubをPrivateにするか検討。Vercel Git連携を維持できることを先に確認してから変更。今は変更しない。
3. GitHubの全履歴をSecret Scanningで調査。実キーを発見したら失効・再発行し、古い履歴だけを消して済ませない。
4. Vercel本番/Preview環境変数を分離。秘密情報は環境変数だけ。Previewには本番編集用Secretを渡さない。
5. Vercel Firewallで入口APIにIP単位・アカウント単位のレート制限を用意。まずログのみ→テスト→本番ルール。
6. 新規登録/作品投稿/高頻度チャット入口にBot対策（Turnstile等）。トークンはサーバーで検証。
7. POST操作のCSRF/Origin/Sec-Fetch-Site厳格化、JSON以外の受付を制限。Origin欠落時の扱いを明示。
8. CSP・Referrer-Policy・HSTS・Permissions-PolicyなどのHTTPヘッダーを静的/動的リソースへ段階導入。既存音楽・画像・Googleフォーム等を壊さないようReport-Onlyテスト。
9. 公開APIのエラーは汎用メッセージにし、内部エラー・鍵・参加者データを返さない。管理監査ログは秘密と個人情報をマスク。
10. Apps Scriptの全doPost/公開doGetの分岐ごとに秘密照合と権限検査を確認。Sheet所有者の権限で動く公開WebAppとしての危険を評価。

## 優先度A：コミュニティ機能
- 公開メッセージの読込だけゲスト可。書込/作品申請/管理は署名Cookie＋サーバー照合＋DBの行レベル制御で多層拒否。
- 連投制限、同文連投抑止、禁止URL、長文上限、通報・ミュート・一時停止・アカウント停止。
- アップロードは非公開領域へ受け取る。MIME/内容/容量チェック、動画・画像の無害化、画像位置EXIF削除、著作権・肖像権同意・管理者審査後に公開。
- ダイヤ・ガチャなど既存機能とコミュニティが共有する編集権限や秘密鍵を増やさない。
- 緊急停止スイッチ：コミュニティ/作品投稿APIだけ停止し、皆勤・ガチャ・既存ページは停止しない。

## 優先度B：運用
- 正本Sheetを毎日または変更前後に整合性付きでバックアップ。復元テストと最小権限で共有を管理。二重書込みは復活させない。
- 監査ログ（管理者操作・拒否・WAF・承認・削除）の取得と異常アクセス通知。
- 月1の依存関係・GitHub権限・Preview保護・Vercel/Google連携権限見直し。
- 次期版のTEST環境で攻撃を模倣した権限テスト・大量リクエストテストを少量の安全な条件で実施。本番に負荷テストしない。

## 現在の状態
本ファイルは準備ブランチの必須セキュリティ要件の記録のみ。Firewall、2FA、GitHub設定、Google Sheet、Vercel本番、GASデプロイの設定変更は行っていない。