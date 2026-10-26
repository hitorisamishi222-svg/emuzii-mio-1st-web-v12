# みおシステム｜ガチャ優先・安全確認と引き継ぎ（2026-10-25）

> 対象：通常ガチャ・ラキフェス・王宮クジラ豪華演出。**本番未変更。静的検査と読み取り専用監査のみ。** 本記録は他チャットで同じ作業を繰り返さないための引き継ぎ資料。

## 変更してはいけないもの
- 正本は**稼働中のGAS・スプレッドシート・公開Vercel**。GitHubの`Code.gs`は現行GASの正本と断定しない。
- 現行本番URL、MIO-ID、Web登録、参加者承認、皆勤、ガチャ権利、当選履歴、FAを保護。勝手な本番変更・本番抽選・リセットは禁止。
- 他チャットの端末復旧・新規登録開発と作業を重複させない。新リポジトリ／新Vercelプロジェクト／新Apps Scriptプロジェクトを作らない。

## 2026-10-25確認済み
- GitHub: `hitorisamishi222-svg/emuzii-mio-1st-web-v12`
- ガチャ演出専用ブランチ：`feature/mio-royal-gacha-deluxe-20261023`。`main`に対して**ahead 12 / behind 5、diverged**。まるごとマージせずガチャ関連差分だけ検討。
- 豪華演出の追加は `gacha-deluxe-v21.js` と `gacha-deluxe-v21.css`、`gacha.html`の読み込み設定、`vercel.json`の静的ファイル登録。本ブランチの`gacha-page.js`は`main`と同一。抽選APIは今回変更対象外。
- 開発側 `data/gacha-prizes-v2-preview.json` を静的検査：**計27景品／通常16・ラキフェス11／確率100%ずつ／景品ID重複なし／画像パス27点**。これはプレビュー用データであり、稼働中の`emuzii_景品設定`が同じとは未検証。
- 開発側 `release/v2-next-integrated-replica:Code.gs`（SHA `732371bce7a008b8e3606f866625f91b1df1aaf8`）について静的検証**16/16項目PASS**：権利・登録承認・ガチャ公開ゲート・5回条件・Web4回の実抽選後解放・drawId照合とリプレイ・ScriptLockの処理区間・重複景品除外・当選履歴の画像とレア度・景品設定の基本整合。
- **注意**：`main:Code.gs`（SHA `6828891b3c52e59566cfab59e416e5d2a3363084`）では`festUnlocked:total>=5`でありWeb4回抽選条件はない。対して上記統合開発版は`history.length>=festAvailableFrom-1`を表示とサーバ側の抽選拒否で使用。公開GASがどちらの仕様かは未確認。**旧`Code.gs`をGASへ上書きしない**。
- GAS本番接続・権利消費の実機試験・並列抽選・ガチャ管理公開スイッチ反映・実際の27景品は**未検証**。静的検査合格は本番運用可を意味しない。

## 次に進める工程（安全順）
1. **本番GASの現行ソースを読み取り専用で取得し比較**（Code.gsほか全ファイル、バージョン・公開状態を確認。編集／実行／デプロイなし）。
2. **本番スプレッドシートの読み取り専用照合**：`emuzii_景品設定`、`emuzii_管理画面`の公開スイッチ、`emuzii_ガチャ`、`emuzii_当選履歴`。本番データの上書きやダミー参加者の混入は禁止。
3. GASソースとのAPI契約差分を解消した**ガチャ限定パッチ**を作成。特に`festEntitled`/`festUnlocked`/`nextOrdinal`/`festAvailableFrom`/`webDrawsUsed`、`remaining`、`rarity`、`image`、重複防止、ScriptLock。
4. **分離テスト環境**で「権利0/4/5以上」「Web抽選0〜5」「公開ON/OFF」「同一drawIdの再実行」「異なるdrawIdの同時実行」「景品重複と在庫切れ」「通信切断復旧」「Android/iPhoneスマホ画面」「演出スキップ」の重点検証。
5. 本番変更は検証結果と差分を提示して、**ユーザー承認後にのみ**実施。データのバックアップとロールバック導線を確保。

## 作業境界
このチャットは**ガチャ限定**。他チャットは端末認証復旧・皆勤・登録・FA等を継続。ガチャ側から個人IDや端末復旧の処理を独断で修正しない。

## 検証の区分
- 設計・静的チェック：済
- 模擬テスト／分離環境の実行：未実施
- 本番GAS現物確認：未実施
- スマホ実機テスト：未実施
- 本番反映：未実施

