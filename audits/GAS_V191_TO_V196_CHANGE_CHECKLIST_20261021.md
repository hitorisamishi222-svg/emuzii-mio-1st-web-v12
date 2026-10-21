# Code.gs v1.9.1 → v1.9.6 差分適用チェックシート

**読み取り比較のみ。現行Google Apps ScriptのHEAD/公開v12との差分ではない。**

GitHub候補ファイルの静的比較: v1.9.1 = 590行 / 30,462文字、v1.9.6 = 661行 / 33,832文字。追加関数は safeApprovedDuplicateBase_、appendBrowserCandidate_ の2つ。既存関数の削除なし。行数・文字数はリポジトリのファイル内容を基準。

## 変更対象

- loginIdFormat_: 保存済み表示形式 MIO-XXXX-XXXX の正規化
- webNextRow_: A列だけでなく21列すべてを見て空き行を選ぶ
- doPost: register時のみヘッダー初期化、既存登録の再送は読み取り専用、新規登録は本人確認待ち・MIO-ID未接続で保存と読み戻し
- autoLinkWebParticipant_: 承認待ち端末の名前一致による自動接続を遮断。将来的には承認済み端末に対する名前推定も廃止検討
- safeApprovedDuplicateBase_ / appendBrowserCandidate_: 追加候補。ただし既存BrowserAddV189Patch.gs等と同名関数の衝突がないことを確認してから採用

## 変更しない範囲

- checkinAction_、gachaAction_、setupGacha_、catalog_、draws_、当選履歴、端末復旧管理
- 既存の承認済みWeb登録、参加者台帳、皆勤31日、ガチャのシートデータ
- 既存デプロイURL、Script ID、secret、Vercel本番環境変数

## 必須の検証

1. 現行GAS HEAD、公開中v12、提供済みv1.9.1の相違を特定する。デプロイv12が実際に同一かは未証明。
2. 他の3つの .gs ファイルの同名関数/グローバル変数の衝突と実行順を確認する。
3. 隔離したGAS/Sheetsテストで、同名新端末は承認待ち、既存端末は維持、A列空白F列使用済みの行は保護、status読み取りで書き込みゼロ、再送の冪等性を確認する。
4. 実際のGASデプロイURLは維持して新バージョンに更新する。受付フラグは実通信テスト合格後に限り有効化。

**適用判定: HOLD** — 公開中v12のソース未照合のため、本番に貼り付け・保存・デプロイしない。
