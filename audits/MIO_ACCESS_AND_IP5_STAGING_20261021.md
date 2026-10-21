# MIO 緊急公開・認証境界・IP5件制御 2026-10-21

対象: GitHub main のコード読み取り。Vercel本番の環境変数、現在の公開デプロイSHA、GAS公開v12との完全一致は未確認。

## 現行APIのアクセス構造
| 処理 | ファイル | 現在のソースでの動作 |
| --- | --- | --- |
| 簡易新規登録 | api-enroll-lite.js | MIO_LIGHT_REGISTRATION_OPEN=enabled が必要。専用Postgresへ未承認で保存。従来GASの皆勤・ガチャ権限は付与しない |
| 登録後案内 | join.html | Googleフォーム2件、ギャラリーへのリンクは**登録前にも表示**。登録者限定のリンク制御ではない |
| ギャラリー閲覧 | api-gallery-items.js | 公開GET。既存のモデレーションDBに照会して作品の非表示/削除を反映。MIO-ID認証は要求しない |
| ギャラリー管理 | api-gallery-manage.js / api-gallery-moderate.js | 独立した管理者セッションと承認済み端末が必要。管理の開放スイッチあり |
| ギャラリー公開 | api-gallery-publish.js | 常時503で停止する安全措置がある |
| ギャラリーパスキー | api-gallery-passkey.js | **管理者専用**。参加者MIO-IDの本人確認として再利用禁止 |
| 旧登録 | api-register.js | GASデプロイ照合まで開放禁止の環境フラグあり |
| 皆勤への移行 | api-activate-attendance.js | 明示的スイッチ + 専用DB承認 + 既存GAS承認/ID一致の両方を要求 |
| 皆勤入力 | api-checkin.js | CookieとGAS照合。GAS checkinAction_ は承認済み、MIO-IDと名前の台帳一致が必要 |
| ガチャ | api-gacha.js | CookieとGAS照合。GAS gachaAction_ は承認済み/台帳一致/権利/管理スイッチを要求 |
| ブラウザ移行 | api-browser-pair-create.js / claim.js | スイッチで停止。GAS pair_create/pair_claim の公開対応は未検証 |
| IP観測 | registration-ip-audit-v202.js | HMAC化したIPを専用DBに記録する補助監査。既存実装は5件制限なし |

## 認証上の区別
- MIO-W-* はブラウザの識別番号。MIO-0001形式の参加者台帳IDではない。
- Cookieの署名検証はブラウザ資格情報の整合確認であり、名前・IPから本人確定はしない。
- ギャラリーのFace ID/パスキーは管理者向け実装。参加者の本人認証は別に実装する。
- 既存参加者の同名Web登録を自動で結び付けない。Web最大5件は認証済みの同一MIO-IDごとに管理する。未認証では合算しない。
- 緊急公開のフォーム/ギャラリー閲覧は継続する。ただし『登録後のみ許可』と『登録不要で公開』の要件差は公開判断前に確認する。

## IP5件の試作
新規 staging ブランチ feature/mio-ip-five-history-20261021 に、registration-ip-history-v203.js、db/mio-ip-recent-v203.sql、tests/ip-history-v203.test.mjs を追加した。
- IPアドレスは生値を保存せずHMAC化。
- 端末ブラウザIDごとに、現IP＋過去4種類までに制限し、トランザクションとアドバイザリロックを使用。
- 記録は30日TTL方針。非アクティブ端末の定期的な一括掃除は未実装。
- 隔離テスト6件成功（PostgreSQL実接続試験ではなくクエリ/模擬ストア試験）。
- **本番APIからの呼び出しは未接続であり、専用DBへのDDLは未適用**。既存のv202監査に変化なし。
- 5件制限は今は**ブラウザ単位**。MIO-ID単位の5件集約は強い本人確認・本人の紐付け後に行う。

## 次の実装の安全ゲート
1. Web登録の上限5件用スキーマと再認証済み端末追加/解除を用意する。
2. 参加者向けWebAuthnパスキーをギャラリー管理者DBとは独立して構築。
3. 対象利用者の所有権の証明ができたときだけMIO-IDを連携。
4. IPや名前など3件一致しても、それだけで承認しない。
5. staging DB移行と実DBテスト、GAS公開v12/トリガーの読み取り照合、旧機能退行テストが済むまで本番のフラグを変更しない。
