# みお 1周年｜GAS Code.gs 全文貼り替え（唯一の更新手順）

**部分追加は禁止です。** `WebAdminOps.gs` の新規作成、`doPost` への2行追加、追加モジュールの貼り付けは行いません。

使用する統合版（単一ファイル）：[GAS_Code_FULL_WEB_OPS_20261030.gs](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/blob/main/GAS_Code_FULL_WEB_OPS_20261030.gs)

## 1回だけ行う更新

1. [みお既存管理シート](https://docs.google.com/spreadsheets/d/1WqkXSV_UehRdpO9VVqRAL9ZTVXwD_GxlH3Ey50uX3PM/edit)を開く。
2. **拡張機能 → Apps Script** を選び、現在稼働している Apps Script **同一プロジェクト**を開く。
3. **現行 `Code.gs` 全文を先にバックアップ。** 統合版は保存済みコードの版を基にしているため、稼働中GASの未反映変更がないかをバックアップと照合する。意図しない変更があれば更新を保留。
4. [統合版 `GAS_Code_FULL_WEB_OPS_20261030.gs`](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/blob/main/GAS_Code_FULL_WEB_OPS_20261030.gs) を開き、コードを **先頭から末尾まで全文コピー**。
5. **既存の `Code.gs`** を開き、現在の内容を **全選択 → 全文貼り替え** して保存。追加のGASファイルは作成しない。
6. **デプロイ → デプロイを管理 → 既存Webアプリの編集（鉛筆）→ バージョン「新バージョン」→ デプロイ。** 新しいデプロイやURLは作成しない。
7. [既存管理画面](https://emuzii-mio-1st-web-v12.vercel.app/gacha-web-gate.html)に戻り、管理者認証後に「受付・参加者情報を読み込む」を押す。
8. 読み取りが成功し、既存のガチャON/OFF・Face ID・登録・皆勤が保たれていることを確認してから、Web管理書き込みの解放可否を判断する。**読み取り成功だけで書き込みを自動有効化しない。**

## 絶対に変えないもの

- スプレッドシートID・既存データ・MIO-ID・Web参加ID・ガチャ回数・付与履歴・当選履歴・皆勤履歴
- GAS既存プロジェクト・スクリプトプロパティ（特に `BRIDGE_SECRET`）・WebアプリのデプロイURL
- 特別復旧対象のまーくん（MIO-0010）・サスケ（MIO-0018）の既存ID／承認履歴

## 注意

- `setup()` や初期化関数は、単なるコード更新のために実行しない。
- `Code.gs` のほかに既存の `.gs` ファイルがある場合は削除せず、同名関数の重複がないか確認する。衝突があれば無理にデプロイしない。
- 管理者コード、`BRIDGE_SECRET`、Cookie、tokenHash等を画面コピーやチャットに貼らない。
- このリポジトリの変更は **Apps Scriptへ自動デプロイされない**。接続済みツールには既存GASプロジェクトのコード更新権限がないため、Apps Scriptエディタ上の操作が必要。
