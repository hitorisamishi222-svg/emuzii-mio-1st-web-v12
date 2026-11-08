# みおミュージアム｜Preview管理者認証と非公開画像保存の統合準備（2026-11-07）

> **まだ使える本番API・ログイン画面・保存先ではありません。** 既存みお本番、GAS、10月皆勤賞、参加者ID、ガチャ、既存ギャラリー、音源、管理者データは不変。開発PR #76の未公開コードだけを更新。

## 今回の実装

- `museum-preview-owner-session-stage.mjs`：既存の `gallery-auth-shared.js` にある `verifyGalleryAdmin` を**そのまま使用**し、承認済み端末・有効な管理者セッション・owner権限を照合するPreview専用の認証契約。既存本番 `checkOrigin` は書き換えない。
- PreviewアクセスはHTTP POST + JSON + **同一Origin** + 事前に独立検証済みのVercelプロジェクトID/ブランチ/正確なGit SHA/Previewホストの一致だけ受け付ける契約。クライアントが申告する`ownerId`/`approved`等は照合に使用しない。
- `museum-owner-private-media-composition-stage.mjs`：DBプールから専用クライアントを取り出し、実スキーマ/復元/ブランチ/所有者承認を別のサーバー側コールバックでチェック→本人確認済みownerと端末を既存セッション照合→専用Private Blobストアの独立した情報を確認→`sharp`再エンコード→非公開保存/読戻し/内容一致の処理を組み合わせる。
- `verifyTrustedScope` が**保存開始前・画像処理完了後・Private Blob PUT直前**に走るため、途中のセッション/端末承認取消し・owner変更・プロバイダ情報の変更が次回確認時に検出されれば、書込みを行わない。
- 実Blobストアの`storeId`と、SDKへ渡す専用`vercel_blob_rw_<store_id>_...`トークン内のID一致チェックも前段から継続。任意の画像URLや公開キーをクライアントへ返さない。

## 結果

- [Preview管理者認証・Private Blob結合CI](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/42333299368)：**20/20合格**（owner session単独9件 + DB→owner→実画像→模擬Private Blob結合11件）。
- [10月皆勤賞復旧保護CI](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/42333299370)：**合格**。
- Previewの認証失敗/他Origin/生体・端末承認の失効/別ストア/間違ったブランチ/復元不明では、**Blob GET/PUTなし**。失敗時の例外をクライアントへ詳細送信しない構成。
- 「UUID（8-4-4-4-12）形式チェック」の初期不具合をテストで発見し修正済。診断のための一時例外は削除し、無効値は通常の`null`で返す。
- 本番 `main`へのマージ・本番デプロイ・Neonデータ変更・Private Blobストアの作成/書込みは**ゼロ**。

## 重要な現実の未解決事項

1. **既存管理者セッションは本番ホスト専用のCookie**。独立したVercel PreviewホストにそのCookieはブラウザから送信されない。Previewで実管理者ログインを成立させるには、既存の管理者アカウントと承認端末の確認を保ったまま、**追加の安全なPreview向けログイン/認証フロー**を設計・レビューする必要がある。既存本番のOrigin許可を広げるだけの方法は採用しない。
2. 記念館**専用**Neon接続と必要な5テーブル、独立Private Blob保存先、Preview限定トークン、**別環境での実データ復元成功**はまだ存在確認・完了していない。今回の合格テストでは**すべて模擬プロバイダ**を利用し、サーバー側の検証コールバックをテストで模した。
3. 画像のBlob保存と作品の非公開DBレコード保存を一貫させる**操作IDの永続記録・孤立オブジェクトの安全な回収・作品への画像紐付け**は未接続。保存処理だけでは公開/復元/管理画面操作の完成にはならない。
4. このブランチの`vercel.json`に管理者画像保存用のAPI/公開URLは**追加していない**。既存本番の共通`GALLERY_DATABASE_URL`や`BLOB_READ_WRITE_TOKEN`を流用・変更しない。実認証/ストア/復元の根拠がそろうまで本番公開は不可。

次の安全な工程：分離Preview向けの**管理者ログインセッション発行・更新・失効とCookie属性**の設計、実Providerの権限隔離/復元ルートの確定、画像・作品操作IDをDBで一貫管理する実装。既存URL/参加者/ガチャに副作用がない形で進める。
