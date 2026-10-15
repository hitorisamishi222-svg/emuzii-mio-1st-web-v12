# 残件テスト結果 — 2026-10-15

対象ブランチ: release/v2-next-integrated-replica
検証済み画面コード: 70dd483a678bad44c8d4bc3a9d2f8b35aea7918c
main / 本番サイト / GAS / 実参加者データは変更していない。

## 合格済み結果を引き継ぐこと

変更の影響を受けない合格項目を、残件確認のためだけに再実行しない。
今回の判定は次の既存合格ログと修正後の限定確認を組み合わせている。
ワークフロー remaining-browser-tests.yml の MIO_BROWSER_CASES は今回の修正影響範囲を指定している。今後変更した画面がある場合は、その変更範囲に合わせて選択を更新する。

| 区分 | 件数 | 実行結果 |
| --- | --- | --- |
| 既存CIから漏れていた認証・端末・APIアダプター等の単体/モックテスト | 78/78 | [Actions 38721817976](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38721817976) |
| 一時PostgreSQL 16の実DBテスト | 14/14 | [同じActionsのisolated-postgres-tests](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38721817976) |
| Chromium/WebKitのスマホ幅・表示・遷移検証 | 152/152の最終判定 | 下記の基準結果と影響範囲の再検証を組み合わせる |

## 実DB検証の範囲

GitHub Actions内で一時起動・終了するPostgreSQLを使用。接続先は127.0.0.1 / mio_ci_test / mio_testに限定し、テストコードでも検証する。
4本のSQLを実行し、再適用、MIO-ID/ログインIDの同一アカウント解決、登録/ID変更の競合、旧ID予約、セッションの個別失効/期限切れ/全失効、16件の同一キー要求、20件の別キー要求、ガチャ失敗時のロールバック、next_testの識別子制約・履歴保持・RLS拒否を確認した。
実DBに対して既存PostgreSQLアダプターを実行したが、公開中のHTTP APIとの接続試験を意味しない。永続DB契約・外部DB・本番の資格情報は使用していない。

## スマホ幅検証の範囲と再実行履歴

- ChromiumとWebKit、それぞれ320/375/390/430px。
- 18画面と統合iframeのメニュー遷移4幅、計76件/エンジン。
- 本番への外部通信を遮断したローカル静的プレビューで、JavaScript例外・横はみ出し・背景画像読み込み・iframe内タップ遷移を検証。iPhone/Android実機ではない。
- 基準結果: [Actions 38722473892](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38722473892) は各エンジン72合格/4不合格。不合格はトップHTMLへのツール警告文字列混入。
- 影響のない52件/エンジン、計104件はこの合格結果を引き継いだ。
- 警告文除去と局所的な文字背景の変更後、影響のある24件/エンジンだけを再確認した。
- 最終確認: [Actions 38723754827](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38723754827) で24/24 + 24/24合格。初期自動スクロール防止と見出し2行収容も確認。
- スクリーンショットとresults.jsonは各ブラウザージョブのArtifactに保存（7日保持）。390pxの実画像も確認した。

## 修正したもの

- トップHTML先頭の「Warning: truncated output」「Total output lines」を除去。
- 背景クラスをトップHTMLの初期状態から付け、後からの余白追加による初期スクロールを防止。
- 明るい背景は維持し、お知らせ/配信予定等の文字背面だけ濃色を追加。見出しの不自然な折り返しを調整。
- npm test が security/*.test.mjs を対象から漏らしていた設定を修正。今回、全合格スイートの再実行はしていない。
- 既存のv2テスト8件は再実行していない。ブランチpushで自動起動する既存安全ゲートの実行は、その仕組みのまま維持した。

## 未完了・実行条件

1. 公開TEST認証APIとブラウザー画面を接続したHTTP/E2E: APIの公開接続が未実装。静的Vercelプレビューだけでは完了できない。
2. パスキー登録/署名検証/失効/紛失復旧: WebAuthnサーバー処理が未実装。対応判定だけを登録成功扱いしない。
3. iPhone Safari/Android Chromeの実機と、Apple/Googleパスワードマネージャー保存・自動入力: 今回のCIエミュレーションとは別に実機で行う。
4. 永続ストアを使うレート制限・負荷・再起動後の保存: 一時DBテストは永続の運用サーバー検証の代用にしない。

開発プレビュー（検証コード70dd483）:
https://emuzii-mio-1st-web-v12-cg5ji46j3-gtgz8867jh-3139.vercel.app/home-portrait-next.html
Vercel READY、ホームHTTP200と警告文除去・初期背景クラスを確認済み。
