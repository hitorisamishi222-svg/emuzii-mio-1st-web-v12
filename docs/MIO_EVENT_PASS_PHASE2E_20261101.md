# Phase 2E — メール確認→イベント参加証の即時発行（開発版、2026-11-01）

## 目的と参加者体験

1. 主催者が公開済みのイベント専用URL `/event-pass.html?event=<event_id>` を案内する。
2. 参加者が既存のフリーメール（Gmail/Yahoo/iCloudなど）を入力し、6桁コードを**同じブラウザ**へ入力する。
3. メール所有確認が完了した瞬間、バックエンドが発行可否を判定して参加証を発行する。
4. **一般公開**は即時発行。**招待制**はコードが未使用であれば即時発行。**限定会員向け**は、サーバー側の事前確認済みリストに該当する場合だけ即時発行。それ以外は未発行。
5. 同じ確認済みメール会員が再アクセスしても**同じイベントの同じ参加証**を返す（`UNIQUE(event_id,subject_id)`、トランザクションとアドバイザリロック）。
6. 実際のイベントコンテンツの入場APIは、その都度**署名付きメールセッション＋サーバー側参加証を照合**する。参加証番号を知っているだけでは入場できない。

**注意**：この段階で作成したのは参加証の発行・照合用APIと画面。個々のイベントコンテンツの認可ミドルウェアへの接続は**未実施**。参加証があるだけで現在のガチャ/皆勤/投票サイトに入れるとは表示しないこと。

## 独立した実装ファイル
- `mio-event-email-auth-core.js`：メール正規化、暗号学的ランダム6桁コード、HMACで伏せたメール検索キー・OTP、10分・最大5回、メール・IP別のDB内時間制限、1回限りの検証。
- `api-mio-event-email.js`：コード送信/検証。本番ドメインの同一オリジン、JSON、リリースフラグを要求。既存GAS `bridge('eventEmailOtpSend')`に送信を依頼し、確認成功後にだけ`__Host-mio_event_email`の署名付きCookieをセットする。
- `GAS_EventEmailOtp_20261101.gs`：**既存Apps Scriptプロジェクトに追加する候補（未適用）**。BRIDGE_SECRETチェック後の既存doPost内にディスパッチャ追加が必要。MailApp送信、送信先検証、90秒送信間隔、日次残数・GAS側フラグ確認。新しいGASプロジェクトやメール送信サービスを作らない。
- `mio-event-pass-core.js`：HMAC認証済みメール会員のイベント参加証発行と照会。open/invite/memberのポリシーをDBから読み、招待コードはHMACで保存、1回だけ原子的に消費。限定会員は`mio_event_verified_members`に事前確認済みであることを要求。
- `api-mio-event-pass.js`：別のイベント用フラグと正しいメールセッションがなければ発行不可。
- `db/mio-event-pass-20261101.sql`：既存Neon登録DBに追加する独立テーブルの候補。**未適用**。既存`mio_registration_v2`・GAS・MIO-ID・皆勤・ガチャ回数・抽選履歴への更新はない。
- `event-pass.html` / `mio-event-pass-ui.js`：iPhoneでも6桁を手で入力しやすいモバイル画面。現時点で既存公開ページにリンクしない。

## 公開に必要な条件
- 開発版の各APIは初期OFF。
  - `MIO_EVENT_EMAIL_OTP_RELEASE=verified-event-email-otp-20261101`
  - `MIO_EVENT_PASS_RELEASE=verified-event-pass-phase2e-20261101`
  - GAS側`MIO_EVENT_EMAIL_OTP_GAS_ENABLED=reviewed-event-email-send-20261101`
  - 長く独立した`MIO_EVENT_EMAIL_HMAC_SECRET`、`MIO_EVENT_EMAIL_SESSION_SECRET`、招待制のみ`MIO_EVENT_INVITE_SECRET`、既存DB/既存GASの正常接続も必要。
- 正しい**既存GAS**をバックアップし、その同じスクリプトへ送信候補を追加、必要なMailApp認可スコープを確認、既存デプロイの新バージョン更新とテスト受信が完了するまではフラグOFF。
- Apps Script MailAppの送信先上限はGoogle個人アカウントで参考値**100件/日**、Workspaceで参考値**1,500件/日**（Google公式。利用状況で異なり得る）。主催者のアカウント種類、残クォータ、送信失敗の運用とドメイン/送信者表示を確認する。大量・販売型の場合は別途送信設計を決める。参考： https://developers.google.com/apps-script/guides/services/quotas
- 同一メールへの1時間3件、IP識別キーへの1時間12件、GASで90秒送信間隔、コード5回間違いで停止。ただし`x-real-ip`やCookieだけでは不正な大量送信を防ぎきれないため、**Vercel Firewall/Rate Limitの設定・監査を公開前必須**とする。
- イベントテーブルを主催者が審査済みポリシーと開閉日時で設定する。未公開/終了/対象外なら発行拒否。
- 限定会員の事前承認とメール会員との紐付け方法は別途実機検証が必要。名前・MIO-IDの自己申告のみで`member`資格を作成しない。
- 現行のイベントコンテンツ認可を`checkEventPass`で保護する作業、拒否時の表示、Safari/LINE/X内ブラウザ、メール受信遅延、Vercel本番GASへの送信確認は未実施。
- 完了まで**Draft PR・デプロイなし・SQL未実行・フラグOFF**を維持。既存MIO-IDの移行・新規ガチャ権利の付与をしない。

