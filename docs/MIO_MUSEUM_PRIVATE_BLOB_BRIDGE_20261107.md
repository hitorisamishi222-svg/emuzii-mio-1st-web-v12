# みおミュージアム｜非公開画像保存の接続準備（2026-11-07）

**状態：開発用・未接続・本番書き込み禁止。**

## 今回完成した部品

- `museum-private-blob-write-readback-stage.mjs`：`@vercel/blob` の非公開 `put` / `get` を使用するための、**APIルート未接続**のサーバー側ブリッジ。
- 必ず `museum-media-decode-reencode-stage.mjs` で画像デコード・白背景フラット化・新WebP生成・構造/寸法/SHA-256再検査を通す。
- 実際の接続まで、検証用の偽ストレージ（メモリ内）を使用する。**実際のVercel Blobストアにはデータを1件も送っていない。**

## 保存フロー（実接続時の想定）

1. 別途実装される信頼できるサーバー認証処理が、既存オーナー・承認済み端末・Previewの限定スコープ・専用Private BlobストアID・分離DB・バックアップの実復元・管理者の最終承認を**独立に検証**する。クライアントから送られた `verified=true` などの値は証明に使わない。
2. 明示的に与えられた記念館専用ストアIDと専用認証情報を使う。**既存の共通 `BLOB_READ_WRITE_TOKEN` を自動的に読み込んで使わない。**
3. 画像を完全にデコード・再圧縮し、`museum-private/<認証済み管理者UUID>/<操作ID>.webp` のみを保存対象にする。端末から送信されたURLやストレージパスを使わない。
4. `get` で同名オブジェクトを事前確認。既存なら内容の一致が必要。新規なら `access:'private'`, `allowOverwrite:false` で書く。公開用ストア/別ストアのレスポンスは拒否する。
5. 書込み後は `get(..., {access:'private',useCache:false})` で最新バイトを読み戻し、ストアURLのホスト・パス・MIME・容量、内容のバイト完全一致、SHA-256を確認する。
6. アップロード成功か不明な場合、**同じ操作IDで読み戻し確認**する。既存オブジェクトへ再度 `put` せず、別画像なら失敗にする。
7. ブラウザには画像バイト・Blob URL・パス・トークン・管理者IDを返さず、結果として `ok/privateOnly/replayed/bytes/width/height/sha256` のみ返す（これも現時点ではAPI未公開）。

## 検証したこと

- 専用自動テスト `tests/mio-museum-private-blob-store-stage.test.mjs` **14件合格**。
- テストには実画像の再圧縮を含むが、ストレージ部分は**ネットワークを使わない偽装プロバイダ**。
- [新規Private Blob契約CI](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/42320867142)：合格。
- [大型更新の統合・スマホ検査](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/42320867199)：合格。
- [10月皆勤賞復旧保護](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/42320867147)：合格。

## 残る実接続の停止条件

- **記念館だけが使う独立したPrivate Blob保存先**とPreview限定認証の実体は未確認。既存の共通Blobトークンを流用しない。
- 独立した記念館DBの保存先、必要な5テーブルの導入と制約、旧データの復元演習の実証は未完了。
- 既存オーナー・本人確認済み端末の実セッション認証、APIのOrigin/CSRF制御、画像権利確認/公開承認の結線は未実装。
- 専用の画像保管場所ができても、実際のバックアップ・削除/復元・公開取消しを検証するまで実公開しない。
- **本番 `main`・Vercel production・GAS・Neon・ガチャ管理・10月皆勤賞・参加者ID・画像原本・既存音源は今回変更していない。** 新規Vercel/Neonプロジェクトも作成していない。

このファイルは検証結果の記録であり、実接続や公開の承認書ではない。
