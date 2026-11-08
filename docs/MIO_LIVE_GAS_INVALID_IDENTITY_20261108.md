# みおWeb管理 接続不具合・本番ログから原因を絞り込む（2026-11-08）

## 検証済みの現象
- Vercel **既存本番** `main` の `/api/gacha-admin-ops` に対する `read` が、2026-11-08 05:23:18.556 / 05:23:24.971 / 05:23:41.100 UTC の3件で失敗（JST 14:23頃）。
- サーバーログは3件とも `gacha web admin ops failure read invalid identity`。**ID・氏名・トークン・管理者コード・秘密鍵は転記しない**。
- Vercelの `APPS_SCRIPT_URL` に含まれるデプロイIDは、既存の安全な指紋検査 `tools/mio-gas-connection-target-audit.mjs` で照合済み。これはデプロイの同一性のみで、コード版が正しい証明ではない。
- 本番で `BRIDGE_SECRET` が不一致なら候補ソースでは `unauthorized` を返す。今回の `invalid identity` は、既存のWeb参加者用 `participantId/tokenHash` 検証へ `webAdminOpsRead` が誤って進んだ場合に再現する。
- 既存本番GASの公開版 `versionNumber` と実行中ソースは**未取得**。上記の挙動は管理用分岐が公開コードにない・不足している可能性が高いが、公開版コードを確認するまで断定しない。

## 再現テスト（開発データのみ、外部操作なし）
- `tests/mio-gas-live-invalid-identity-repro.test.mjs` は合成 `BRIDGE_SECRET` とインメモリの `doPost` 環境だけを使う。
- 開発候補 `GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs` は、(1)既存 `BRIDGE_SECRET` 検査 → (2)`webAdminOps(?:Read|...)` の分岐 → (3)参加者の `participantId/tokenHash` ガードの順である。
- 分岐だけを**テスト内で取り除くと** `webAdminOpsRead` が `invalid identity` を返すこと、分岐を持つ候補なら `mioAdminOps_` に届くことを検証する。
- これによって **登録IDを再発行して直す問題ではない**ことが明確になる。既存IDと端末・過去履歴を保持する。

## 実際の修正作業の停止条件
1. **既存**Apps Scriptの稼働デプロイID・公開版番号・公開ソース・編集HEAD・全ファイルを読み取りで取得。新規プロジェクトやデプロイは作らない。
2. 公開版の `doPost` に対し、`BRIDGE_SECRET` 判定後、参加者の `invalid identity` ガードより**前**に `webAdminOpsRead` が安全に分岐しているか確認する。
3. 対応する `mioAdminOps_` 以下の必要関数が**一式存在するか**も数え、既存定義があるものは**二重に追加しない**。旧コード全体の置換は禁止。
4. 稼働版ソースと復元手段が確保でき、かつ明示承認された場合だけ、既存Scriptの必要差分を審査して同じデプロイの更新を検討する。
5. 公開更新が許可・適用された後、**最初は `webAdminOpsRead` だけ**本番の認証済み管理画面から確認。監査タブ `emuzii_Web管理操作履歴` と付与履歴J1は明示許可までは変更しない。
6. `schemaReady` と台帳・操作IDの整合が確実になるまで承認/付与などの**本番書込フラグはOFF**。
7. まーくん/サスケを含む既存の確認済みID・端末・皆勤・抽選・付与履歴は移行の対象外。

## 画面確認
- 開発版の `gacha-web-gate.html` では、非本番の `VERCEL_ENV` によって管理APIが503になるため、接続できないことを明示する。
- `gacha-admin-preview.html` を開けば **架空データのみ**で4画面を表示・切替・検索可能。管理者コード入力や外部API/保存は一切行わない。これは**本番接続完了を意味しない**。
- 具体的な本番修正待ち作業は Issue #66 / Draft PR #87 に集約する。

## 2026-11-08 追加：現物ソースを受け取った後の自動停止ゲート
- `tools/mio-gas-operator-dispatch-preflight.mjs` を追加。**読み取り専用**で、Apps Script APIから取得したSERVER_JS全ファイルの関数名・重複・認証/管理ディスパッチの位置を調べる。APIへのアクセス・編集・公開・コード全文のログ出力はしない。
- 候補の管理モジュールには `mioAdminOps_` を含めて **21関数**ある（以前の資料にある「19関数」は古い候補の数字）。ただしこの静的検査は重要なハンドラ8個の存在を最低条件とするもので、残りの補助関数を含めた完全な実装確認は別途必要。
- 既存GASに同名の `doPost`・管理ハンドラが重複している場合、管理分岐が見つからない場合、既存の認証順序が異なる場合は **STOP**。自動挿入・全文置換はしない。
- `tests/mio-gas-operator-dispatch-preflight.test.mjs` で既存候補・分岐欠落・重複・認証欠落・ソース漏えいをテスト。合格しても**公開の許可は出さない**。

## 2026-11-08 追補：コメント誤認・共通ヘルパー欠落の防止
- 開発ブランチの読取専用 `mio-gas-operator-dispatch-preflight.mjs` を強化。コメント中の `function doPost` や管理関数名を実装として誤集計しない。コメントに残った旧ディスパッチを現行ルートと誤認しない。
- 管理モジュールの21関数とは別に、既存10月GASの共通依存 `json_`、`equal_`、`safeText_`、`webIntegrityOk_`、`ensureWebDerivedRow_` も定義と重複を検査する。欠落時は `SHARED_HELPERS_MISSING_NO_AUTOPATCH` でSTOPし、自動修復しない。
- 正常な候補、欠落した依存、コメント内の偽関数、実際の重複関数の回帰試験を追加。本番GASの実ソース照合や管理Readが成功したことを意味しない。
- 監査結果は常に `publicationAllowed:false`、`patchAllowed:false`。既存のGAS・Vercel本番・台帳を変更しない。


## 2026-11-08 夜：ScriptLock 実行順序も公開前の停止条件に追加
- GASの管理分岐が既存の `LockService.getScriptLock()` → `tryLock(...)` による取得成功後、`BRIDGE_SECRET` 検証後、参加者ID判定前にあることを読取専用で検査。
- `try { ... } finally { lock.releaseLock(); }` が不足・順序異常なら `SCRIPT_LOCK_GUARD_MISSING_OR_MISPLACED` でSTOP。複数現場操作時の競合を見落として本番反映しない。
- ロック取得なし・成功判定なし・解放なしの合成故障ケースを自動テストへ追加。実GASへの書込・公開操作なし。公開版ソースを取得できていない点は未解決。
