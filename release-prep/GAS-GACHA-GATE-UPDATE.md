# ガチャ受付スイッチ更新手順（スマホ用）

対象ブランチ: `release/v2-gacha-gate-connected`  
対象PR: #24（Draftのまま）  
差分: [GachaGateOnlyV188.patch.gs](./GachaGateOnlyV188.patch.gs)

## 現在確認できていること

- 既存の `doPost` は抽選リクエストを `gachaAction_` に渡している。
- 共有された現行コードの録画では、`gachaAction_` が `gachaOpenState_(ss)` の受付状態を見て、受付OFFなら抽選を拒否する。
- 既存の `setupGachaAdminV188_()` は管理画面の I16:L25 に書き込む。既存データ領域と重なる可能性があるため、今回は使わない。
- 今回の差分は管理画面のA列末尾に受付ラベルを作り、B列に2つのチェック欄を追加する。実行のたびに両方OFFにする。
- `setup()` は実行しない。

## Apps Scriptで行う操作

既存プロジェクト「emuzii 翠央1周年 Web連携 v1.2」を開き、次の順で操作してください。

1. 左のファイル一覧で **GachaAdminV188.gs** を開く。
2. `function gachaOpenState_(ss)` を探し、その関数だけを差分ファイルの同名関数に置き換える。
3. 差分ファイルの `setupGachaGateOnlyV188_()` と `gachaGateRowsSafeV188_()` を、ファイル末尾へ追加する。既存の `setupGachaAdminV188_()` や他の関数は消さない。
4. 保存する。
5. 上部の関数選択欄で **setupGachaGateOnlyV188_** を選び、実行を1回押す。初回のGoogle承認が出たら承認する。**setup / setupGachaAdminV188_ は選ばない。**
6. 管理画面シートの一番下を開き、「メンシプガチャ受付」「ラキフェス受付」の2項目がどちらも未チェック（OFF）であることを確認する。

差分のファイルはGitHub上で開けます:  
https://github.com/hitorisamishi222-svg/emuzii-mio-1st-web-v12/blob/release/v2-gacha-gate-connected/release-prep/GachaGateOnlyV188.patch.gs

## 保存後のデプロイと確認

上の差分を保存したあと、Apps Scriptの「デプロイ」→「デプロイを管理」から既存ウェブアプリを編集し、新しいバージョンを選んで更新します。新規デプロイは作らず、既存の `/exec` URL を維持してください。

受付2項目をOFFのまま、実環境で次を確認してください。

- ガチャ一覧が空、または受付停止表示になる。
- 抽選を送っても新しい抽選結果が作られない。
- 既存のチェックイン等、ガチャ以外の機能が壊れていない。

Vercelプレビューは本番APIを遮断しているため、プレビューの503はGAS反映確認には使えません。現時点でフロントエンドPR #24はDraftのまま、本番サイトはメンテナンス表示を維持します。GAS差分の反映・実環境確認後に、公開準備を続けます。
