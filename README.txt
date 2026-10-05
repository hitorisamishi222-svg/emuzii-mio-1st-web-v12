翠央1周年 皆勤賞 + BGM 統合修正版 v6

今回の目的
- 皆勤賞の「unauthorized」を解消する。
- 10/1〜10/31の確認文字入力を維持する。
- 予想未提出でも皆勤賞へ参加できる。
- BGMの単一MP3 / ループ / Web音量 / Media Session / バックグラウンド対策(v5)を維持する。

確認済み
- Vercel固定プロジェクト: emuzii-mio-1st-web-v12
- Vercel本番側に APPS_SCRIPT_URL / APPS_SCRIPT_SECRET が存在。
- APPS_SCRIPT_URL は既存の Google Apps Script /exec を向いている。
- GitHub main → 固定Vercelプロジェクトの本番自動デプロイが動作している。
- 管理シート 10/1〜10/31 の確認文字は設定済み。先頭の ' は不要。
- えむじー🐱 は内部参加者 MIO-0499 の皆勤行まで存在。

重要：unauthorized の場所
参加状況(status)が読めているのに checkin だけ unauthorized なので、
確認文字そのものではなく、checkin の認証ゲートで止まっている。
この Code.gs は checkin を許可し、承認済みWeb登録 → 照合参加者ID → 皆勤31日へ「○」を保存する。

更新手順
1. GitHub
   - app.js を同名で上書き
   - api-checkin.js を同名で上書き
   - Commit changes
   ※ GitHub main へのCommitで固定Vercelプロジェクトが自動デプロイされる。

2. Google Apps Script（ここだけブラウザ操作が必要）
   - 現在のプロジェクトの Code.gs をこの Code.gs に置換して保存
   - 「デプロイ」→「デプロイを管理」
   - 既存Webアプリの鉛筆（編集）
   - バージョンを「新しいバージョン」
   - 「デプロイ」
   ※ 新しいWebアプリを作らない。既存 /exec URLを維持する。
   ※ setup() を改めて実行する必要はない。

3. 動作確認
   - 10/3を選ぶ → 確認文字「3」→送信
   - 成功時「10/3 の確認を受け付けました」
   - emuzii_皆勤31日の該当日に「○」が入る

管理画面の確認文字
- 3 と入力する場合は「3」だけ。
- '3 のような先頭アポストロフィは不要。
- 03 / A3 / み なども文字列としてそのまま設定可能。