## 販売型（SEIRAなど）への転用方針
- 今回のコードは**みおシステム既存リポジトリ用の開発候補**であり、販売型を同じDBに混在させない。販売型は顧客サイトごとの`tenant_id`分離または顧客別DBで、メール検索キー・イベント資格・監査を厳格に分ける。
- イベント参加証は、一般サイト会員・管理者・賞品/投票権のログインとは独立。フリーアドレス所有確認は**1人1アカウント**の保証にならない。投票、ガチャ、景品は別の重複防止・本人確認を必須とする。

## テスト
`tests/mio-event-pass.test.mjs`：一般/招待/限定、同一イベント再発行、未公開の拒否、異なるメール会員/偽造署名の拒否、MIO権限に触れないこと。
`tests/mio-event-email-auth.test.mjs`：コード有効期限、5回ロック、DBの暗号化検索キー、送信失敗、本人確認成功。
`tests/mio-event-pass-ui.test.mjs`：モバイル画面のメール確認→自動発行、既発行表示、メール送信失敗、無効イベント。

## Phase 2F — 参加証の発行から実際のイベント会場へ（2026-11-01）

**今回の改修は開発ブランチのみ。本番の既存Vercel・GAS・Neon・参加者データは未変更。**

- `db/mio-event-pass-20261101.sql` を**全体的に再構築**。以前の候補ファイルに、正規表現の`$`を含む置換処理由来のテキスト重複・破損があった。SQLは未適用だったため本番被害なし。今回は独立した1回の`BEGIN/COMMIT`内に、OTP・メール会員・イベント・招待・事前確認会員・参加証・非公開ルームの7テーブルを定義し、構造テストを追加。**本物のPostgresに適用した検証ではない**。
- `mio-event-room-core.js` と `api-mio-event-room.js`：署名付きメールセッションに含まれる会員IDを使用して、**1本のSQL**で有効な参加証、現在のイベント開催時刻、公開中イベント、公開中ルームを照合。限定会員イベントの場合は、その時点でサーバーに記録された事前確認会員資格も必須。`MIO_EVENT_ROOM_RELEASE=verified-event-room-phase2f-20261101` を別の初期OFFフラグにして、発行機能だけをONにしても会場は未公開。
- `event-room.html` と `mio-event-room-ui.js`：静的ページは**空の入場画面だけ**。非公開の文章・認証情報・動画URLを静的ファイルに含めない。サーバーが入場を許可した時だけ`textContent`で文章を表示し、生HTMLを実行しない。会場への公開リンクだけではコンテンツに入れない。
- `event-pass.html` と `mio-event-pass-ui.js`：メール確認後の参加証発行成功・既発行の確認成功後に「イベント会場へ入る」を表示。未確認時は非表示。
- `mio-event-email-auth-core.js`：メール送信の同時申請に対して、メール検索キーとIP検索キーの双方をDBトランザクション内でロックし、1時間の送信上限確認と競合を直列化。同じブラウザの未使用旧コードは`superseded`として無効化。新旧のコードが同時に成功しない方向へ強化。DBの実挙動は本番未確認。

### 本番導入を止める条件

1. 既存GASのバックアップ、`GAS_EventEmailOtp_20261101.gs` の**同一プロジェクトへの追加**、秘密鍵照合後の既存`doPost`ディスパッチャ追加、必要なMailApp認可、既存デプロイの新バージョン適用まで管理者がレビュー。新GAS・新本番URLは作らない。
2. 既存Neonに追加する7テーブルについて**バックアップ、SQLの実行計画・マイグレーション・ロールバックと実DBスキーマ照合**を先に行う。SQL未実行。
3. 本番のVercel WAFで`/api/mio-event-email`を対象とする**IPベースのレート制限とBot対策**を管理者がレビューする。Vercelの`x-real-ip`は公式ドキュメント上`x-forwarded-for`と同じ扱いだが、独自プロキシ構成・ヘッダー偽装・NAT共有を評価する。アプリ内のIP制限はWAFの代わりにならない。出典：https://vercel.com/docs/headers/request-headers 、https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
4. メール送信の実受信試験、Safari/Chrome/LINE/Xの同一ブラウザ内6桁入力、遅延や再送、停止時のUI、公開/招待/限定会員3条件での入場、資格解除・イベント終了・コンテンツ非表示を**実機と既存DBのテストデータで検証**。
5. ルーム本文は候補DBの`mio_event_rooms`に入る**4,000文字以内のテキストだけ**。限定動画や画像の保存先・URL自体はここで保護されないため、動画/画像等の媒体向け権限付き配信は別設計。秘密のURLを静的/一般公開サーバーに置かない。
6. 通常のMIO-IDやガチャ権利の復旧とは別。一般参加証では、皆勤・ガチャ・投票・メンシプ権限は付与されない。

テスト：`tests/mio-event-room.test.mjs`、`tests/mio-event-pass-ui.test.mjs`、`tests/mio-event-email-auth.test.mjs` を独立CIへ追加。モックテストは**本番接続・実DBでのSQL適用・実メール送信の証明ではない**。
