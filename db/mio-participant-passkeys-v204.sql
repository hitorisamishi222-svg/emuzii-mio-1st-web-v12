-- STAGING ONLY. Isolated participant database; NEVER gallery-admin credentials.
CREATE TABLE IF NOT EXISTS mio_passkey_accounts_v204 (
  mio_id text PRIMARY KEY CHECK (mio_id ~ '^MIO-[0-9]{4}$'),
  user_handle bytea NOT NULL UNIQUE CHECK (octet_length(user_handle)=32),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_passkey_challenges_v204 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mio_id text NOT NULL REFERENCES mio_passkey_accounts_v204(mio_id),
  browser_token_hash char(64) NOT NULL CHECK (browser_token_hash ~ '^[a-f0-9]{64}$'),
  challenge_hash char(64) NOT NULL CHECK (challenge_hash ~ '^[a-f0-9]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('register','authenticate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS mio_passkey_challenge_lookup_v204
 ON mio_passkey_challenges_v204(mio_id,browser_token_hash,challenge_hash,purpose)
 WHERE used_at IS NULL;
CREATE TABLE IF NOT EXISTS mio_passkey_credentials_v204 (
  credential_id text PRIMARY KEY,
  mio_id text NOT NULL REFERENCES mio_passkey_accounts_v204(mio_id),
  public_key bytea NOT NULL,
  sign_count bigint NOT NULL CHECK(sign_count >= 0),
  transports text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS mio_passkey_credential_by_user_v204
 ON mio_passkey_credentials_v204(mio_id) WHERE revoked_at IS NULL;
-- Scheduled sweeper must delete expired/used challenges.
-- Do NOT enable participant login until bootstrap approval, rate limits,
-- real WebAuthn assertion checks, origin/CSRF, and end-to-end tests pass.
