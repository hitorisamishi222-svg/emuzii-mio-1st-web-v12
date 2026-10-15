-- MIO v2.1 proposed PostgreSQL schema, DEV ONLY. Not executed against any database.
-- Existing MIO-ID, attendance, prizes and GAS data must be migrated by reviewed plan.
BEGIN;
CREATE TABLE IF NOT EXISTS mio_accounts_v21 (
 account_id uuid PRIMARY KEY,
 mio_id text NOT NULL,
 login_id text NOT NULL,
 password_hash text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT mio_id_not_blank CHECK (length(trim(mio_id)) > 0),
 CONSTRAINT login_id_format CHECK (login_id ~ '^[A-Za-z0-9_.!@-]{8,20}$')
);
CREATE TABLE IF NOT EXISTS mio_identifiers_v21 (
 identifier_key text PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES mio_accounts_v21(account_id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('mio_id','login_id','retired_login_id')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT identifier_lowercase CHECK (identifier_key = lower(identifier_key))
);
-- A retired login ID stays reserved to the same account, never reassigned.
CREATE INDEX IF NOT EXISTS mio_identifiers_account_idx ON mio_identifiers_v21(account_id);
CREATE TABLE IF NOT EXISTS mio_sessions_v21 (
 token_digest char(64) PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES mio_accounts_v21(account_id) ON DELETE CASCADE,
 device_label varchar(80) NOT NULL DEFAULT '端末',
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CONSTRAINT session_digest_hex CHECK (token_digest ~ '^[0-9a-f]{64}$'),
 CONSTRAINT session_expiry CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS mio_sessions_account_active_idx ON mio_sessions_v21(account_id,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS mio_gacha_balances_v21 (
 account_id uuid PRIMARY KEY REFERENCES mio_accounts_v21(account_id) ON DELETE RESTRICT,
 remaining integer NOT NULL DEFAULT 0 CHECK (remaining >= 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_gacha_draws_v21 (
 draw_id uuid PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES mio_accounts_v21(account_id) ON DELETE RESTRICT,
 request_key text NOT NULL,
 prize_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,request_key)
);
CREATE INDEX IF NOT EXISTS mio_gacha_draws_account_idx ON mio_gacha_draws_v21(account_id,created_at);
-- Application transaction: BEGIN; reserve idempotency key, UPDATE balance
-- SET remaining=remaining-1 WHERE account_id=$1 AND remaining>0 RETURNING remaining;
-- record outcome; COMMIT. On error ROLLBACK. Never consume rights in browser.
COMMIT;
