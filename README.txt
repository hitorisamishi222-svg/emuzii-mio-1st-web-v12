翠央1周年サイト バックグラウンド再生修正 v5

GitHub の emuzii-mio-1st-web-v12 直下にある app.js を、この app.js で上書きしてください。

変更点:
- 既存の皆勤賞修正を維持
- mio-awakening.mp3 1ファイル再生を維持
- Web音量スライダーを維持
- loop再生を維持
- Media Sessionを維持
- iOS/Safariで navigator.audioSession.type='playback' を AudioContext作成前・再開時に設定
- バックグラウンド移行時のWeb Audio停止を抑制

アップロード後は Commit changes。VercelのGit連携が正常なら自動デプロイされます。
