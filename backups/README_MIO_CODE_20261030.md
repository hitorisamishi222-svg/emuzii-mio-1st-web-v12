# 2026-10-30 現行 Code.gs バックアップ照合

チャットで受領した現行バックアップに合わせ、元の Web 登録・皆勤・ガチャ・2名限定ブラウザ復旧・Web受付ON/OFF部分を照合するための資料。

## ファイル

- 旧コア再構成: [MIO_Code_PRE_WEB_ADMIN_reconstructed_20261030.gs](./MIO_Code_PRE_WEB_ADMIN_reconstructed_20261030.gs)
- GAS全文貼り付け用: [GAS_Code_FULL_WEB_OPS_20261030.gs](../GAS_Code_FULL_WEB_OPS_20261030.gs)
- 全文貼り替え手順: [MIO_GAS_FULL_REPLACE_SETUP.md](../docs/MIO_GAS_FULL_REPLACE_SETUP.md)

## 非常に重要

旧コア再構成ファイルは、チャット投稿の完全なバイト単位の複製ではありません。GitHub統合版の先頭コアから、Web運営管理末尾ブロックと管理ルーティング1行だけを除いた比較用コードです。
ユーザー投稿にはバックスラッシュによるエスケープや HTML エンティティ（&#91;、&lt;、&amp;）が含まれ、それをそのまま Apps Script に貼り付けることはできません。
Apps Scriptエディタ上の実際の原本ファイルを直接取得できていないため、実本番の原本とバイト一致済みとは主張しません。

Apps Scriptへ貼り付けるのは統合版 Code.gs の全文のみ。旧コア再構成ファイルは貼り付け不要です。追加ファイル・部分修正は実施しません。
既存のスプレッドシートID、スクリプトプロジェクト、WEBアプリURLを維持し、既存デプロイの新バージョンで更新します。
setup()や初期化処理は実行しません。現時点で本番GASは未更新です。