## 追記：2026-10-25 新規検証（他チャットとの重複防止）
- GitHub Actions で既存の静的／仮想抽選テストは **32/32 PASS**（[実行記録](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40158460174)）。**合格済みは再実行しない**。
- 実際の Google Sheets は、GitHub `Code.gs` の `SHEET_ID` とファイルIDが一致。Google Drive上に複数の類似ファイルがあるため、**名前だけで正本を選ばない**。
- 実際のシート（**読み取りのみ**）には、`emuzii_景品設定` 10列・`emuzii_当選履歴` 14列・`emuzii_ガチャ` 17列あり、統合開発版の列構成に一致。
- 管理画面の **B23 = 5**、受付スイッチ **B141 = FALSE、B142 = FALSE**（観測時点。今後変更される場合があるので実行直前に再読込）。
- **27件すべて有効、通常16種とラキフェス11種が各100%、画像URLが全件HTTPS、正規の `gacha-mem-*.jpg`・`gacha-lf-*.jpg` パスと一致**。景品ID・名前・確率は開発側プレビュー設定と27/27一致。数量上限は全件未設定（無制限指定）。
- **通常とラキフェスで同名景品が7件**。統合開発版では被り判定キー空欄時に正規化景品名が使われる。空欄はエラーではない。
- 追加で GAS の `doPost` を模擬した **認証・ロック境界テスト12/12 PASS**、失敗0（[実行記録](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40165021645)）。テストコード：`tests/gacha-lock-boundary.test.mjs`。旧32ケースの再実行は行っていない。
- この新規テストでは偽Web ID／偽トークン、管理者OFF、端末無効化、秘密鍵不一致、二重送信、異なる抽選ID、残回数不足、書込失敗時のロック解放を検証。**本番GAS実行も実データ書込もなし**。
- Vercel固定URLの現在の本番デプロイは `main` のコミット `fba04e96fb149503611872cf0c48980db69d0e3c` と確認。ガチャブランチ変更はプレビューにのみ反映されており、固定の本番URLを変更していない。
- **重要な未完了作業**：稼働中の Google Apps Script プロジェクト現物のソース取得。現在利用可能な Drive/GitHub/Vercel の読み取り機能は GAS 本体の直接取得に対応せず、GAS現物と統合開発版を同一だと断定できない。**代わりに本番GASへ推測パッチを書き込まないこと**。
- 実機操作：ここまで不要。公開前に管理者認証・公開スイッチ・プレビュー画面の確認が必要になった場合だけ、明示して依頼。

## 追記：2026-10-25 通信切断後の結果復旧・新規検証
- **新規5ケースすべてPASS**：抽選結果レスポンス喪失時に同じ `drawId` で当選結果を再取得、受付OFFになった後も過去結果の読み直し可能、新たな別ID抽選は受付OFFで拒否、別Web参加IDおよび別MIO-IDからのリプレイ拒否。
- GitHub Actions：[gacha retry recovery checks（5 PASS / 0 FAIL）](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40165658370)
- 実行したのは `tests/gacha-retry-recovery.test.mjs` の**新しい5項目のみ**。既に合格している32＋12項目は再実行していない。現在の確認済みケース数は **累計49件**。
- **検証範囲に注意**：GAS **開発版** `release/v2-next-integrated-replica:Code.gs` をメモリ上の疑似シートで実行したサーバ側ロジックの結果。ネットワーク断やブラウザのストレージ消失を再現した実機・E2Eテストではない。公開中GAS正本の取得・比較はまだ未実施。
- **実機操作の依頼中**：王宮クジラ豪華ガチャ v2.1プレビューで通常・ラキフェス・スキップの3動作。ユーザーから実機結果が届くまでは未合格に保持。現時点で追加の実機操作依頼は不要。
- **安全状態**：固定本番URL、本番GAS、本番シート、ガチャ受付スイッチに書込なし。変更はガチャ専用ブランチのテスト2ファイルとこの引き継ぎ記録のみ。

