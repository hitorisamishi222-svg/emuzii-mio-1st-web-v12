翠央1周年・皆勤賞反映修正

1) Google Sheets側
- emuzii_管理画面 10/1〜10/31 の確認文字を 1〜31 に設定済み。
- emuzii_皆勤31日 の MIO-0499 / えむじー🐱 行は存在確認済み。

2) GitHub/Vercel側
- app.js を同名で上書き。皆勤送信を共通post()経由に変更し、Cookie送信/キャッシュなしを明示。
- api-checkin.js は確認用。同名で上書きしても可。

3) Google Apps Script側（重要）
- Code.gs を Apps Scriptプロジェクトの Code.gs に置換。
- 保存後「デプロイ」→「デプロイを管理」→既存Webアプリの編集→新しいバージョン→デプロイ。
- URLは変えない。既存 /exec URLを継続利用。

症状「unauthorized」は、参加状況(status)は動くのに checkin だけ古いApps Script側で未対応のときに起きる。
このCode.gsは checkin を許可し、承認済みWeb登録→照合参加者ID→皆勤31日へ○を保存する。
