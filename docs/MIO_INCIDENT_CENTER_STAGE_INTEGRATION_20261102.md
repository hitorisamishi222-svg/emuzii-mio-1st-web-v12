# 翠央1周年大型アップデート｜障害センター統合・第1段階（2026-11-02）

## 統合対象
- 管理センター開発Draft PR #74 `feature/mio-admin-center-phase1`から、**既存の`mio-incident-core.js`を同一Git blobで選択移植**。障害の分類、HMACによる同一抽選の重複記録防止、監査付き状態変更（未対応→対応中→解決）、同一操作IDの再実行拒否・冪等化を保存。
- 既存PostgreSQLの「将来の障害監査専用」スキーマ候補 `db/mio-admin-incidents-20261031.sql` も、元と同一の**未実行資料**としてコピー。**実際のDBには一切適用していない。**
- `gacha-web-gate.html`の統合準備中パネル内に、障害未対応・対応中・解決の3区分と一覧の表示欄を用意。**常に「未接続」と表示**し、一覧取得ボタンは`disabled`。管理者/参加者データ・Web-ID・当選結果・抽選IDを実表示しない。

## 「動作しない状態」で安全に残すもの
1. 既存`vercel.json`に`/api/mio-incidents`、`/api/mio-incident-report`、`/api/mio-gacha-result-lookup`の**実サーバールートは追加しない**。
2. 記録用`mio-incident-recorder.js`、DB接続、現在の`api-gacha.js`/ `api-status.js`からの自動通報は**未統合**。元の登録・ガチャ・履歴復旧・GASはそのまま。
3. SQLファイルは**マイグレーションではなく設計候補**。既存Neon/別DBの正本確認、バックアップ・権限・スキーマレビューまで実行しない。現在の接続済みNeonに同名テーブルが見えないことは、正本DBであると証明したわけではない。
4. **Cookie・認証ハッシュ・氏名・管理コードを障害イベントに収集しない**。開発コードは公開済みの形式のWeb-IDと抽選IDに限定してHMACで重複判定。
5. 結果が確定していない抽選に、新しい`drawId`を自動発行したり再抽選させたりしない。今後の本接続は**同じIDによる既存当選結果の読み取り照合を先に**検証してからにする。
6. `MIO_INCIDENT_CENTER_RELEASE`、`MIO_INCIDENT_RECORD_RELEASE`、`MIO_INCIDENT_WRITE_RELEASE`は**有効化しない**。統合コピーの新しい障害管理欄は機能OFF。

## 実装確認
- [ステージング障害管理テスト](../tests/mio-staged-incident-core.test.mjs)：既定OFF、入力の厳格検証、同一drawIdの重複判定と15分区切り、タイムアウト/未確定の区別、DBやガチャ実操作なし、監査付きの状態変更と同一操作IDの二重更新防止、認証されていない操作拒否、実APIルートなし。
- [全登録回帰CI 41368329601](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41368329601)：**213/213 PASS、0 FAIL**（前回204件から9件追加）。対象は新しい障害処理を含む静的・モック・登録回帰で、実DB/GAS/iPhoneの合格ではない。
- [Issue #66](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/issues/66)：既存稼働GASの全ソース・バージョン・復元可能なバックアップ、19同名関数衝突検査が未完。**管理操作書き込みはSTOP**。
- 既存`main`のVercel元97ビルド・31ルート・認証/ガチャ/皆勤/GASの重要20ファイルは元のまま維持。PR #76はDraft。

## 次の統合ゲート
- 正本DBの実体・テーブル権限・スキーマ差分・監査ログ独立性を確認し、まず既存管理者権限の**読み取りのみ**を実機確認。
- 実障害の段階/操作ID/drawIdの照合、再表示前の既存確定結果照合、二重抽選防止、Safari/LINE/Xのネットワーク復帰をテスト。
- 利用者の権利・既存復旧対象・ガチャ回数・当選履歴の前後一致を全回帰、切戻し、運営承認後にだけ1回の一括公開候補とする。

**この段階で本番URL、GAS、既存DB、スプレッドシート、参加者データ、景品、当選履歴はすべて無変更。**
