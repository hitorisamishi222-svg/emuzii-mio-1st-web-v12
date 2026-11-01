# みお1周年 大型アップデート統合の接続表（2026-11-01）

## 固定の約束
- 既存Vercelプロジェクト・固定本番URL `https://emuzii-mio-1st-web-v12.vercel.app/` を維持。
- 現在の本番 `main` / GASデプロイ / 正本スプレッドシート / Neon / MIO-ID / ブラウザ承認 / ガチャ回数 / 当選履歴 / 皆勤 / FA を変更しない。
- **コピー版で全体を完成→全機能テストと実機テスト→バックアップ・切戻し確保→ユーザー最終承認→既存URLへ一括更新**。
- 本番用アプリと旧デモの**ブランチ全体の一括mergeは禁止**。新規Vercel/GASプロジェクト、新規本番URL、新規Sheetsは作らない。
- 新しいメール/イベント参加証も、旧管理センター・ガチャ/皆勤/FAの更新を放置せず並行で管理する。

## 2026-11-01 現物照合
- 本番Vercel Production: `READY` / Deployment `dpl_J7oZ362TLR2RjGgBegfKELnDcjtP` / `main bb4a39a29e6c5c3ae70b6c35cf290feb8cb67a6b`（読取専用確認）。
- この既存コピー `release/v2-next-integrated-replica` は`main`と**diverged**。比較時点で **ahead 518 / behind 240**。古いMIO/認証/GAS・static mockが混在。今の本番として扱わない。
- コピーの`vercel.json`は**存在するが、production用設定ではない**。`bash ./build-preview.sh`で公開HTML等だけを`public`へコピーし、`index.html`、`gacha.html`、`api-*.js`、`bridge.js`を除外する旧安全プレビュー用。
- コピーには採用済みトップ`home-portrait-next.html`、王宮デモ`gacha-royal-integrated-preview.html`、皆勤/マイページ/コミュニティ/音楽/管理のプレビュー8項目が存在（**UIだけの存在確認であり機能完成の証明ではない**）。
- 現在の本番にある`api-activate-attendance.js`、`api-gacha-admin-ops.js`、`api-gallery-items.js`、`api-gallery-manage.js`、`api-gallery-moderate.js`、`gacha-web-gate.html`、`gallery.html`はこの旧コピーにまだない。既存の参加者/皆勤/ギャラリー管理を旧コピー全体で上書きすると機能欠落の危険。
- 2026-11-01のエラー修正用ブランチ `fix/mio-ci-regressions-20261031` では[全体300件/299合格](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41263779516)、
  別の管理統合スコープ296/296合格。残る1件は演出限定の`api-gacha.js`固定SHA検査。**全体公開の合格ではない**。
- 管理センター/端末復旧/メール参加証の開発候補`feature/mio-admin-center-phase1`は[110/110重点合格](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41263710169)。現行GASの稼働ソースが未確認なので接続や書き込みは未解放。
- 記念館・展示・FAはPR #47/#48その他に分離されたDraft候補がある。各候補を完了扱いせず、実機・権限・保存先・既存履歴を照合する。

## 統合する順序（**旧コピーをmainへmergeしない**）
1. **現行mainの正確な読み取り専用バックアップ基準を確認**し、既存リポジトリ内の**最新mainベースの隔離された作業コピー**を統合先にする。旧`release/v2-next-integrated-replica`はデザイン・UX素材の参照元として保持。
2. 現行の認証/登録/端末/皆勤/`api-gacha.js`/当選履歴/FA/ギャラリー/管理API等のproduction保護コードを基準とし、旧版へ戻さない。
3. 承認済みのトップ/背景/見た目/クジラ演出/皆勤カレンダーなどから**描画部分だけを差分選択**して取り込み、ダミーのlocalStorage権利やfake履歴を本番APIへ接続しない。
4. PR #74の管理センター・復旧・OTP/参加証、PR #75のエラー修正、PR #44/#45の演出、PR #47/#48の記念館について、依存関係と現行ファイルSHAを再照合し、**選択的・順番付き**に統合。GASを使う機能は現稼働GASの実版とデプロイversionNumberの読み取り照合前に有効化しない。
5. コピー上で合成参加者・合成drawId・テスト作品を使って登録/皆勤/FA/予想/管理/ガチャ/履歴/複数ブラウザを通し、iPhone Safari/LINE/X内ブラウザ等の実機表示を確認する。
6. GAS・DBの安全なバックアップと移行・切戻し手順を確認。mainとProductionの既存URLは**最終承認まで維持**。公開後もエイリアスの実際のdeploymentIdと主要APIを検証。

