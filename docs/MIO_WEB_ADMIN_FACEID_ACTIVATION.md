# みおWeb管理 Face ID・パスキー 導入手順

## 状態
**プレビュー実装／本番未接続。** 既存のガチャON/OFF、MIO-ID、登録、抽選、付与、当選履歴の本番データを変更しない。
PR #54 の統合Web管理画面に、Face ID 登録とログインが含まれる。

## 利用時の流れ
1. iPhoneのSafariで既存の管理画面を開く。
2. 初回のみ既存の管理者コードを入力して「この端末のFace IDを登録」を押し、iPhoneの本人認証を完了する。
3. 次回以降は「Face IDでログイン」。本人認証後にガチャON/OFF、承認、回数付与が利用可能。
4. パスキーが使えない端末では従来の管理者コードで入れる。

## 本番を有効にする前に
- 既存 Postgres（`GALLERY_DATABASE_URL`）で`sql/gacha-admin-passkey-isolated.sql`の3テーブルを作成し、他データを変更しないことを確認する。
- 現行の`MIO_GACHA_WEB_KEY_SHA256`と既存Web管理者コードは保護し、新規に生成・掲載しない。
- `MIO_GACHA_PASSKEY_RELEASE=verified-gacha-passkey-20261030` を本番Vercel環境に設定し、同じ既存Vercelプロジェクトを再デプロイする。
- 管理者端末だけで初回登録・Face IDログイン・12時間後の期限切れ・従来コードでの復旧を実機確認する。
- `MIO_GACHA_ADMIN_OPS_RELEASE`は既存GAS管理操作との照合が終わるまで有効化しない。
- iOSのFace IDはWebAuthn（パスキー）が呼び出す端末本人認証であり、サーバーが顔画像やFace ID情報を受け取ることはない。
- 既存の`/gacha.html`・`/api/gacha`は一切変更せず、公開URLを維持する。

## 安全確認
`tests/mio-gacha-faceid-passkey.test.mjs`と`tests/mio-web-admin-ops.test.mjs`で管理者コードのフォールバック、既存ガチャルート、認証セッションのCookie、他データ非更新などを検証。
実機での本番Face ID登録・ログインは未検証。未検証のまま完成・公開済みとは言わない。
