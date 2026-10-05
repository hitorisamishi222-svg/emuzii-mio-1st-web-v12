iPhoneでもWeb音量調整＋バックグラウンド再生を両立する修正版 v3

GitHub の emuzii-mio-1st-web-v12 直下へ、次の5ファイルをアップロードしてください。
- app.js（上書き）
- mio-awakening.mp3
- mio-awakening-v25.mp3
- mio-awakening-v50.mp3
- mio-awakening-v75.mp3

Webの音量スライダーは 0 / 25 / 50 / 75 / 100% の5段階です。
0%はミュート。25〜100%は音量違いのMP3へ現在位置を保って切り替えます。
Web Audio APIを使わないため、通常のaudio要素のバックグラウンド再生を維持しやすい方式です。

アップロード後、Commit changes → Vercelの自動デプロイがReadyになるのを待ってください。
