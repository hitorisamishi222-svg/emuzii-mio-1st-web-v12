# みおシステム 2026-10-21 皆勤連携・再開時点の安全監査

## 読み取り確認
- 本番 main の `api-register.js` は `MIO_REGISTRATION_RELEASE=verified-gas-identity-20261016` がない限り登録書込を拒否する。
- main の `api-enroll-lite.js` は `MIO_LIGHT_REGISTRATION_OPEN=enabled` がない限り受付しない。別の Neon 登録データベースを利用する設計であり、既存GAS台帳に自動同期する保証はない。
- main の `api-activate-attendance.js` は `MIO_ATTENDANCE_ACTIVATION=verified` がない限り従来セッションを発行しない。
- `attendance-integration-proof.js` は Neon承認、GAS側本人ID一致、皆勤台帳証明の両方を要求する。
- `gas/README-attendance-proof-v202.md` は GAS補助処理を「未デプロイ」と記載している。
- 2026-10-19の `REGISTRATION_LIMITED_RELEASE_20261019.md` は現行GAS v12との完全照合が未了と明記している。

## ブロッカー
1. **本番GAS Code.gsと全補助ファイルの最新版を読み取り専用で取得**。貼り付けの v1.9.1 はバイト単位で現行デプロイv12と一致すると未確認。
2. GASの status応答が本当に `integratedParticipantId`、`attendanceLinked` を正しい本人認証の後に返すか検証。
3. 管理者承認後の Neon→GAS の本人ID・認証ハッシュ同期経路が存在するか検証。**承認済みフラグのみを立てても同期できたとは見なさない**。
4. 既存データの保護、旧端末、同名申請、孤立行、皆勤31日、ガチャの回帰テスト。
5. 上記を満たすまで登録受付と皆勤連携のリリーススイッチは変更しない。

## 禁止
- `setup()` 実行、既存シート全件更新、GAS全面上書き、既存本番URL変更。
- 名前だけで旧MIO-IDを接続、既存承認データを推測で変更。
- モック合格を本番GAS実通信合格と表現する。

この文書は開発ブランチの調査記録であり、本番変更ではない。