## 追記：2026-10-25 ブラウザによる豪華演出プレビューテスト
- 未実施だった**実ブラウザ操作**の検証をガチャ専用ブランチで実施（Chromium headless、ローカル静的プレビュー、実データなし）。
- **390pxスマホ模擬ビュー 1シナリオPASS**：[GitHub Actions](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40166049446)。両モードの体験・スキップ・ダミー結果表示・抽選APIリクエスト0件・JavaScript例外0件を検証。テストファイル：`tests/gacha-browser-demo.mjs`。
- 390px合格済みテストは再実行せず、**375px／430pxの2幅だけ追加テスト PASS**：[GitHub Actions](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40166175487)。横スクロール・筐体と操作領域の画面内収まり・動きを抑える設定での演出完走・抽選API通信0件を検証。テストファイル：`tests/gacha-mobile-layout.mjs`。
- **確認済み49件＋新規ブラウザ操作1シナリオ＋追加2幅の表示テスト**。ブラウザテストはGAS稼働接続でも実端末確認でもない。本番API/本番ガチャ権利は使用していない。
- **実機未完了**：ユーザー本人のiPhone/Androidによる通常・ラキフェス・スキップ3確認は引き続き報告待ち（今は重ねて操作を要求しない）。実機合格扱いにしない。
- **公開中GASの現行ソース取得未完了**、本番反映なし。上記のテストはソース・ローカルブラウザ上の開発ブランチ版に限定。

## 追記：2026-10-25 ブラウザ通信断／再読み込み・保存失敗検証
- **新規実ブラウザ仮想APIテスト 1シナリオPASS**：[GitHub Actions](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40166575888)。抽選確定直後に応答を破棄、ブラウザが保持した同一 `drawId` で再確認、バックエンドの仮確定は一度だけ、復旧後は保留キー削除。テスト：`tests/gacha-browser-recovery.mjs`。
- **その後に追加した別シナリオ2件PASS**：[GitHub Actions](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40166696115)。①抽選応答欠落後に**ページを再読み込み**しても同一 `drawId` で結果復旧（重複消費ゼロ）、②ブラウザの `localStorage.setItem` が拒否された場合は**抽選APIへ一切アクセスせず**安全に停止。テスト：`tests/gacha-browser-reload-storage.mjs`。
- **全ネットワークをPlaywright内で横取り**する方式で、実本番URLと同じホスト名を模した画面を起動しただけ。本番Vercel・GAS・SheetsへのHTTPアクセスなし、実抽選なし。
- 前回合格の49件の論理/静的テスト、390px表示テスト、375px/430px表示テストは**今回再実行していない**。
- **重要**：実際の通信網・iOS/Androidブラウザ・GAS正本に接続した結合試験ではない。実機・本番GAS現物の検証は依然未合格/未取得。

## 追記：2026-10-25 HTTP 200エラー・不完全当選結果の実装修正
- `gacha-page.js`（**ガチャ専用featureブランチのみ**）の通信応答判定を修正。HTTPステータスに加え、`d.ok===true`を必須にした。
- GASから`draw`応答を受けた後は、元の`drawId`と`mode`が厳密一致し、景品名が空でなく、通算回数が正の安全な整数として解釈できる場合**だけ**、当選カード表示・未確認抽選ID削除を行う。
- 抽選確定に失敗した場合の案内は、`loadCatalog()`の再読み込み後も復帰・保持するよう修正。「前回の抽選結果を確認」から**同じdrawId**で安全に照合できる。
- 新規テスト`tests/gacha-browser-ack-contract.mjs`は実ブラウザの5ケース：①HTTP200で`ok:false`、②`drawId`不一致、③景品名欠落、④mode不一致、⑤整合した正常結果。すべて外部リクエスト完全モックで、実抽選・実参加者情報は不使用。
- **最初のテストは失敗**：エラー理由がカタログ再取得メッセージで上書きされる不具合を検出。該当UI部分を局所修正し、対象の新規5ケースを再試験。**修正後は5/5 PASS**。確認先：[GitHub Actions 40167510778](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40167510778)。過去合格済みテストは再実行せず。
- **未完了**：稼働中GAS現物との比較、実機でのガチャプレビュー操作、実際の本番APIとの連携試験。**本番main・固定URL・GAS・スプレッドシートは変更しない**。

