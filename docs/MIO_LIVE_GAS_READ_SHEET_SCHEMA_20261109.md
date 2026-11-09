# みおWeb管理Read｜本番シート構成の読み取り専用照合

確認日: 2026-11-09 JST。接続済みGoogle Sheetsで**既存本番台帳のメタデータと見出しだけ**を再取得し、GAS統合候補のRead処理と照合した。参加者情報・ガチャ回数・トークン・氏名・秘密鍵は記録せず、本番データの書込はゼロ。

## ① 本番実物で確認したRead依存

| シート | 参照範囲 | 実在・見出し | 値の扱い |
|---|---|---|---|
| `emuzii_Web登録` | A:U（21列） | 存在。A=`Web参加ID`, F=`登録承認`, G=`メンシプ確認`, H=`照合参加者ID`, K=`統合参加者ID`, L=`みお確認`, U=`ログインID` | Readのみ |
| `emuzii_参加者` | A:J（10列） | 存在。A=`参加者ID`, B=`ColorSing名` | Readのみ |
| `emuzii_ガチャ` | A:Q（17列） | 存在。A=`参加者ID`, F=`総ガチャ権利`, H=`総残り回数`, M/N=`入力チェック`/`名前チェック`, O=`特別付与` | Readのみ |
| `emuzii_新規簡易登録` | A:F（6列） | 存在。A=`登録日時（UTC）`, B=`ColorSing名`, E=`管理確認` | Readのみ |
| `emuzii_ガチャ付与履歴` | A:I（9列）＋J1の監査見出し | 存在。A:Iの9見出しを確認。J1=`Web操作ID`は**未設定** | 既存履歴は変更しない |

`emuzii_Web管理操作履歴` 監査タブも未設置のまま。現在の `mioAdminOpsRead_` は `mioAdminOpsSchema_` から `schemaReady:false` / `auditReady:false` / `grantLogReady:false` を返し、**監査未整備でもReadの完了を阻害しない**。管理書込はこれらの監査ゲートやVercel書込フラグで引き続き停止。

## ② 開発ブランチの検証

- 新規 `tests/mio-admin-production-header-contract-readonly.test.mjs` に、今回確認できた**見出し構成のみ**を固定。実在の個人・ID・購入・特別付与データはテストへコピーしない。
- 完全合成のWeb参加者・ガチャ権利・簡易登録・付与履歴で `webAdminOpsRead` が必要なRead応答を返すか、監査未設定の状態で適切な状態フラグを返すかを検証する。
- `SpreadsheetApp.flush` / `insertSheet` / `setValue` / `setValues` / `appendRow` はモックで例外にし、Readが想定外の書込をしないことを確認する。Secret不一致ではシートに触れない。
- 静的/GAS合成テストに合格しても**実稼働のGASデプロイにReadルートがある証拠にはならない**。

## ③ 残る本番GAS接続の1障害

Vercel本番は管理 `read` を `webAdminOpsRead` としてGASへ送信する。過去の本番ログ3件は `invalid identity`。公開GASの実Deployment ID/versionNumber/版指定ソースは未照合。管理ルート欠落・旧公開版である可能性は残るが、確定しない。**既存デプロイの公開版ソースを取得した後**にだけ、復元バックアップと照合した最小差分の承認・更新を判断する。

本番のGAS・本番Vercel・Google Sheets・既存ID・10月皆勤・ガチャ権利・付与履歴・当選履歴は変更しない。PR #87 Draftを維持。
