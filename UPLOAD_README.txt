バックグラウンド再生対応パッチ

1. GitHub の emuzii-mio-1st-web-v12 に app.js を上書きアップロード
2. Commit changes
3. MP3 ファイル名は必ず mio-awakening.mp3
4. Vercel の自動デプロイが Ready になるまで待つ
5. 固定URLをSafari/Chromeで開き、再生ボタンを1回押す

仕様:
- ループ再生
- バックグラウンド再生を優先
- ロック画面/通知領域の再生・停止に対応可能な端末ではMedia Sessionを使用
- iPhone/iPadはWeb側音量スライダーを無効化し、端末音量ボタンで調整
- Android/PCはサイト内音量スライダーを使用

注意:
ChatGPTなどアプリ内ブラウザではOS/アプリ側の制限でバックグラウンド再生が止まることがあります。
iPhoneではSafariで固定URLを開くのが最も安定します。