## 追記：2026-10-26 当選レスポンス参加者照合・残回数検証（ガチャ専用）
- `gacha-page.js` の `execute()` に **participantIdと現在セッション参加者IDの一致チェック** を追加。`drawId`・種類・景品・通算回数に加え、`remaining` があれば非負の安全な整数であることを要求。不正・欠損した識別情報の結果を当選確定扱いにしない。
- 稼働中GASの旧形式との後方互換のため、`remaining` が省略されているときは誤った「残り0回」を表示せず、最新ガチャ情報の確認を案内。参加者ID自体は必須。
- 関連ブラウザ確認の内容を **10ケース** に更新（旧5ケース＋新5ケース）。追加は「別参加者」「参加者ID欠損」「残回数負値」「文字列通算回数」「残回数省略の旧形式正常応答」。
- テストが更新直後に不合格となった原因は、非同期カタログ再読込中に中間メッセージを検査したタイミング競合。テスト側を最終状態待ちに変更し、**関連10ケース全件PASS／失敗0件**：[GitHub Actions実行](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40253378572)。過去の独立テスト群は手動で再実行していない。
- 変更コミット：`gacha-page.js` は `921c05b9e5e418b8ab6abfe1239421b3eeb3578b`、テスト調整後は `e4f473781f6f22fb1198140cc863a58413c38510`。
- **未完了・守るべき境界**：GAS本番ソースは直接取得できていない。スマホ実機での豪華演出も未合格。公開用main、固定Vercel本番URL、本番Apps Script、本番スプレッドシート、抽選権利には変更を加えていない。ブランチの丸ごとマージは禁止。

## 追記：2026-10-26 ライト単調回転のユーザーフィードバック対応
- **ユーザーからの実機指摘**：「ライトがクルクル回るのが一方方向で演出効果を下げている」。
- 原因：`style.css` の `.gacha-stage.draw-active .stage-lights` が `beam-spin 1.15s linear infinite`（360度の一方向回転）。基本の抽選処理ではなく演出CSSの問題。
- **ガチャ専用ブランチのみ修正**：`gacha-deluxe-v21.css` に v2.1.1 の差分を追加。元の一方向回転を優先度の高いCSSで置き換え、青と金の2本の疑似要素ライトを逆方向に振り、前後に往復・交差・明暗変化。チャージ中とラキフェス時の輝きも段階変化。光線はガチャ画面内に収め、当選表示は覆わない設計。低モーション設定では停止。
- 新規テスト：`tests/gacha-crosslight-motion.mjs`、自動実行は `.github/workflows/gacha-crosslight-motion.yml`。**過去の合格済みテストは手動再実行していない**。
- 最初の新規テストはCSS疑似要素が `Element.getAnimations()` に列挙されないというテスト側の問題で失敗。テストを**ブラウザで実際にレンダリングされた7時点の回転角を検査する方式**に修正。
- **修正後PASS**：青・金・ベース光線が正逆両方向に振れ、青／金が開始時逆向き、デモスキップ正常、抽選APIへの送信なし、ブラウザ例外なし。低モーション設定でもアニメーション停止を確認。[GitHub Actions 40254202943](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40254202943)
- Vercelの新プレビュー `https://emuzii-mio-1st-web-v12-c0d143yns-gtgz8867jh-3139.vercel.app/gacha.html?deluxeDemo=1` は当該テスト修正コミットで READY を確認。**本番固定URLは変更していない**。
- **実機確認未完了**：ユーザーのiPhone/Androidによるライトの印象・演出スキップ・視認性は現時点で未合格。抽選権利・GAS・本番Sheet・景品は一切変更しない。

## 追記：2026-10-26 スマホ実機スクリーンショットの結果カード位置修正
- ユーザー提供のiPhone画像を目視確認：`UR・DEMO` の大きな当選結果カードが王宮クジラ筐体（表紙）中央を隠している。ユーザーコメント「表紙位置」に対応。
- **開発ブランチのみ**、`gacha-deluxe-v21.js` で `drawResultCard` を `gachaStage` の内部から直後の独立結果表示領域へ移動。**通常／ラキフェスの実結果とデモ結果の両方が同じ配置**。デモ完了時に結果領域をスクロール表示。
- `gacha-deluxe-v21.css` に独立カード `.mio-result-dock` のネイビーブルー＋ゴールド枠、スマホサイズ、画像・文字の自動収まりを追加。`[hidden]`は非表示維持。絵そのもの・抽選確率・残権利・GAS・本番データを変更していない。
- **対象の新規ブラウザテストのみ実行**：`tests/gacha-cover-result-position.mjs` で 375/390/430px の3幅、URデモ、元のクジラ画像保持、結果カードが舞台より下・舞台画像を覆わない、横はみ出しなし、抽選API 0件、JS例外0件を検証。3/3 PASS：[GitHub Actions](https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/actions/runs/40254868075)。過去に合格した他のケースは不要な再実行をしていない。
- Vercelプレビュー `https://emuzii-mio-1st-web-v12-leo1b9juy-gtgz8867jh-3139.vercel.app/gacha.html?deluxeDemo=1` はREADY。固定本番URLは`main`で変更していない。
- **実機表示結果は修正後未確認**。ユーザーから再度のiPhone/AndroidスクリーンショットまたはOK報告を受けるまで合格扱いにしない。
