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
| 実HTTP＋一時PostgreSQL 16の追加認証テスト | 12/12 | [Actions 38728516578](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38728516578) |
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

## 追加のHTTP接続検証

検証コミット: 6b0503ffad5e60b8cec859a1fb5281e7938c3367。
remaining-http-tests.yml の isolated-http-tests は12/12合格、ジョブ116400205653、失敗0。
既存78件・実DB14件・ブラウザー152件は今回再実行していない。既存のpush安全ゲートは自動実行のまま。

release-prep/test-auth-http-server.mjs はCI専用で、127.0.0.1のランダムポートだけを待ち受ける。
CI=true、接続URL、実DB名/ユーザー/スキーマ mio_http_ci を確認し、条件外では起動しない。
CI専用ハーネスはVercelへ配置しない。開発プレビューには環境ゲート付き `/api/test-auth/[route]` を配置し、`/test-auth/:route` から接続する。ゲート無効時は503で停止し、任意MIO-IDを登録する公開ルートは提供しない。

実HTTP経由で、MIO-ID/ログインIDの同一認証、Secure/HttpOnly/SameSite Cookieヘッダー、認証失敗の非開示、Origin/Fetch Metadata/JSON/実受信4096バイト制限、未認証/重複Cookie拒否、他アカウントからの失効拒否、個別/全ログアウト、変更時のアカウント指定無視・旧ID予約、2端末8同時ガチャの1消費/7再送、DBの試行回数制限とサーバー再起動後の維持を確認した。

HTTPクライアントがCookieヘッダーを明示送信するテストであり、ブラウザーのHTTPS Cookie保存やTLS検証ではない。Originは固定のテスト値。試行回数制限の表はCI専用で、永続運用のレート制限実装や運用負荷試験を意味しない。DBはジョブ終了時に破棄され、データは全て架空。

追加コミットの開発プレビュー（HTTP200確認済み、静的画面の内容は前回と同じ）:
https://emuzii-mio-1st-web-v12-cpyidjt44-gtgz8867jh-3139.vercel.app/home-portrait-next.html

## 実ブラウザーでのログイン／Cookie／端末テスト — 2026-10-16

- [Actions 38799223450](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38799223450): Chromium 3/3、WebKit 3/3。PlaywrightのブラウザーCookie jar＋HTTPS＋一時PostgreSQL16を使用。実機のiPhone Safari／Android Chromeではない。
- 実際の `login-recovery-demo.html` と `device-sessions-preview.html` をブラウザーで開き、MIO-IDと変更可能ログインIDの両方でログイン、別コンテキストの端末一覧、Cookie発行、個別セッション失効、現在端末ログアウト、全端末ログアウトを確認。
- `__Host-mio_session` の Secure、HttpOnly、SameSite=Lax、Path=/ をブラウザー側の保存値で検証。別端末のCookieだけを失効させ、もう一方の端末が使えることも確認した。
- [HTTP＋実DB再検証 38799223347](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38799223347): 12/12合格。GET要求でブラウザーがOriginを省く場合を確認し、same-origin Fetch Metadataを必須にする修正を実施。
- [プレビュー認証ゲート／ルーターテスト 38799223454](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38799223454)、[セキュリティ基盤 38799223527](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38799223527)、[安全ゲート 38799223508](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38799223508) はすべて成功。
- 公開プレビューの読み取り専用通信画面で現状を実ブラウザー確認。`/test-auth/me` と `/api/test-auth/me` は503 `test_environment_not_ready`。API未設定を5件の失敗と誤表示しないよう「環境未設定・テスト未実行（0/5）」に修正し、資格情報を送信せず、再試行ボタンを有効に保つ。画面契約テスト [38799672276](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38799672276)、最終安全ゲート [38799963208](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38799963208) は成功。

## 架空IDを使った認証失敗ブラウザーテスト — 2026-10-16

- [Actions 38801285898](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38801285898): Chromium 1/1、WebKit 1/1合格。
- CI専用の一時PostgreSQLに架空アカウントを1件作成し、実際のログイン画面で「誤ったパスワード」と「存在しないID」を送信。
- 両方が同じ一般エラー表示・HTTP 401となり、Cookieは発行されず、DBにもセッションが作られないことを確認した。
- 初回実行では2回目のAPI応答を待たずに判定するテスト側の同期不備が見つかった。各応答を明示してから判定するよう直し、合格を確認。認証画面の修正ではない。
- 実行コード: `4ee0ffdfb0ebebabec0eab94fa8687d0fb304fa5`。開発ブランチの安全ゲート [38801285771](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/38801285771) も成功。

## 未完了・実行条件

1. 開発プレビューのTEST認証API接続: ルートと画面の配線は済み。現状は専用のPreview環境変数・DBが未設定のためAPIが503で停止し、実際のプレビューでログインはできない。CIの実ブラウザーE2Eとは区別する。
2. パスキー登録/署名検証/失効/紛失復旧: WebAuthnサーバー処理が未実装。対応判定だけを登録成功扱いしない。
3. iPhone Safari/Android Chromeの実機と、Apple/Googleパスワードマネージャー保存・自動入力: 今回のCIエミュレーションとは別に実機で行う。
4. 運用環境の永続ストアを使うレート制限・負荷・再起動後の保存: CIでDB方式の試行回数制限とHTTPサーバー再起動を確認済み。永続の運用サーバー検証は未実施。

開発プレビュー（最終検証コード `7e0edbb578bf69dc9e0a66ee0d97cbc61d3a9a52`）:
https://emuzii-mio-1st-web-v12-436tjbjtr-gtgz8867jh-3139.vercel.app/test-auth-browser-check.html
Vercel READY。ブラウザーで環境未設定表示と「0/5未実行」を確認。実画面のログイン/API成功は環境変数が未設定のため行っていない。
