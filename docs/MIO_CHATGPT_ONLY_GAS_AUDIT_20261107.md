# みお：ChatGPTだけで既存GASを確認する運用案（2026-11-07）

## 状況（この調査時点）
- 本番Vercelの `APPS_SCRIPT_URL` は既存 `script.google.com/macros/s/.../exec` のWebアプリURLである。Deployment IDは含むが、Script project IDとは別。
- 既存Google Drive接続から本番スプレッドシートと既存タブ・見出しは**読み取り専用で確認済み**。
- 既存本番スプレッドシートに監査タブ `emuzii_Web管理操作履歴` は存在せず、`emuzii_ガチャ付与履歴` J1は空欄（`Web操作ID` 未設置）。書込解除は禁止。
- 現行GASの編集 HEAD・デプロイされた版のソースは直接読めていない。過去バックアップやGitHub候補を本番正本と誤認しない。
- GASがスプレッドシート・バインド型の場合、Google DriveにScript本体は表示されない。Google公式: https://developers.google.com/apps-script/guides/bound
- CI（GitHub PR #87）は開発候補の検証であり、本番接続成功の証拠ではない。

## 推奨A：ChatGPT WorkのCloud Browserで既存Apps Script管理画面を直接確認
**コード貼付・本番シート編集・新規Apps Script作成なし**。
1. 今ある本番スプレッドシートを、所有者/編集可能アカウントで開く。
2. `拡張機能 > Apps Script` からスプレッドシートに紐づいた既存プロジェクトを開く（新規プロジェクトを作らない）。見つからなければ変更せず記録する。
3. プロジェクト名、Script ID、ファイル名一覧を確認。個人識別情報/secretは報告しない。
4. `デプロイ > デプロイを管理` で実在するWebアプリ公開版の `deploymentId` を確認し、Vercel本番 `APPS_SCRIPT_URL` の `/macros/s/<deploymentId>/exec` と厳密一致するデプロイを特定する。
5. そのデプロイの `versionNumber` を読み、編集 HEAD と公開版をそれぞれ取得する。Web UIで版ソースの参照機能が足りない場合は、読み取り専用Apps Script APIを利用する（下記B）。差分とハッシュのみ報告し、秘密鍵・全ソースを外部出力しない。
6. PR #87候補で保持すべき元GAS 38,180文字・FNV32 `c2fa0940` が、本番 **HEAD ではなく対象の公開版** と一致するか確認する。異なれば公開作業をSTOPし、原因を調べる。
7. GAS保存、バージョン作成、再デプロイ、スプレッドシート書込、権限変更は行わない。既存メンバー権利/10月皆勤/抽選記録を維持。

## 推奨B：Apps Script APIによる以後の完全自動・読み取り専用監査
Google公式API:
- デプロイ一覧 `GET https://script.googleapis.com/v1/projects/{scriptId}/deployments`
- コード HEAD `GET https://script.googleapis.com/v1/projects/{scriptId}/content`
- 公開版コード `GET https://script.googleapis.com/v1/projects/{scriptId}/content?versionNumber={publishedVersion}`

必要なGoogle OAuthスコープは `script.projects.readonly` と `script.deployments.readonly`。**現在接続済みのGoogle DriveアプリだけではApps Script APIのこれらの権限が得られない。** 既存プロジェクトのScript ID、明示的なユーザー認証許可、対応したApps Script APIクライアントまたはWorkブラウザが必要。WebアプリのdeploymentIdやBRIDGE_SECRETをScript APIのOAuthトークンと取り違えない。

## 読取専用「管理Read」実接続確認
対象Vercelの環境変数 `APPS_SCRIPT_URL` と `APPS_SCRIPT_SECRET` を**安全な実行環境内だけ**で使い、既存GASへ `{action:'webAdminOpsRead',secret:<server-held-secret>}` のPOSTを送る。戻り値は `ok` と必要な型、`schemaReady` などの**集計フラグだけ**チェックする。権限確認・HTTPS保護のないブラウザURLやGitHub Actionsログに秘密鍵を出さない。実データ一覧（氏名・残回数等）をログに残さない。

`invalid identity` が返れば公開GASに管理用分岐がない可能性が高いが、実コードの版照合なしで断定しない。`unauthorized` なら共有鍵/実行環境の照合を優先する。いずれも本番のユーザー行・ガチャ権利の書込を伴わない。

## 本番更新の解除条件（現時点では未達）
- [ ] 本番GAS公開デプロイID・versionNumber とソースを実証
- [ ] 編集HEADと公開版のコード差分を保存（秘密情報は安全保護）
- [ ] 既存URL・既存デプロイのままで管理Readが成功
- [ ] 監査タブの存在と見出し10列、付与履歴J1のWeb操作IDを明示的なユーザー承認の上で確認/準備
- [ ] 上記が揃って初めて、別の明示承認のもとで限定の本番書込を検討

## ChatGPT Workに引き継ぐ指示
「みお1周年の既存Googleスプレッドシートを開き、拡張機能→Apps Scriptへ進む。**閲覧だけ**で、既存WebアプリのデプロイID・公開バージョンと現在の編集HEADの内容を比較し、本番Vercelに設定されたAPPS_SCRIPT_URLとの一致を確認する。既存の本番URL・GAS・Sheet・皆勤/権利/当選履歴を変更しない。閲覧権限や認証が必要なら操作を止めて知らせる。Secret・参加者個人情報・ソース全文はチャットに貼らず、結果だけ報告する。」

公式出典:
- https://developers.google.com/apps-script/guides/bound
- https://developers.google.com/apps-script/api/reference/rest/v1/projects/getContent
- https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/list
