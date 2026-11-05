# 翠央記念館｜既存サービスを保護する接続準備（2026-11-05）

> 状態：**未合格／接続・DB移行・公開を禁止**。開発中Draft PR #76 の記録。
> この記録は、2026-11-05 にVercel・Neonの**復号なしメタデータだけ**を調べたもの。
> 過去の構成の記録であり、現在の認証・接続権限・復元可能性の保証ではない。

## 実際に確認した内容

| 項目 | メタデータで確認した事実 | 判定 |
|---|---|---|
| Vercel | 既存 `GALLERY_DATABASE_URL` はProduction／共通Preview／別ブランチ用Previewに存在する。値は復号していない | 記念館の分離証明には利用しない |
| Vercel | **専用 `MIO_MUSEUM_GALLERY_DATABASE_URL` は一覧になかった** | 未設定 |
| Neon | 既存プロジェクトに、Primaryではない `gallery-admin-isolated` ブランチと `neondb` がある | 候補として確認 |
| Neon | 既存分離DBには14テーブルがある。管理者・デバイス・セッション表はある | テーブルの存在のみ確認 |
| Neon | `museum_public_exhibits`、`museum_gallery_layout_stage`、`museum_gallery_layout_history_stage`、`museum_gallery_layout_audit_stage` が一覧にない | 構造未適用 |
| Neon | プロジェクトのSnapshot一覧は0件 | Snapshotを使用した復元演習は未実施 |
| 本番 | `main` と本番GAS・参加者・皆勤・ガチャ・当選記録は変更していない | 保護を維持 |

管理者の `gallery_admin_users` テーブルには一人のactive ownerを制限するunique indexがある。
`gallery_admin_sessions` にはユーザー／デバイス外部キー、期限、失効日時、トークンハッシュがある。
これは列や制約の存在確認であり、実際の管理者端末ログインや権限の合格ではない。

## 既存の設定を壊さない修正方針

従来の `GALLERY_DATABASE_URL` は他のギャラリー画面やPreviewで使われ得るため、
**変更・削除・上書きをしない**。記念館専用の
`MIO_MUSEUM_GALLERY_DATABASE_URL` を採用する（今回のDraftでは検査コードのみ変更）。

専用キーは、特定の開発ブランチ
`feature/mio-v2-integration-mainbaseline-20261102` にのみPreviewスコープを付け、
分離Neonブランチへ向ける。一般Preview、Production、Developmentに同名キーの
共通値を作らない。実際のPostgreSQL URLは環境管理側で設定し、コミット、ログ、
チャット、公開HTMLには貼り付けない。

## 次の作業順序と公開前の停止条件

1. 既存の別プロジェクトや環境変数を破壊せず、管理者が既存Vercelプロジェクトの
   **記念館ブランチだけ**の専用キーを安全に設定する。復号値は公開・共有しない。
2. 分離Neonブランチ／エンドポイント／データベース／接続ロールの同一性を
   サーバー側で照合する。環境変数名の存在だけでは接続を許可しない。
3. **復元可能なバックアップの作成と別環境での復元演習**を検証する。
   Snapshot一覧0件でもPITR等があり得るので、単にバックアップなしとは断言しない。
4. 既存本番を変更せず、選定した分離ブランチに限って4つの記念館用候補テーブルを
   後日レビューして導入する。現在の未適用SQLを勝手に実行しない。
5. Neonで列型・制約・所有者外部キーをREAD ONLYで再確認し、
   投稿や保存は既存のオーナー端末認証・適正な権限・現在の権利確認を経由させる。
6. Draftの編集→仮保存→差分確認→公開→復元を隔離環境で検証。
   従来のGASソース・デプロイ照合、参加者保護、明示的な公開判断まで本番反映しない。

## 今回の開発で増やした自動検査

- `museum-vercel-preview-env-scope-stage.mjs`：専用キーのブランチ限定・暗号化・重複なしを確認。
- `museum-provider-readiness-stage.mjs`：Providerメタデータを基に分離DB・必要テーブル・Snapshot一覧を診断。
- `museum-gallery-client-stage.mjs`：独立したPreviewスコープ検証を通過するまで保存処理を遮断。
- `tests/mio-museum-*.test.mjs`：不正な共有Preview、候補テーブル欠落、異なるブランチ、
  Snapshot不在、証明欠落時の拒否を自動確認。

いずれも本番のAPIルートに接続していない。Providerメタデータがすべて整っても、
DBの実接続検証・復元演習・権限確認・オーナー承認なしに公開可能とは判定しない。

## 2026-11-05追記：作品単位の非公開登録・編集

- `museum-exhibit-private-draft-stage.mjs` は作品の新規登録と**非公開の下書き限定**編集を実装した未接続モジュール。現行の公開作品や保管作品は編集不可。
- `museum-exhibit-owner-save-stage.mjs` は既存の管理者Cookie・承認済み端末を再利用する接続候補。既存Origin制限は拡張していない。
- `db/museum-exhibit-draft-operations-stage.sql` は、操作ID・認証主体・内容ハッシュ・作品ID・保存版数を記録する**未適用の新規候補テーブル**。
- 従って不足テーブルは当初の4件にこの新テーブルを加えた**5件**。接続前の在庫検査は5件を必須とし、未適用なら接続禁止。
- 二重送信、確認応答が失われた場合、版数競合、権限のない端末、権利確認が未完了な状態を隔離テストで確認済み。
- **実DBへのDDL適用・保存・ファイルアップロード・公開は未実施**。本番データ・GAS・既存環境変数の変更なし。
