# 翠央1周年 トップページ お知らせ・配信予定 v1.0

## 状態
- 本番未反映
- 準備ブランチ: `home-board-prep`
- 基準 main / ロールバック地点: `0aafe90cc8ca01eebca2650a25969108d7b26a31`

## 公開側
- ヒーロー直下にコンパクトな「最新情報」導線を追加
- お知らせ: 通常 / 重要 / 緊急、NEW表示、本文、HTTPSリンク
- 配信予定: NEXT LIVE / LIVE / SCHEDULE、自動時刻判定、本文、HTTPSリンク
- 1分ごとに再読込
- 読み込み失敗時も既存トップ機能は維持
- リスナー画面に emuzii / えむじー表記は出さない

## 管理側（正本Google Sheet）
- `emuzii_連携設定!A32:H49` お知らせ管理
  - A: ID
  - B: 表示チェック
  - C: 重要度（通常 / 重要 / 緊急）
  - D: タイトル
  - E: 本文
  - F: 公開開始
  - G: 公開終了
  - H: リンクURL
  - 実データ: 34〜49行
- `emuzii_連携設定!A51:H68` 配信スケジュール管理
  - A: ID
  - B: 表示チェック
  - C: 日付
  - D: 開始
  - E: 終了
  - F: タイトル
  - G: 内容
  - H: 配信URL
  - 実データ: 53〜68行
- `emuzii_管理画面!A121:D124` にトップページ更新入口を追加
- 入力例は表示OFFなので公開されない

## Web構成
- `api-home-info.js` → 既存 `bridge()` で Apps Script `homeInfo` を読む
- `home-updates.css`
- `home-updates.js`
- `home-updates-demo.html`
- `index.html` 差分追加
- `vercel.json` に API / static assets を追加
- 参加者認証API、ガチャ、皆勤、FA、予想には変更なし

## Apps Script
追加ファイル:
- `home-info-gas-v10.gs`
既存 `doPost(e)` の **APPS_SCRIPT_SECRET検証を通過した後** の action 分岐へ追加:
- `if (action === 'homeInfo') return homeInfoResponseV10_();`

この1行以外、既存 register / status / checkin / catalog / draw / history 分岐は変更しない。秘密鍵検証より前には置かない。

## 公開前手順
1. Apps Scriptへ `home-info-gas-v10.gs` を追加。
2. 既存doPostへ `HOMEINFO_DOPOST_PATCH.txt` の1行を追加。
3. 同じ既存デプロイIDを新バージョンで更新。
4. Previewの `/home-updates-demo.html` で表示確認。
5. 正本Sheetの入力例は表示OFFのまま確認。
6. テスト用のお知らせ1件・配信予定1件だけONにしてPreviewで実データ連携確認。
7. OFFへ戻してから最新mainとの差分確認。
8. 問題なければ本番mainへ1回反映。

## ロールバック
- Web異常: mainを `0aafe90cc8ca01eebca2650a25969108d7b26a31` へ戻す
- Apps Script異常: 既存doPostからhomeInfo分岐1行を外し、直前のApps Scriptデプロイ版へ戻す
- Sheet管理欄は表示OFFなら公開へ影響しない

## 完了済み追加検証
- ローカルChromium 375px / 430px: 横はみ出し0
- 長文 / 空表示 / LIVE / NEXT LIVE: PASS
- HTML/script文字列のエスケープ: PASS
- javascript: URL拒否: PASS
- 期限切れキャッシュ除外: PASS
- 最大5件制限: PASS
- 豪華ガチャ統合Preview: Vercel success

## v1.9.3 スマホ向け構成
- トップはLIVEバナー＋お知らせ要約1件＋配信予定要約1件のみ
- お知らせ詳細: news.html
- 配信予定詳細: schedule.html
- トップに一覧を並べずスクロール量を抑える
- 配信中がある時も配信予定カードは次回予定を優先表示