## 並行レーン（毎回途切れさせない）
|区分|依存・保留内容|次に可能な安全な作業|
|---|---|---|
|管理GAS|Issue #66、実GAS未照合、候補管理関数19件重複|コード実版・デプロイ版の読取／追加差分の確認、管理書込フラグOFF|
|登録・Cookie・ガチャ|PR #75、全300件299合格、演出専用SHA1件失敗|演出限定候補と管理統合候補を別々にテスト・版数確認|
|管理センター・障害救済|PR #74、110/110重点PASS、実接続未確認|エラー一覧、端末/同一drawId復旧の安全な読取統合|
|ガチャv2.1|PR #44/#45、制作済みUI・素材あり|当選履歴・抽選権不変のままiPhone演出を最終確認|
|皆勤・FA・予想|既存正本の維持が必須|31日×2回/日、審査、非公開、保存と既存データ整合テスト|
|記念館・コミュニティ|PR #47/#48、デモ・権限制御が混在|モックと実APIの区別、展示権利・画像保存の隔離確認|
|メール・イベント|PR #74 参加証候補、GAS/DB未導入|OTP流量制限、資格と既存ガチャ権利の分離テスト|

## 新しく追加した機械的な停止検査
- `release-prep/replica-baseline-audit.mjs`は現在の`origin/main`と**16種類の必須productionファイル**をSHA比較する。さらに採用済みUI/デモ8項目の存在を確認し、現在のコピーが公開不可である理由を表形式で出す。
- `.github/workflows/mio-replica-baseline-audit.yml` はpush/手動時に**読み取り専用**で`main`をfetchし比較。GAS/DB本番接続・Vercel deploy・main mergeの工程は一切持たない。
- どれか1件でも欠落/変更があれば`node release-prep/replica-baseline-audit.mjs --release-gate`は失敗する。**仮に全一致しても実機/GAS/DB/承認ゲートは別途必要**。
- 上記CIの`--expect-copy-blocked`は「この旧コピーが公開不可であることの確認」専用であり、CIが緑でも**大型アップデートが完成した意味にはならない**。

## 最終判定
**準備中／統合未完了／本番未公開。** この文書や旧コピーの更新だけを理由にProductionへ反映しない。

## 2026-11-01：ミュージアム表示見本をこの既存コピーに追加

- 記念館Phase2 Draft #48から公開ページ側の `museum.html`、`mio-profile.html`、`museum-archive.html`、`museum.css`、`museum-archive.css`を**視覚用コピー**として導入。既存サイトの管理API/DB/GASはコピーせず、秘匿データを含まない。
- `next-preview.html`の先行体験カードから `/museum.html` に進める。トップ → プロフィール → 3種類の展示室の表示とカテゴリー選択が可能。
- このコピー専用`museum-news.js`は固定案内文だけを表示、`museum-archive.js`は外部API/DBを呼ばず未公開状態を描画。**実ニュース・実アイコン・実写真・管理者APIを読み込まない。**
- 3ページのヘッダーに「大型アップデート用の画面見本」「本番未公開」を明示し、`noindex,nofollow`。既存の見本デモへのリンクに差し替え。Phase2元ブランチにある正式な動的APIコードは変更しない。
- `release-prep/replica-museum-preview.test.mjs`でリンク/未公開表示/検索禁止/外部API・Cookie・保存処理の不使用を検査。コピーの安全監査CIにも追加。
- Vercel既存プロジェクトのPreview: `dpl_92RLppo7w3kVDKXhxdTenqByZ8jD`、commit `22edbbf4eba27cd42a52db78fe8143b4ce7ba931` は`READY` / `target=null`。**HTTPブラウザ表示・iPhone実機・GitHubコピーCIの実行結果は未確認**。Productionへ昇格していない。
- Phase2開発元ではお知らせ参照の古い`/api/announcements`を現行公開ルート`/api/gallery/announcements`へ修正。最新検証：[Museum Phase2 CI 41275514928](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/41275514928) **74/74合格＋Chromiumスマホ幅＋隔離PostgreSQL1件合格**。本番DBと実管理者Cookieでは未検証。
- 統合後は**現行mainの`gallery`権限とAPI**を基準に、元Phase2から動的展示機能を慎重に選択統合する。コピーの表示用スタブを本番の正式公開APIと混同・上書きしない。

**この節は視覚プレビューの進捗。大型アップデートの最終合格／一括本番公開ではない。**
