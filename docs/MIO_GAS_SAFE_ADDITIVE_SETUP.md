# みお Web管理｜既存GASを壊さない追加方式（推奨）

既存本番の `Code.gs` 全文を入れ替えず、**管理機能だけを追加**します。
対象は今使っている翠央1周年のスプレッドシート紐付け Apps Script **同一プロジェクト**です。新しいプロジェクト・スプレッドシート・WebアプリのURLは作りません。

## 操作（初回のみ・既存GASのオーナーが実施）

1. [既存管理シート](https://docs.google.com/spreadsheets/d/1WqkXSV_UehRdpO9VVqRAL9ZTVXwD_GxlH3Ey50uX3PM/edit) を開き、**拡張機能 → Apps Script**。現在の `Code.gs` をバックアップする。
2. Apps Script エディタの **＋ → スクリプト**から `WebAdminOps.gs` を1ファイル追加する。[管理機能コード `GAS_WebAdminOps_20261030.gs`](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/blob/main/GAS_WebAdminOps_20261030.gs) の中身を **全文**貼り付けて保存する。元の `Code.gs` は削除しない。
3. 既存 `Code.gs` の **`doPost(e)` 内**で、`BRIDGE_SECRET` が正しいことをチェックした後、かつ `participantId` / `tokenHash` 検査より**前**に、以下の **2行のみ**追加する。元の分岐は残す。
   ```javascript
   if(/^webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)$/.test(d.action))
     return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));
   ```
4. 保存し、**デプロイ → デプロイを管理 → 既存のWebアプリの編集（鉛筆）→ バージョン「新バージョン」→ デプロイ**。新規デプロイを作らない。
5. [既存 Web管理画面](https://emuzii-mio-1st-web-v12.vercel.app/gacha-web-gate.html) に戻り、管理者認証後に「受付・参加者情報を読み込む」。承認待ち一覧などが表示されることを確認する。

## 確認項目（必須）

- 既存の通常ガチャ/ラキフェス ON/OFFがこれまで通り表示される。
- 読み取り連携が完了するまで **新規承認・回数付与・新規受付の書き込みは解除しない**。
- 既存参加者MIO-ID、Web参加ID、皆勤、購入回数、ガチャ抽選・当選・景品履歴をそのまま残す。
- 管理者コードおよび `BRIDGE_SECRET` を GitHub、チャット、公開HTML、スクリーンショットに貼らない。
- 旧端末復旧・まーくん MIO-0010 / サスケ MIO-0018 の既存承認・旧ブラウザデータはそのまま。
- Web管理権限の本番リリースフラグ `MIO_GACHA_ADMIN_OPS_RELEASE` は、読み取り＋安全な実接続試験後に管理者が承認した時点で初めて有効化する。

## 全文差し替え版との違い

[以前の `GAS_Code_FULL_WEB_OPS_20261030.gs`](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/blob/main/GAS_Code_FULL_WEB_OPS_20261030.gs) は、2026-10-30に保存した旧 `Code.gs` のスナップショットを基にしたもの。現在稼働中のApps Script側にその後の変更があれば、それを消すおそれがあります。そのため**現行 `Code.gs` を維持する追加方式**を優先します。

## 連携上の制約

接続済みGoogle Drive/Sheetsの操作ツールは既存 Apps Script の `Code.gs` やデプロイバージョンを書き換えられないため、この2か所の操作だけは Apps Script エディタで実施が必要です。Web管理画面側はすでに本番へ反映されています。
