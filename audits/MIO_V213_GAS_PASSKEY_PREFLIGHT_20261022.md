# MIO v2.1.3 — GAS本人照合とパスキー登録の接続（開発用）

実施日: 2026-10-22
GitHub Actions: https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/39731547030
対象ブランチ: feature/mio-ip-five-history-20261021
本番URL / main / GAS / Google Sheets / Vercel設定: **変更なし**

## 今回追加した実装
- participant-gas-identity-preflight-v212.js
  - 署名付き mio_session Cookie を検証。Web ID とトークンハッシュで既存GASの status API に読み取り照会。
  - 戻り値で参加者ID一致、承認済み、正式MIO-ID、identityLinked=true、attendanceLinked=true、deviceActive=true をすべて要求。欠落・不一致なら失敗。
  - 名前・IP・User-Agent・短いログインIDの一致を本人証明に転用しない。
  - 端末自体の有効性はGASが確認して返すことを前提とする（現行v12は証明項目不足）。
- participant-gas-passkey-entry-v213.js
  - v212の信頼済みGAS身元照会結果をv211のパスキー登録処理に接続。
  - 端末照合（v210）と、別途新しい強い本人確認 proof を要求する設計。
  - WebAuthnチャレンジ・鍵保存は既存のv204コアを利用。
  - 公開HTTP APIからは参照されない。

## 検証結果
- 新規テスト: v212 12件、v213 9件。
- これまでの確認済みテストを含む最新ワークフローは以下の構成:
  - Nodeユニットテスト84件合格 / 失敗0
  - 実SimpleWebAuthn署名テスト9件合格 / 失敗0
  - 一時PostgreSQL統合テスト17件合格 / 失敗0
  - **合計110件合格 / 失敗0**
- 初回ワークフローでv213モジュールの静的インポートに対して必要な npm 依存ライブラリがインストールされておらず失敗。ジョブにnpm installを追加し、再実行で全ジョブ成功。

## 本番投入を止める重要条件
1. **GAS本番v12のstatus応答には identityLinked / attendanceLinked / deviceActive の保証付きフィールドがない。** v212はこのため現行本番では必ず認証拒否する。誤って公開可にはならない。
2. v211はパスキー作成beginとfinishでそれぞれ新しいstep-up本人確認を要求するため、現状は一度の確認だけで完成できない。本人確認を安全に持ち越す一時証明は未実装。
3. 実GASの登録・端末承認・回復トリガーの差分が未照合。GASがサーバー照合済みの各フィールドを実際に返すようになるまでは実稼働させない。
4. verifyStepUpの本物の使い捨て本人証明とブラウザCookie失効同期は未配線。CIの成功テストはモックに依存する部分がある。
5. Face ID/Android実機のパスキー登録・認証・復旧は未実施。
6. この実装は既存MIO-IDと参加者データを自動統合・書換えするものではない。正式の本人確認と管理者の安全な照合が必要。

**公開・マージ・GAS初期化・デプロイ変更は一切していない。**
