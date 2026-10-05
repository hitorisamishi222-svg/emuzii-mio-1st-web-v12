翠央1周年 メンシプガチャ更新 v1.8.1

目的
- 通常ガチャ／ラキフェスの画面・抽選・履歴表示を本番Webへ実装
- リスナー側には emuzii 表記を出さない
- ラキフェスは総ガチャ権利5回以上で解放
- 景品名・レア度・確率・数量上限・画像URLは Google Sheets「emuzii_景品設定」で運営設定
- 二重保存は現在保留。既存データは削除しない

GitHubで上書きするファイル
index.html
style.css
app.js
gacha.js
api-gacha.js
api-register.js
api-status.js
api-checkin.js
bridge.js
package.json
vercel.json

mio-awakening.mp3 と mio-blue-bg.png は既存のままでOKです。

反映
既存リポジトリ hitorisamishi222-svg/emuzii-mio-1st-web-v12 の main に上書きして Commit。
Vercel は固定プロジェクト emuzii-mio-1st-web-v12 の Git 接続で自動反映します。
新規Vercelプロジェクトは作らないでください。

ガチャを実際に引ける条件
1. Web登録が承認済み
2. メンシプ確認が確認済み
3. 参加者ID照合済み
4. ガチャ権利が1回以上
5. 「emuzii_景品設定」で有効な景品を設定
6. 通常／ラキフェスそれぞれ、有効景品の確率合計が100.00%

ラキフェスは上記に加え、総ガチャ権利が5回以上必要です。
