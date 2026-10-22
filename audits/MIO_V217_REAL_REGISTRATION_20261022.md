# MIO v2.1.7 — 初回パスキー登録の実暗号検証

日付: 2026-10-22
ブランチ: feature/mio-ip-five-history-20261021
GitHub Actions: https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/39786204536
本番 main/GAS/Google Sheets/Vercel: **変更なし**

## 今回の追加コード・テスト
- `tests/helpers/participant-registration-fixture-v217.mjs`: Node CryptoによるランダムなP-256鍵ペア、COSE公開鍵、CBOR WebAuthn認証器データ、ES256 packed self-attestationを持つ登録応答の生成。実ハードウェア認証器ではなく、テスト用のソフトウェア認証器。
- `tests/participant-real-registration-v217.test.mjs`: `@simplewebauthn/server` を使い、WebAuthnの登録応答11件を検証。正常な `none` attestation・ES256 `packed` self-attestation、署名破損、他の秘密鍵による署名、Origin不一致、RP ID不一致、UP/UV不一致、チャレンジ不一致、操作種別不一致、登録応答ID不一致。
- `participant-webauthn-server-v208.js`: ライブラリだけでは登録応答の `id/rawId` と認証器内部の credential ID の不一致を拒否しないケースが発覚。Base64URL形式と3つのID一致を明示検証して `verified:false` を返すよう改善。ギャラリー管理者用の認証には未変更。
- `tests/participant-postgres-integration-v207.test.mjs`: 実PostgreSQL上で、v215継続登録＋本物のWebAuthn登録暗号検証＋公開鍵保存を一括検証。不正なself-attestation署名・登録ID不一致のケースは保存を拒否し、失敗時にチャレンジを消費しないことを試験。

## 結果
GitHub Actions run 39786204536 は `unit-tests` と `postgres-integration` ともに success。
- 既存単体テスト84件合格
- WebAuthn認証アサーションの暗号検証9件合格
- 新規WebAuthn初回登録の検証11件合格
- 実PostgreSQL統合テスト25件合格
- **合計129件合格、0件失敗**

## 留意事項
- `none` attestationに自己署名はない。ここで検証できるのはRP ID、Origin、UP/UVフラグ、challenge、credential ID等。暗号署名の検証はES256 packed self-attestationのケース。
- 物理的なiPhone/Androidパスキー、生体認証、端末移行、OS間同期の実機試験は未実施。
- 初回GAS照合の真実性はGAS実装に依存。現行のv12 `status` は v212 の明示的な `identityLinked` / `attendanceLinked` / `deviceActive` を返す保証がなく、この開発用経路は現行GASに対して安全停止する。
- 本番GASのread-only照合、トリガー確認、本物のfresh step-up証明、端末/パスキー失効の同期、期限切れレコード掃除、CSRF/レート制限、実機試験が残る。
- 参加者データ、皆勤、ガチャ、当選、FA、管理設定、公開URL、GASスクリプトは変更していない。

次工程: 本番GASの公開版と編集版の照合、本人証明を返す読み取り専用の連携実装・テスト、および実機検証の手順。
