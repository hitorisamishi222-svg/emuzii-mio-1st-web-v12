-- STAGING ONLY. Grant issuance requires a successfully verified WebAuthn UV
-- assertion and occurs in the same transaction as challenge consumption.
CREATE TABLE IF NOT EXISTS mio_verified_operation_grants_v205 (
  grant_hash char(64) PRIMARY KEY CHECK(grant_hash ~ '^[a-f0-9]{64}$'),
  mio_id text NOT NULL REFERENCES mio_passkey_accounts_v204(mio_id),
  actor_browser_id text NOT NULL CHECK(actor_browser_id ~ '^MIO-W-[a-f0-9]{24}$'),
  actor_token_hash char(64) NOT NULL CHECK(actor_token_hash ~ '^[a-f0-9]{64}$'),
  operation text NOT NULL CHECK(operation IN ('link-browser','revoke-browser','list-browsers')),
  target_browser_id text,
  method text NOT NULL DEFAULT 'webauthn-uv' CHECK(method='webauthn-uv'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT mio_v205_target_check CHECK (
    (operation='list-browsers' AND target_browser_id IS NULL)
    OR (operation IN ('link-browser','revoke-browser')
        AND target_browser_id ~ '^MIO-W-[a-f0-9]{24}$')
  )
);
CREATE INDEX IF NOT EXISTS mio_verified_operation_grants_v205_expiry_idx
  ON mio_verified_operation_grants_v205(expires_at);
-- Must periodically remove consumed and expired grants. Never store raw grants.
-- The actorBrowserId/actorTokenHash must be derived from validated backend
-- session, not from a caller-controlled HTTP body.
