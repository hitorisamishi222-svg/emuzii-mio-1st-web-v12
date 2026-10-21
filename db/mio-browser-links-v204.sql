-- STAGING ONLY: apply to an isolated registration database, not GAS sheets.
-- Caller must authenticate both browser token and participant ownership.
CREATE TABLE IF NOT EXISTS mio_browser_links_v204 (
  browser_id text PRIMARY KEY CHECK (browser_id ~ '^MIO-W-[a-f0-9]{24}$'),
  mio_id text NOT NULL CHECK (mio_id ~ '^MIO-[0-9]{4}$'),
  token_hash char(64) NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  verified_method text NOT NULL CHECK (verified_method IN ('webauthn-uv','approved-device-pairing')),
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT mio_browser_revocation_state_v204 CHECK ((status='revoked')=(revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mio_browser_links_v204_active_idx
  ON mio_browser_links_v204(mio_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS mio_browser_link_audit_v204 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mio_id text NOT NULL,
  browser_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('linked','revoked')),
  actor_browser_id text,
  verification_method text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mio_browser_link_audit_v204_account_idx
  ON mio_browser_link_audit_v204(mio_id,occurred_at DESC);
-- Do not run in production without explicit approval, backup, real DB tests
-- and verified no impact on legacy participant, attendance or gacha state.
