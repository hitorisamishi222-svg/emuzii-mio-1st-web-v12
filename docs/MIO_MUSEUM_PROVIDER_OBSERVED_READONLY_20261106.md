# みおミュージアム｜実接続先の読取監査（2026-11-06 23:13 JST）

> 現況の読み取りだけ。本番サイト、Neonのテーブル、Apps Script、既存参加者・皆勤・ガチャデータへの書き込みは行っていない。環境変数の**値**や接続URLは記録しない。

## 今回確認した実際のNeon環境

Neonの接続済みプロジェクトは1つ。ブランチ一覧には次が存在した。

- `main`（primary）
- `gallery-admin-isolated`（メインから分岐）
- `mio-reg-v2-isolated-test-20261019`
- `gallery-passkey-auth-review-isolated`
- `mcp-migration-2026-10-17T19-12-42`
- `mio-dev-test-isolated`

**「みおミュージアム専用」のDB分離ブランチは見つからなかった**。`gallery-admin-isolated` は既存ギャラリー管理データを保持するブランチであり、完全に独立した記念館の空DBと混同しない。

`gallery-admin-isolated` の公開スキーマには以下が存在した。

- `gallery_admin_users` / `gallery_admin_devices` / `gallery_admin_sessions` など、既存ギャラリー管理者認証関連
- `gallery_live_overrides` / `gallery_published_items` など既存ギャラリー機能
- `mio_gacha_admin_*` など既存ガチャ管理関連

一方、**大型アップデートで想定する5テーブルは、実際のテーブル一覧に存在しなかった**。

1. `museum_public_exhibits`
2. `museum_gallery_layout_stage`
3. `museum_gallery_layout_history_stage`
4. `museum_gallery_layout_audit_stage`
5. `museum_exhibit_draft_operations_stage`

GitHubには候補SQL3ファイル（合計で上の5テーブルを定義）が保管されている。しかし**SQLファイルが存在することは、DBへの導入や実復旧成功を意味しない**。

## 今回確認したVercel環境

対象：既存プロジェクト `emuzii-mio-1st-web-v12` の環境変数**キー名・スコープのみ**。

- `GALLERY_DATABASE_URL`：既存ギャラリー用としてproduction/previewに存在。
- `MIO_MUSEUM_GALLERY_DATABASE_URL`：**見つからず**。

そのため、記念館専用のDBに画面を接続したという状態ではない。既存の `GALLERY_DATABASE_URL` を流用して新しい作品を保存することは禁止。

## 2026-11-06の実装成果

- ギャラリーの作品管理練習画面に**選択写真を端末の中だけで実際に圧縮し、容量・寸法・SHA-256を確認するボタン**を追加。
- `museum-image-client.js` を専用画面内でのみ読み込む。ネットワーク・画像アップロード・サーバー保存・DB書込は増やさない。
- iPhone/Android相当の**320px/390px Chromium**で合成写真をファイル選択→ボタン→圧縮→ハッシュ計算→入力変更時の検証失効まで自動操作した。
- 大型アップデート統合・スマホ動作・皆勤賞復旧保護のCIが合格した。

## 書込み開始までの停止条件

1. 既存ガチャ・皆勤・ギャラリー運営から影響を隔離する**記念館専用DBの保存先**が、プロバイダ上で識別・確認できること。
2. Vercelの**限定Preview環境**と専用DBのホスト・ブランチ・DB・権限・TLSが、秘密情報を出さずに一致検証できること。
3. 旧サイト情報と新規DBの**バックアップおよび別環境での実復元成功**を確認すること。
4. 候補SQL5表のテーブル・制約が実DBに導入され、読取検査で一致すること（誤った既存スキーマを `IF NOT EXISTS` で黙殺しない）。
5. 既存オーナーと承認済み端末のセッション・アクセス制御を独立に確認すること。
6. サーバー側画像の**完全デコード・再エンコード**と非公開保管、保存→読戻し→ハッシュ一致確認が通ること。
7. 作品公開・非公開・取消しの権利/個人情報/監査・復元テストに成功し、最終公開承認を得ること。

**現状の判定：開発画面と安全なローカル画像確認は実装済み。永続保存/実画像アップロード/本番公開は未接続。**
