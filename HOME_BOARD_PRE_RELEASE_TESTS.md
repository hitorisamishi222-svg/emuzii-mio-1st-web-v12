# トップページ お知らせ・配信予定 公開前テスト記録

## 対象
- ブランチ: `home-board-prep`
- 本番main基準: `0aafe90cc8ca01eebca2650a25969108d7b26a31`
- 本番未反映

## 表示テスト
- 375px幅: 横スクロールなし
- 430px幅: 横スクロールなし
- 標準表示: PASS
- 空表示: PASS
- 長文タイトル/本文: PASS
- お知らせのみ: PASS
- 配信予定のみ: PASS
- LIVE + NEXT LIVE: PASS
- 配信中が存在しても最初の未来予定を NEXT LIVE として表示: PASS

## 日時テスト
- 通常の未来配信: PASS
- 現在配信中: PASS
- 終了済み配信を除外: PASS
- 23:00 → 翌1:00 の日跨ぎ: PASS
- お知らせ公開開始前を除外: PASS
- お知らせ公開終了後を除外: PASS
- 緊急 → 重要 → 通常の優先順: PASS

## 安全性
- HTMLタグ文字列をタイトル/本文へ入れてもHTMLとして実行されない: PASS
- script文字列を本文へ入れても実行されない: PASS
- javascript: URLはリンクとして出さない: PASS
- 公開URLはHTTPSのみ: PASS
- お知らせ最大5件: PASS
- 配信予定最大5件: PASS
- タイトル公開上限80文字: 実装済み
- 本文公開上限500文字: 実装済み
- 制御文字除去: 実装済み
- Sheet原文は変更せず公開表示だけを丸める: 実装済み

## 障害時
- API失敗時に前回取得データを利用: 実装済み
- キャッシュ中でも期限切れお知らせを除外: PASS
- キャッシュ中でも終了済み配信を除外: PASS
- キャッシュがない場合はエラー文だけ表示し既存トップ機能を維持: 実装済み

## 管理Sheet
- お知らせ入力エラー: 0
- 配信予定入力エラー: 0
- お知らせURLエラー: 0
- 配信URLエラー: 0
- お知らせ期間エラー: 0
- 公開判定: OK
- 公開中お知らせ件数: 0
- 公開中配信予定件数: 0
- サンプル行は全て表示OFF

## 既存機能への影響
次の既存ファイルは `home-board-prep` で変更していない。
- api-gacha.js
- gacha-page.js
- api-status.js
- api-register.js
- api-checkin.js
- app.js
- bridge.js

## 豪華ガチャとの共存
- ガチャ準備版: `release/v1.9.1-gacha-cinematic-prep`
- 共通変更ファイルは `vercel.json` のみ
- 統合確認ブランチ: `pre-release-integration-check`
- 両機能を統合した Vercel Preview build: success

## 本番更新時の必須確認
1. 最新mainが基準から動いていないか再確認。
2. Apps Scriptへ `home-info-gas-v10.gs` を追加。
3. 既存の秘密鍵検証を通過した後の action 分岐に `homeInfo` を追加。
4. 同じ既存デプロイIDを更新。
5. homeInfo実レスポンスを確認。
6. お知らせ/配信予定を各1件、表示OFFで入力。
7. 1件ずつONにして実表示確認。
8. 確認後OFFへ戻す。
9. 豪華ガチャを先に/後に入れる場合、統合版 `vercel.json` を使用。
10. mainへ1回で反映。
