Load failed 対策版

GitHub の emuzii-mio-1st-web-v12 直下に app.js を上書きしてください。
他のファイルは触らなくてOKです。

変更点:
- Safari / iPhone / アプリ内ブラウザで fetch が "Load failed" になった場合、同じPOSTを XMLHttpRequest で自動再試行
- status / register / checkin すべて同じ通信処理を使用
- 既存の皆勤入力・BGMループ・Web音量・バックグラウンド再生対策は維持

API/status の直リンクで OK が出ているため、Vercel自体の死活ではなくページ側POST通信の回避を追加した版です。
