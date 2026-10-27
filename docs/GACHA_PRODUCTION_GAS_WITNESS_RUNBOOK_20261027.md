# みお王宮ガチャ：本番GASの公開版・HEAD照合手順（2026-10-27）
 
> **読み取り専用。Draft PR #44のマージ・GASのデプロイ・Sheetsの編集は行わない。**
>
> この説明は**事前確認の手順**。現在の本番GASソース、公開バージョン番号は**未取得**であり、本番公開可とは判定していない。
 
## どのデータが必要か
 
同一の既存Apps Scriptプロジェクトについて、必ず次の3点を**読み取り専用**で取得する。
 
1. **Vercel本番環境のAPPS_SCRIPT_URLが実際に指す /exec デプロイ**のIDと公開バージョン番号。GitHubの `bridge.js` に書かれたデフォルトURLを、本番値だと推測してはいけない。
2. その公開バージョン番号を指定して取得した**全ソースファイル**（.gs、HTML、appsscript.jsonなど）。
3. 同じプロジェクトの現在の**HEAD全ソースファイル**。編集HEADと実公開版の内容が異なっても正常な場合がある。比較して報告する。
 
公開版のバージョン番号は、既存Apps Script編集画面の **デプロイ > デプロイを管理** の既存Webアプリからも確認できる。表示される実際のWebアプリURLが、Vercel本番の接続先と一致するか確認する。ここでは更新・編集・新しいデプロイを押さない。
 
## Google Apps Script APIを使ったGETだけの取得
 
既存のGoogleアカウントで**読み取り専用権限**を利用できる場合に限り、次のGETリクエストで取得する（POST、PUT、DELETEは使用しない）。
 
1. `GET https://script.googleapis.com/v1/projects/{scriptId}/deployments/{deploymentId}`
   - レスポンス `deploymentConfig.versionNumber` を記録。確認対象デプロイIDが本番Vercelの接続先と一致することを検証。
2. `GET https://script.googleapis.com/v1/projects/{scriptId}/content?versionNumber={versionNumber}`
   - **本番で使われる公開版ソース**。
3. `GET https://script.googleapis.com/v1/projects/{scriptId}/content`
   - **現在の編集HEADソース**（比較用）。
 
公式資料：
- https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/get
- https://developers.google.com/apps-script/api/reference/rest/v1/projects/getContent
 
OAuthの読み取り専用スコープは `script.deployments.readonly` と `script.projects.readonly`。このチャットの接続済みGoogle Driveには、現時点でApps Scriptの公開デプロイ情報と全ソースを取得する権限付き操作がない。**勝手に別アカウントや新しいGASプロジェクトを作成しない。**
 
## ファイルを外部公開しない
- 取得したJSONは**ローカルの非公開領域**だけに保存する。公開GitHub、PRコメント、Vercelデプロイ、通常のログにアップロードしない。
- トークン、Cookie、APPS_SCRIPT_SECRET、管理者用パスワード、参加者情報、シートの中身は含めず、共有しない。
- 現行ソースに埋め込まれたID・URL・設定を、検査結果に転載しない。
 
## 取得した後のオフライン事前検査
 
```bash
node tools/gacha-deployed-gas-witness.mjs \
  --deployment /private/deployment.json \
  --published /private/published-content.json \
  --head /private/head-content.json \
  --deployment-id "本番接続URLのデプロイID"
```
 
この検査は**静的な一部のガチャ安全条件**だけを確認する。コードを実行せず、GASに通信せず、シートや抽選履歴を変更しない。ツールの合格は**本番動作やマージの承認ではない**。
 
照合範囲：`doPost`、`gachaAction_`、`catalog_`、`draws_`、`wonDuplicateKeys_`、`participantCatalog_`、`gachaOpenState_` 等の定義、排他ロック、ラキフェスの確定Web4回条件、重複除外。HEADとの異なるファイル名のみ出力し、元のソース本文は出力しない。
 
## マージを止める条件
 
- 本番APPS_SCRIPT_URLの真の接続先か確認できない／公開版のversionNumber未取得。
- HEADしかなく、実際の公開バージョンを読めていない。
- ソース・マニフェストの一部が欠落、関数定義が重複、抽選ロックや重複除外条件がない。
- 本番`main` が保護済みSHAから変わったのに、PR #44を再評価していない。
- 既存の端末復旧・登録・皆勤・本番の参加者データ保護を確認できていない。
 
**現段階の結論：公開保留・Draft PR #44維持・本番のガチャ受付ONにはしない。**
