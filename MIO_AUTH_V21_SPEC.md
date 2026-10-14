# MIO v2.1 アカウント統合・ログイン復旧仕様（開発版）
更新: 2026-10-15 / 本番反映禁止・設計と開発準備のみ

## 確定事項
- A案: 複数端末同時ログインを許可。端末追加で旧端末を自動失効させない。
- 登録時に発行する MIO-ID は既存運用との互換を維持する固定の識別子。内部 immutable account_id を全履歴の正本キーとする。
- 自由設定 login_id は任意で登録・変更可能。MIO-ID / login_id のどちらで照会しても同じ account_id を解決し、参加者データは複製しない。
- login_id の条件: 8〜20文字、ASCII英大文字・英小文字・数字・記号（許可文字 _ - . ! @）の4区分から3種類以上。先頭末尾の空白不可、Unicode類似文字は不許可。大小文字を区別するかは一意性と認証UIで一貫させる（推奨: ログインIDは小文字化一意判定し表示ケースは保持）。
- ID変更には直近のパスワード/パスキー再認証が必要。旧 login_id はログイン無効、既存履歴・セッション・MIO-IDは保持。変更履歴は管理者監査ログに記録し、旧IDの即時再取得は制限。
- 認証は MIO-ID または login_id ＋ パスワード、または登録済みパスキー。ColorSing名は表示・照合補助であり秘密認証要素にはしない。
- Google/ChromeパスワードマネージャーとAppleパスワードでの自動保存・入力を標準HTML autocomplete=username/current-password/new-passwordで支援。保存はブラウザ側の任意操作。
- パスキーはWebAuthnのチャレンジ・レスポンスをサーバーで検証し、アカウントと紐付ける。ブラウザの対応判定だけでは登録完了とみなさない。
- パスワードはArgon2id等の適切な一方向ハッシュとソルトで保存し、平文・可逆暗号・スプレッドシートのセルに保存しない。
- ログイン試行制限、セッション失効、端末一覧・個別ログアウト、認証操作の監査ログを用意。端末の表示名は識別補助であり認証根拠ではない。
- パスワード紛失かつパスキーなしの場合のみ管理者による本人確認で復旧。自己申告のIDと名前だけでは復旧しない。
- 皆勤（1日最大2回）、ガチャ権利・抽選、当選履歴、Fan Art は account_id 単位でサーバー側原子的に更新。端末数が増えても上限は増えない。

## データモデル
accounts(account_id PK, mio_id UNIQUE NOT NULL, display_name, status, created_at)
login_identifiers(account_id FK UNIQUE, login_id UNIQUE, login_id_canonical UNIQUE, updated_at)
password_credentials(account_id PK FK, password_hash, changed_at)
webauthn_credentials(credential_id PK, account_id FK, public_key, sign_count, transports, created_at, last_used_at)
sessions(session_id PK, account_id FK, device_label, created_at, expires_at, revoked_at)
account_audit(id PK, account_id FK, event_type, timestamp, metadata_without_secrets)
既存の参加者レコードは移行マッピング表で account_id に一対一対応させる。重複MIO-IDは自動統合せず要確認。

## API契約（未実装）
POST /api/auth/login: 識別子・パスワード → 安全なHttpOnly Secure SameSite Cookie
POST /api/auth/logout; GET /api/auth/sessions; DELETE /api/auth/sessions/:id
POST /api/account/login-id: 再認証 + 新ID、ユニーク制約下で原子的に更新
POST /api/auth/passkeys/options, /verify: WebAuthn登録・認証のサーバー検証
POST /api/auth/recovery-request: 管理者確認が必要な場合のみ
全書込APIでCSRF対策・レート制限・権限チェックを実装。

## 本番公開前の必須試験
1. 既存MIO-IDと新login_idが同じ account_id・全履歴を返す
2. login_id変更後も皆勤・当選履歴が変化しない
3. iPhoneとAndroidの同時ログイン、片側ログアウトが他方に影響しない
4. 2端末同時ガチャ押下でも抽選権が二重消費・二重当選しない
5. パスキー登録・再ログイン・紛失・失効・未対応端末の代替手段
6. パスワードマネージャー自動入力と認証失敗時の安全な表示
7. 既存GAS・スプレッドシートに変更を加えない隔離環境での移行リハーサル

## 作業制限
このブランチでは画面・仕様・隔離テストのみ。本番main・本番Vercel・GAS・参加者データは明示承認まで変更しない。
