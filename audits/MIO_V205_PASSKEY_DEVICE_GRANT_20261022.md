# MIO v2.0.5: パスキー認証と端末操作の接続 — 2026-10-22

状態: **開発ブランチのみ。GitHub Actions 模擬テスト成功。本番未適用。**

## 今回追加
- `participant-passkey-core-v204.js` に、WebAuthn認証成功後・チャレンジ消費後、同じDBトランザクション内で内部処理を呼ぶ `context.onVerified` を追加。
- `participant-verified-operation-v205.js` で90秒有効なランダムな操作許可を発行。DBにはSHA-256ハッシュのみを保存し、MIO-ID、操作ブラウザID、ブラウザトークンハッシュ、操作種別、対象ブラウザIDへ固定。
- 許可消費は `UPDATE ... WHERE consumed_at IS NULL AND expires_at>now() RETURNING ...` により一度きり。再利用、異なるMIO-ID/ブラウザ/操作/対象を拒否。
- `participant-device-store-v204.js` で検証コールバックへ対象ブラウザIDを渡すようにし、操作対象も許可と照合。
- `db/mio-verified-operation-grants-v205.sql` と `tests/participant-verified-operation-v205.test.mjs` を追加。
- GitHub Actions run 39653642308: 38件の模擬ユニットテスト成功。実DB/実WebAuthn/端末/GASとの統合テストは未実施。

## 本番接続前の重大な残件
1. `onVerified` と `issueVerifiedOperationGrant` を結ぶ**サーバー専用オーケストレーター**は未配線。発行された許可をブラウザへ返してはならない。発行から端末操作までサーバー内部で完結させる。
2. HTTPから `verifyBootstrap` / `verifyOwnership` / `onVerified` を受け取らない。これらはサーバー内部で固定する。
3. 実PostgresのDDL適用、同時アクセス・期限切れ・トランザクション失敗時の試験が必要。現在の模擬DBはDB固有の動作を保証しない。
4. WebAuthnは実ブラウザでRP ID/Origin、UV、カウンタ、パスキー同期時の挙動を検証する。
5. GASの本番デプロイv12と編集ソース・実トリガーは未照合。端末失効をGASに反映できない限り「旧端末停止完了」とは扱わない。
6. 本番公開には管理者の明示的な判断と、既存皆勤・ガチャ・当選・フォーム・ギャラリーの退行テストが必要。

本番のmain、GAS、Vercel、既存登録情報には一切変更を加えていない。
