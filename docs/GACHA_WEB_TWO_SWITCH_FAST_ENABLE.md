# 2026-10-30 みおガチャ受付・Web ON/OFF最短接続

## 目的
既存の **通常ガチャ／ラキフェスの2つの受付スイッチだけ** を、Web管理画面から変更する。本番URL、MIO-ID、既存皆勤、ガチャ回数、既存抽選履歴、景品を保持。新規Apps Scriptプロジェクト・新規デプロイは作成しない。

## 設置状況
- 本番Googleシートは連動済み：`emuzii_ガチャ緊急管理_1030`のB2/D2（編集用）が`emuzii_管理画面`B141/B142（受付判定）にリンク。ONとOFFの実読戻しは通過、現在は両方OFF。
- このPRには `gacha-web-gate.html`、`api-gacha-web-gate.js`、追加GAS `GAS_WebGateOnly_20261030.gs` がある。
- Web管理者コードのSHA-256は既存Vercel本番に設定済み。**公開フラグは未設定なので管理APIは無効。**
- GAS更新は未実施。GASコードを更新するまで本番利用不可。

## 既存Apps Scriptへの最小追加（オーナーによる一度だけの作業）

1. [既存管理シート](https://docs.google.com/spreadsheets/d/1WqkXSV_UehRdpO9VVqRAL9ZTVXwD_GxlH3Ey50uX3PM/edit#gid=128429723) を開き、**拡張機能 → Apps Script** から既存プロジェクトを開く。
2. `GAS_WebGateOnly_20261030.gs` の内容を**新しい .gs ファイルとして既存プロジェクト内に追加**する。既存ファイルを全置換しない。
3. 同じプロジェクトの既存 `doPost(e)` で、`BRIDGE_SECRET` の照合（`unauthorized` 拒否）の**直後**、参加者 `MIO-W-` の形式検査の**前**に、以下の分岐1行を追加：
   ```javascript
   if(d.action==='webGateRead'||d.action==='webGateSet')return json_(gachaWebGateAction_(SpreadsheetApp.openById(SHEET_ID),d));
   ```
   **この分岐をBRIDGE_SECRETの検査より前に置くことは禁止。** `doPost`は既存のScriptLockの内側で実行する。
4. **重要：** 既存 `gachaAction_(ss,r,d)` 内のゲート読込行を、次の一行に置換する（既存の欠落関数による強制OFFを防ぐ）：
   ```javascript
   var gate=gachaWebGateState_(ss);
   ```
   現在の実デプロイGASの内容を先に確かめ、同名コードや重複`doPost`を作らない。
5. 保存→**デプロイを管理**→既存のWebアプリの編集→**新しいバージョン**→更新。新しいデプロイは作成せず、既存`/exec`URL維持。`setup()`は実行しない。

## Vercel公開
GASが動作することを確認したあとで、Web管理ページと専用APIを本番に配置し、既存Vercel環境で `MIO_GACHA_WEB_RELEASE=verified-gas-gate-20261030` に設定して再デプロイする。`MIO_GACHA_WEB_KEY_SHA256`は設定済み（値を公開しない）。本番Web管理URLは `https://emuzii-mio-1st-web-v12.vercel.app/gacha-web-gate.html`。別プロジェクトや別ドメインの公開はしない。

## 受入テスト
- 初回読み込みで通常・ラキフェスともOFF表示。
- **通常ON→再読込でON→通常OFF→再読込でOFF**、B2/B141が一致。
- **ラキフェスON→再読込でON→ラキフェスOFF→再読込でOFF**、D2/B142が一致。
- 参加者認証済端末でガチャ画面が連動し、受付OFF時は新しい抽選を拒否。
- **本番の抽選を実際には引かず、回数・当選履歴が変わらないことを確認**。テスト後は両方OFF。

## 注意
Web側のプレビュー環境は本番GASに書き込めない。GAS更新・公開環境のフラグ有効化・管理者実機テストをするまでは、ページ表示だけで完成とはしない。
