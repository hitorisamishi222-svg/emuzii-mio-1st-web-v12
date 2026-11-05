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

## 2026-11-05追記：スマホ管理画面と非公開DB保存の項目整合

- 発見した不整合：フォームは「展示室」と「作品の種類」を別々に指定するのに、旧保存候補SQLでは `kind`（展示室）のみ保存し、公開読取時に種類を展示室から推測していた。
- 修正した未適用DB定義：`museum_public_exhibits.kind` は4つの展示室、`museum_public_exhibits.category` は5つの作品種類を別々に保存。**既存DBにこの列を追加した事実はない**。
- `museum-exhibit-ui-contract-stage.mjs` は管理画面の7入力項目（`room,category,title,description,credit,occurredOn,externalUrl`）だけを厳格に受け取り、`kind` と `category` を別々にして非公開保存処理へ渡す。画像のアップロード先・公開状態・権利承認情報は画面入力から受け取らない。
- `museum-exhibit-owner-save-stage.mjs` は、従来のサーバー用 `draft` と新しい `uiDraft` の両方を同時に受け取ることを禁止。保存時の本人・承認端末の確認、操作ID、版数、未確認DBへの拒否はそのまま。
- `museum-gallery-source-stage.mjs` は種類を展示室から捏造せず、必須の `category` を検証した上で、現行の権利確認世代ハッシュにも含める。
- スキーマ検査は `category` の実在・必須性・型、およびDBに登録された5種類限定の検証済みCHECK制約を要求する。未適用・不完全なら合格不可。
- すべて**非公開開発ブランチ内の候補変更**で、VercelのDB環境変数の変更、NeonのDDL適用、作品アップロード、管理画面からの本番保存は実施していない。既存の本番URL・皆勤・ガチャ・当選・参加者記録は不変。
 
## 2026-11-05追記：作品保存の操作履歴・二重登録防止の検証

- 隔離Neonブランチ `gallery-admin-isolated`（`br-bold-credit-b7y6frdo`）を**読み取り専用**で再確認。14テーブルが存在する一方、記念館専用5テーブルはまだ存在しない。スナップショット一覧は0件（これだけでPITRの有無を断定しない）。**バックアップからの復元演習は未実施**。
- `museum-gallery-release-schema-stage.mjs` が作品操作履歴 `museum_exhibit_draft_operations_stage` の実DB列の存在・型・NULL制限をチェックするよう追加。
- さらに、操作ID主キー、作品IDと版数の一意制約、オーナーと作品の外部キー、`create/edit` に限る操作種別、操作IDとハッシュの厳密な形式、非負版数の**実DB検証済み制約**を必須にした。テーブル名だけの存在では合格しない。
- `museum-gallery-schema-inspect-stage.mjs` もこの検査を `schemaReady` の条件に追加。未完了の場合は保存の準備完了と判定しない。
- 非公開保存時の操作履歴 `recorded_at` はSQL側の `now()` を明示し、クライアント時刻やDB列のデフォルト値への依存を減らした。
- 今回の修正は開発用の未接続モジュールと候補SQLに限る。実DBのDDL、環境変数、認証方式、公開API、GAS、本番URL、皆勤、ガチャ、当選、参加者記録は変更しない。
- 実接続の前提：隔離ブランチへの専用資格情報と実体照合、バックアップ復元実証、5テーブルの移行と実DB制約確認、Preview専用認証設計、オーナー承認が揃っていること。

## 2026-11-05追記：無料Neonの復元手段（未実施）

