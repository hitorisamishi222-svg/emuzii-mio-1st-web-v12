# みお：ChatGPTだけで既存GASを確認する運用案（2026-11-07）

## 状況（この調査時点）
- 本番Vercelの `APPS_SCRIPT_URL` は既存 `script.google.com/macros/s/.../exec` のWebアプリURLである。Deployment IDは含むが、Script project IDとは別。
- 既存Google Drive接続から本番スプレッドシートと既存タブ・見出しは**読み取り専用で確認済み**。
- 既存本番スプレッドシートに監査タブ `emuzii_Web管理操作履歴` は存在せず、`emuzii_ガチャ付与履歴` J1は空欄（`Web操作ID` 未設置）。書込解除は禁止。
- 現行GASの編集 HEAD・デプロイされた版のソースは直接読めていない。過去バックアップやGitHub候補を本番正本と誤認しない。
- 2026-10-23の引継ぎ資料 `next_action_20261023.md` に既存本番Apps Scriptの**ScriptプロジェクトID候補**が残っており、ハッシュを `HISTORICAL_SCRIPT_ID_SHA256` として固定した。ただし今の本番Webアプリのデプロイと同一プロジェクトかは**未照合**。名前だけで確定しない。
- 2アカウントのGoogle Drive `files.get` ではこのScript IDを読めず、404。Apps Script APIのコード読み取りには別OAuth権限が必要であり、Driveの404だけで存在しないとは断定しない。
- GASがスプレッドシート・バインド型の場合、Google DriveにScript本体は表示されない。Google公式: https://developers.google.com/apps-script/guides/bound
- CI（GitHub PR #87）は開発候補の検証であり、本番接続成功の証拠ではない。

## 推奨A：Workは完全に単発の「公開バージョン番号だけ」確認

**Workは継続開発・コード比較・一括確認には使わない。** このチャットがすべての進捗管理とテストを実施する。

必要な場合に限り、2026-10-23の引継ぎで記録された既存プロジェクトのURLを**画面で1回だけ**開き、`デプロイ > デプロイを管理` の対象Webアプリが表示する `versionNumber` だけ取得させる。**Script ID候補とVercel接続先が一致するか、その画面の管理デプロイIDで確認できない場合は「未確認」で即終了する。**

Workに渡す単発の指示：
> 以前の既存GASプロジェクトのリンクを開き、「デプロイを管理」を表示してください。Vercel本番のWebアプリ接続先と同じデプロイIDを確認できる場合だけ、その公開バージョン番号を報告してください。編集・保存・デプロイ・設定変更・新規作成は一切しないでください。対象が特定できなければそのまま終了してください。ほかの作業へ進まないでください。

Workが失敗しても繰り返さず、このチャットに戻す。**現時点ではWork使用は不要で、操作実行もしていない。**

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

## このチャットで実行する再現可能なローカル照合

- `tools/mio-gas-connection-target-audit.mjs`: Vercel本番の接続先をSHA-256指紋で固定し、誤接続先ならSTOP。版は未照合として扱う。
- `tools/mio-gas-deployed-version-audit.mjs`: Apps Script APIの読取専用 `projects.deployments.get` と `projects.getContent` の応答を**ログに漏らさず照合**。対象のScript ID・デプロイID・公開versionNumber・コードHEADとの差分検査。API未取得ならSTOP・未確認。いかなる結果も `publicationAllowed:false`。
- いずれも**ローカル/開発用**の監査であり、Vercel本番設定もスプレッドシートも変更しない。実コードはGitへ追加せず、秘匿した現行コードはCLI実行時だけ渡す。

公式出典:
- https://developers.google.com/apps-script/guides/bound
- https://developers.google.com/apps-script/api/reference/rest/v1/projects/getContent
- https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/list
