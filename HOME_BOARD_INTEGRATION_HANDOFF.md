# 次期みおシステム統合用：トップ情報機能 引き継ぎ

## 統合対象
- index.html
- home-updates.css
- home-updates.js
- news.html
- schedule.html
- api-home-info.js
- home-info-gas-v10.gs
- HOMEINFO_DOPOST_PATCH.txt
- vercel.json の該当追加分

## デモ
- home-top-demo.html
- home-updates-demo.html

## トップ仕様
- 背景/ヒーローを最初に見せる
- 配信中のみ LIVE バナーを表示
- お知らせは最新1件だけ要約
- 配信予定は次回予定を優先して1件だけ要約
- 詳細は news.html / schedule.html へ画面遷移
- トップに一覧を並べない

## 正本Sheet
- emuzii_連携設定 A32:H49: お知らせ
- emuzii_連携設定 A51:H68: 配信予定
- emuzii_管理画面 A121以降: 管理入口・入力チェック
- 既存参加者/ガチャ/皆勤/FA/予想データは変更しない

## 公開API
- /api/home-info
- 参加者Cookie不要
- 同一サイトPOSTのみ
- Vercel側から既存APPS_SCRIPT_SECRET付きでGASへ接続
- GAS側でも既存秘密鍵検証通過後にhomeInfo分岐

## 安全策
- HTTPS URLのみ
- HTMLエスケープ
- タイトル80文字/本文500文字
- 最大5件
- 公開開始/終了判定
- 終了済み配信除外
- 24時間キャッシュ
- キャッシュ中も期限切れ/終了済みを除外
- API初回失敗でもトップ要約は固まらない

## ガチャ統合時
- ガチャ側と重なる可能性があるのは vercel.json
- index.html はトップ情報側を基準にし、ガチャへの既存リンクは維持
- api-gacha.js / gacha-page.js / app.js / bridge.js はトップ情報機能では変更しない
- ガチャ完成後、次期統合版で双方のvercel.jsonを合成して最終ビルドする
