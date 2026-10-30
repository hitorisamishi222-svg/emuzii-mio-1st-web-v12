-- Run once on the EXISTING gallery Postgres connection after approval.
-- Namespaced: does not modify participants, gacha, Web registrations or gallery tables.
CREATE TABLE IF NOT EXISTS mio_gacha_admin_credentials (
  credential_id TEXT PRIMARY KEY,
  public_key BYTEA NOT NULL,
  sign_count BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS mio_gacha_admin_challenges (
  id BIGSERIAL PRIMARY KEY,
  challenge_hash CHAR(64) NOT NULL UNIQUE,
  device_hash CHAR(64) NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('register','login')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mio_gacha_challenges_open
ON mio_gacha_admin_challenges (challenge_hash,expires_at) WHERE consumed_at IS NULL;
CREATE TABLE IF NOT EXISTS mio_gacha_admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES mio_gacha_admin_credentials(credential_id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mio_gacha_sessions_credential ON mio_gacha_admin_sessions (credential_id,expires_at);
