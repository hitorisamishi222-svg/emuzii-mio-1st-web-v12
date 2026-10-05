バックグラウンド再生＋音量操作 修正版 v2

修正内容:
- 前版でiPhoneの音量スライダーを disabled にしてしまった問題を修正
- iPhone/iPadでは「ミュート/音あり」ボタンを表示
- 細かな音量はiPhone本体の音量ボタンで調整
- Android/PCでは従来どおりサイト内の音量スライダーが動作
- HTMLMediaElementのネイティブ再生を維持し、バックグラウンド再生を優先
- ループ再生とMedia Session（対応端末のロック画面再生/停止）を維持

反映方法:
1. GitHub の emuzii-mio-1st-web-v12 に app.js を上書きアップロード
2. Commit changes
3. Vercel の自動デプロイが Ready になるまで待つ
4. 固定URLをSafariで開き直し、再生ボタンを押す

重要:
MP3ファイル名は mio-awakening.mp3 のままにしてください。
