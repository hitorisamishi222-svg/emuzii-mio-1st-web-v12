# GAS v1.9.1 登録経路の本番適用前チェック（2026-10-21）

対象: 利用者がチャットで提供した Code.gs v1.9.1。これはエディタの現行HEADおよびデプロイv12とのバイト一致を証明しない。現時点では監査のみ。本番未変更。

## 確認済みの危険経路

1. doPost(register) 新規時: peopleByName.length===1 で linked に既存MIO-IDを代入し、承認待ち行のH/Kへ保存。本人確認前の自動接続を禁止する。
2. doPost(register) 同名時: 短いloginId一致で newAuth=status、L=確認済み、H/K=linked をセット。既存が承認済みなら新ブラウザも自動承認される。新ブラウザは必ず承認待ちにする。
3. autoLinkWebParticipant_: 名前の正規化一致だけでH/Kを書き換える。register再送・新規登録・その他actionの前処理から呼ばれる。未承認行に対して実行しない。
4. loginIdFormat_: 表示形式 MIO-ABCD-1234 を MIOABCD1234 として読み取る。プレフィックスを正規化する。
5. webNextRow_: A列のみで最終行を判定。A列空欄かつF列等にデータがある孤立行を上書きし得る。21列すべて空欄の行だけ使う。
6. doPost(status) と既存register再送: ensureLoginIdHeader_/ensureLoginIdForRow_ により読み取りで書き込みが起こる。既存行はread-onlyにする。
7. 登録完了応答: setValues直後に保存全項目を確認しない。本人ID・hash・承認待ち・未連携状態の読み戻し検証が必要。

## 安全適用条件

- 既存プロジェクトの編集HEADと既存デプロイv12のソース/バックアップを比較。チャット貼付コードと同一と仮定しない。
- GitHubの APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs は候補。Code.gsを丸ごと上書きせず、登録関連差分だけ適用。
- DeviceRecoveryV187.gs / GachaAdminV188.gs / BrowserAddV189Patch.gs と既存トリガー・script properties は保持。setup() 実行禁止。
- 既存参加者・皆勤・ガチャ・当選履歴・承認済み登録行を変更しない。新規登録は空行へ承認待ちのみ。
- 隔離テスト→バックアップ→既存デプロイURL維持の更新→読み戻し確認→最後に受付フラグを開く。失敗時は受付だけ停止。

## 現在の結論

静的監査完了。現行GAS v12ソース未検証のため本番公開・修正実施は保留。これは新たなコード全文コピー依頼ではない。
