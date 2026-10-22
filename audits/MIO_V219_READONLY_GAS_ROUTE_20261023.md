# みおシステム v2.1.9 — 読み取り専用GAS本人照合API候補

実施：2026-10-23（JST）
開発ブランチ：`feature/mio-ip-five-history-20261021`
GitHub Actions：https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/39871473811

## 保存したファイル
- `APPS_SCRIPT_Code_v1.9.9_READONLY_IDENTITY_ATTESTATION_CANDIDATE.gs`：既存の**未配備**v1.9.6候補を基礎に、認証後の別アクション `identity_attestation` を追加したGAS候補（他の機能は同一コード）。`setup()` を実行してはいけない。
- `gas/mio-identity-attestation-v218.gs`：Web登録台帳・参加者台帳・皆勤台帳の明示的整合を判定する純粋関数。
- `participant-gas-identity-preflight-v212.js`：照会先を旧 `status` から新 `identity_attestation` に変更。これにより現行 `status` に存在する可能性がある書き込み/補完処理を通らない。現行GAS v12はこのアクション未対応のため、現状では安全拒否する。
- `tests/mio-gas-readonly-doPost-v219.test.mjs`：GAS候補をNode.jsのVMで実行し、秘密情報なし・Web ID不正・トークン違い・重複Web ID・未承認・旧端末・MIO不一致・皆勤不一致・入力偽装を拒否すること、成功時の応答が必要情報だけであること、**台帳書き込みが起きないこと**をチェック。
- v212/v213/v207テスト：GASアクション変更に伴う期待値を更新。

## 自動テスト
GitHub Actions run 39871473811：全ジョブsuccess。
- GAS純粋関数テスト24件
- GAS doPost仮想連携テスト14件
- 既存のNode.jsユニット84件
- WebAuthn認証アサーション9件
- WebAuthn初回登録11件
- 一時PostgreSQL統合25件
- **合計167件成功／0件失敗**

テストはGitHub上の隔離環境で行った。本番GAS実行、端末実機、公開DBの実接続はまだ行っていない。

## 無変更と安全の根拠
- v1.9.6から取り込んだ元の登録・皆勤・ガチャ・表示ロジックは、候補に認証済み専用アクションと純粋関数を足した以外は同一であることを文字列比較テストで確認。
- `identity_attestation` では最初にBridge secret検証、Web IDとトークンハッシュの書式検証、Web台帳のWeb IDおよび認証ハッシュの厳密照合を行う。
- 取得した台帳の照合は読み取り関数だけを呼び、書込みAPIを呼ばない。GASモックで書込みAPIを呼ぶとテストが失敗する。
- 本番のAPI・URL・main・Apps Scriptデプロイ・Googleスプレッドシート・皆勤・ガチャ・当選・FA・端末履歴は変更していない。

## 公開前に必須の確認
1. このGAS候補は、実際の本番編集スクリプト全4ファイル、インストール済みトリガー、GAS公開デプロイv12を反映しているとは限らない。実際の本番を**読み取り専用**で照合して差分のない更新計画を作る。
2. `identityLinked` は台帳整合の証明で、本人の鍵所持を意味しない。初回パスキー登録にはサーバーで新規消費する別の**強い本人確認**が必要。
3. v218ではWeb登録台帳Q列の端末状態が `使用中` と明示されていないと拒否。未指定の既存端末がある可能性があり、**黙って一括変更しない**。現行データの状態分布を調査する。
4. 古い `status` は本人認証の根拠として使わず、専用アクションへの切替えが確認できるまで新機能を非公開に保つ。
5. 生体認証・端末紛失復旧・複数端末・レート制限・CSRF・IP保管期限の実機・実データベース試験とバックアップ/復旧手順が未完了。

本番の変更・デプロイは一切行っていない。