- Neonの現在のプロジェクトメタデータを読み取り確認：`subscription_type=free_v3`、`history_retention_seconds=21600`（**6時間**）、隔離ブランチ `br-bold-credit-b7y6frdo` は `ready`、自動snapshotスケジュールは空。
- 公式情報：Neon Freeは6時間のInstant Restore履歴を利用可能（https://neon.com/blog/neon-free-plan-1-gb-per-project、2026-10-02）。**履歴が存在するだけでは復元成功の証拠ではない**。
- `museum-neon-recovery-route-stage.mjs` を追加。隔離ブランチと親ブランチのプロジェクトID・親子関係・稼働状態を照合し、スナップショットがなくても6時間PITRを**復元方法の候補**として検出する。メタデータが不正、分岐先が本番、保持時間が不足なら候補から除外する。
- `museum-provider-readiness-stage.mjs` のメタデータチェックを `recovery_route_inventory_present` に変更。FreeでもPITRの候補を扱えるが、`restorationDrillVerified=false`、`canConnect/canMigrate/canWrite/canDeploy=false` を維持し、本番保護を弱めない。
- 実際の復元演習は、元の隔離ブランチを上書きせず、期限内の記録を復元した**別の一時ブランチ**でテーブル構成と整合性を比較する必要がある。既存の14テーブルに管理者・会員関連のデータが含まれるため、値をログに出さず検証する。
- Freeの短期PITRは長期の独立バックアップの代替にはならない。本番運用前に、6時間以上の障害を想定した別手段の復元証明も必要。
- **この追記時点ではスナップショット作成、一時復元ブランチ作成、実DBの書き換え、プラン変更・課金、既存データの取り出しは行っていない。**

## 2026-11-05追記：復元先との非破壊照合／今回の未解決事項

- Neon Freeプロジェクトの現在の表示は **6ブランチ／上限10**（稼働2、アーカイブ4）。短期PITR履歴は6時間、スナップショット0、自動スケジュールなし。作成・変更・削除は実施していない。
- 提供されているNeon連携の `create_branch` は親の現在HEADからコピーする仕様で、**過去時刻からの復元操作ではない**。提供の `restore_snapshot` には実在のスナップショットIDが必要で、現状は0件。過去時刻からの復元を、この2アクションだけで実行・合格扱いにするのは禁止。
- `museum-neon-restore-compare-stage.mjs` を追加。別途本物の復元先が確認できた場合に限り、元ブランチと復元先の**別々のPGクライアント**を渡し、双方で `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` を使用して、公開スキーマ／制約／既知の14既存テーブルの**件数一致のみ**を比較する。データ行・件数の実値・ホスト／秘密情報は返さない。
- 別ブランチ・別接続・非primary・同じプロジェクトであることを先に確認し、危険なIDや不完全な応答は拒否する。入力で指定されたテーブル名をSQLに埋め込まず、固定の14テーブルだけを件数検査する。
- **構造と件数の一致だけでは、完全なデータ同一性やNeonによる復元の実施を証明しない**。この照合機能は常に `restorationProvenanceVerified=false`、`fullDataIntegrityVerified=false`、`restorationDrillVerified=false` とし、公開・DB移行・書き込み権限を与えない。独立の履歴証跡／復元検証と本番許可が後で必要。
- 復元比較テストは既存の `mio-mainbased-museum-staging.yml` に**独立ジョブ**として追加（外部接続ゼロ）。既存の全体CIが別の理由で停止しても、検証部分だけは別に合否を追える。
- 注意：2026-11-05T09:02:39Z に `main` へガチャ管理画面更新（`84c623de`）が追加され、記念館のDraft PR #76のベースと差が生じている。特設の開発ブランチにも管理・GASガイド関連の既存差分があるため、**無条件でmainをコピー／マージしない**。差分照合と両方の安全テストが必要。今回production mainへの更新・記念館PRのマージは行わない。

## 2026-11-05追記：本番 main の管理センター更新との安全な整合検査

