# COMMUNITY v0.1 / 統合前API契約とテスト計画

APIは実装予定インターフェース。現在のブランチには通信するAPIを追加していない。

## 読み取り（認証不要／公開承認済みだけ）
- GET /api/community/public?cursor=...&limit=50
- GET /api/community/media?kind=video|photo&cursor=...&limit=24
- GET /api/community/events
- 公開メッセージは{ id, nickname, body, createdAt }のみ
- 公開作品は{ id, kind, source, title, nickname, description, thumbnail, url, publishedAt }のみ
- 公開イベントは{ id, text, url, startsAt, expiresAt }のみ。メッセージにMIO-IDを露出しない。
- limitはサーバー側で上限を掛ける。非公開/削除/審査中のデータを絶対に返さない。

## 書き込み（端末署名と承認両方が必要）
- POST /api/community/messages {body, clientRequestId}
- POST /api/community/media/apply {kind, source, title, nickname, description, url?, thumbnail?, permissionAttested}
- POST /api/community/media/request-upload {kind, filename, size, contentType}
- GET /api/community/me は参加承認および権限判定の表示用。利用状態はサーバーが返す。
- 端末署名をサーバーが検証した後、既存GAS/DBを照会してparticipantIdと承認済みステータスを検証する。
- クライアント側のselectedRole、displayName、participantId、permissionAttestedだけでは投稿許可しない。
- clientRequestIdの冪等性と投稿間隔制御で二重送信と連投を防ぐ。
- 本文をプレーンテキストとして扱い、HTML埋込み・javascript:・偽装リンクを許可しない。
- 作品申請時の権利チェックは自己申告を受け取り、その後運営が確認する。

## 動画／画像の直接保存
- 一時アップロードURLは承認済みユーザーにサーバーが短時間だけ発行する。
- 一時領域は一般公開しない。ファイル安全確認、形式、容量、サイズ、権利・掲載許可確認、運営承認を終えてから公開領域へ移す。
- 最終公開URLとサムネをDBに持ち、元ファイルの保存先キーは公開APIから返さない。
- 直接投稿された画像のEXIF位置情報等はサムネと配信用画像から除去する。
- 外部媒体へのリンクはホスト名まで検査。TikTok/YouTubeの動画本体を勝手に取得・コピーしない。

## 管理（管理者認証必須）
- GET /api/community/admin/pending
- POST /api/community/admin/approve {type,id}
- POST /api/community/admin/reject {type,id,reason}
- POST /api/community/admin/mute {profileId,until}
- POST /api/community/admin/notice {text,url?,startsAt,expiresAt}
- 管理権限はサーバーとDBで確定する。一般利用者からの管理者指定は無視する。
- 非公開投稿・通報内容を匿名読み取りAPIへ流さない。操作ログにactor/日時/操作/対象を記録。

## OpenChat本人照合の手順
1. 利用者が既存参加者IDでログインし、オプチャ名を申告
2. サーバーが短期限コードを発行（コードは公開チャットへ表示しない）
3. 申請者がオプチャにコードを投稿し、管理者が投稿者を目視照合
4. 管理者が該当申請を承認し、コミュニティ投稿許可を付ける
5. ニックネーム一致のみ、LINEログインのみ、招待リンク閲覧のみでは許可しない

## リアルタイム（候補）
- 公開済みメッセージだけを配信する公開専用購読路を設ける。
- 投稿／作品申請／通報／管理操作は認証済みサーバーAPI経由。DBロールとRLSも組み合わせる。
- 既存Google Sheetsへチャットメッセージを逐次追加する方式は採用しない。

## 必須テスト（統合前）
- 未登録・承認待ちで書き込み拒否：401/403
- 承認済みで短文成功、重複要求は1回だけ保存
- 権限失効、端末変更、改名時に旧セッションが投稿できない
- 5秒以内連投、1分5回超、300文字超、禁止形式URL、script文字列、HTMLを正しく処理
- 審査待ち作品を一般ページとRealtimeへ配信しない
- システム更新テロップは公開承認済みだけ表示、停止できる
- 動画リンクのドメイン検証とHTTPS、アップロード容量/MIMEの検証
- 許可のない画像・FA応募を勝手に公開しない
- デモではアクセスした瞬間に本番APIを呼ばず、本番利用履歴・ガチャ回数に影響しない
- 320/375/430pxスマホ、Android/iPhoneの入力とモーダル、キーボード表示
- ガチャ・皆勤・ファンアート・お知らせの既存APIが無変更

## 次に決める運用設定（公開前）
- 書込承認者（運営アカウントと人数）
- メッセージの保存期間と荒らし対応フロー
- 1作品の最大容量・動画保存期間・必要予算
- 通報対応責任者と作品掲載規約
- 新DB・ストレージの接続許可