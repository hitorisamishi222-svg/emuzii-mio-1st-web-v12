# MIO v2.1.6 パスキー初回登録の本人確認継続性

対象: feature/mio-ip-five-history-20261021
日時: 2026-10-22 (JST)
GitHub Actions run: https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/39766954778
本番 main / GAS / Sheet / Vercel / 参加者データ: **未変更**

## 実装
- participant-registration-continuity-v214.js: v210のstep-up後の本人確認記録を登録チャレンジのハッシュ、MIO-ID、ブラウザID、トークンハッシュに紐付け。チャレンジの既存の3分有効期限と一回限りの消費条件を利用する。
- db/mio-passkey-bootstrap-continuity-v215.sql: v204チャレンジ台帳へのbootstrap_verified_at、bootstrap_browser_id、bootstrap_methodの追加DDL。CIの一時PostgreSQLのみ適用、本番未適用。
- participant-passkey-registration-continuous-v215.js: begin()で本人確認step-upを1回実行してチャレンジへ紐付け。finish()で改めてサーバーセッションを解決し、同じ登録チャレンジ・端末・MIO-IDか確認したうえでv204のWebAuthn署名検証と単回消費に進む。
- participant-gas-passkey-continuous-v216.js: GASのサーバー署名付きセッションと強い本人確認を使ってv215登録処理へ接続。v212の強い身元照合フィールドが無い現行GASでは認証拒否。
- tests/participant-postgres-integration-v207.test.mjs: 実PostgreSQLでの継続登録正常系、端末変更/チャレンジ不一致の否定系、GAS照合成功/不足の確認を5件追加。

## テスト
- CI run 39766954778：ユニット84件、実WebAuthn署名9件、実PostgreSQL統合22件、合計115件成功／失敗0件。
- ただし、WebAuthn初回登録の暗号検証はv207の追加シナリオではモック。v208の9件は実ECDSA認証アサーションに関する署名検証であり、実端末のパスキー初回登録検証ではない。

## リスクと公開前のゲート
1. v214のcontinuity.verifyは同一チャレンジ状態の読み取り判定であり、真正なWebAuthn応答を検証するのはv204側。両工程を離して公開してはいけない。
2. v215ではbeginのチャレンジ書込みとbootstrap stageが別トランザクション。stage失敗時に未承認チャレンジが残る可能性があるが、v214照合では拒否され、期限内に無効となる。定期クリーンアップが未実装。
3. 本番GAS v12はv212が必須とするidentityLinked/attendanceLinked/deviceActiveを明示返却しない。現在のGASには未対応のため本番投入できない。
4. verifyStepUpの真正な一回限りの証明、ブラウザ停止時のCookie失効同期、実iOS/Android WebAuthn、初回本人回復手順、実本番での復旧試験は未完了。
5. IPと名前の一致は強い本人証明に含めない。
6. mainへのマージ、GASスクリプト編集・初期化・公開、Vercelデプロイ・フラグ変更は行っていない。

次工程: 初回登録の実WebAuthn attestation検証ベクトル、権限失効の同期、本番GAS公開コード/編集コードの読み取り照合。