- `main` の最新観測コミット `84c623de9961a801f30b978bda8b8bea7a0daf4e` は、記念館開発開始時の `bb4a39a29e6c5c3ae70b6c35cf290feb8cb67a6b` より新しい。ガチャ管理センター・GAS設置ガイド・管理関係テストなど**正確に9ファイル**の変更を確認した。
- `tests/fixtures/mio-observed-main-gacha-operator-20261105.json` に、最新 `main` のコミットと9ファイルのGit blob SHAのみを記録。個人データ、パスワード、秘密環境変数は保存しない。
- `tests/mio-mainbased-museum-integration.test.mjs` の旧「mainが一切進んではいけない」という停止条件を、**既知の変更だけ検証可能**な条件へ更新。GitHub Actionsが取得した `origin/main` が元のベースか、上記の完全一致コミットであることを検査する。さらに当該9ファイルのblobを検査し、ID・チェックイン・ガチャAPI・配信メディアなど従来の**保護対象ファイルを最新mainと照合**する。
- これによって既知のガチャ管理UI更新だけで記念館の開発CIが止まり続ける問題を解消するが、**マージ可能・本番反映済み・管理者書き込み可能の証明ではない**。
- 競合候補は `gacha-web-gate.html`（新mainの運営UIと記念館の停止中模擬管理センター）と `docs/MIO_GAS_FULL_REPLACE_SETUP.md`（双方とも全文貼り替え禁止だが内容が異なる）。競合部分を無条件で片方へ置き換えず、今は機能ブランチに残す。
- 記念館Previewで `gacha-admin-ops.js` を無確認で読み込まないこと、架空データのリハーサル画面を残すことを明示的に検査する。記念館・ガチャ管理UIの最終統合前に、実体ソース差分のレビューと管理センター回帰テストが必要。
- この作業は**開発ブランチの安全検査と証拠記録のみ**。GitHub `main`、本番GAS、参加者台帳、Neon DB、Vercel Production、本番URLを変更していない。PR #76はDraft・未マージを維持する。

## 2026-11-05追記：新main管理センターとの表示・設置ガイド統合（Preview限定）

- 新mainコミット `84c623de` で更新された `gacha-web-gate.html` の管理センターを、記念館の機能ブランチへ**元ソースの全内容を復元可能な形**で統合した。上書きではなく、記念館だけの追加をマーカー `MIO_MUSEUM_PREVIEW_LOCK_OPEN/CLOSE` と `MIO_MUSEUM_PREVIEW_CSP` で独立させ、元に戻したときのGit blob SHAが最新mainの実際のblobと一致することをテストする。
- 新mainの `gacha-admin-ops.js` は**バイト同一**で機能ブランチへ取得。ただし記念館Previewでは脚本を**読み込まない**。新mainの管理センター入力全体を `<fieldset disabled>` に閉じ込め、さらにブラウザの `Content-Security-Policy: connect-src 'none'; form-action 'none'` を**PreviewのHTML metaに設定**し、旧ガチャON/OFFの実API通信も遮断する。**本番の管理画面には適用していない。**
- 記念館側の架空データリハーサル（`/mio-admin-rehearsal.html`）、端末内GASソース照合、旧障害・復旧状況の未接続表示は引き続き使用可能。既存のGASや参加者記録は一切取得・書き換えない。
- `docs/MIO_GAS_FULL_REPLACE_SETUP.md` は新mainの「旧全文貼り替え手順は廃止・実行禁止」を基準に、記念館Previewの保護条件と既存同一プロジェクト・デプロイ・URL維持を追記。稼働中の`Code.gs`、`doPost` の実ソース照合や承認を飛ばしてGASを変更することは禁止。
- 以前の模擬画面構造だけを検査したテストは、新管理センターの構造・機能停止・ガイドリンク・現行mainソースへの可逆性に更新。スマホ幅320/375/390/430pxの実Chromiumで、**CSPが旧管理APIへのPOSTをブロックすること**も検証した。
- この統合は**機能ブランチ内でのソース互換化**であり、PR #76のGit履歴上の競合解消・マージ・本番更新を意味しない。今後の安全な履歴統合には、2026-11-05のmain更新9ファイル全体の親子関係と管理センター関連テストを改めて確認する必要がある。現在はDraft PRのまま停止。
