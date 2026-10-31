-- New bounded table in the EXISTING Neon registration database. NOT APPLIED.
-- No changes to existing participants, login, gacha entitlements, GAS or prize history.
BEGIN;
CREATE TABLE IF NOT EXISTS mio_device_recovery_requests (
 request_id uuid PRIMARY KEY,
 web_id varchar(32) NOT NULL CHECK (web_id ~ '^MIO-W-[a-f0-9]{24}$'),
 mio_id varchar(12) NOT NULL CHECK (mio_id ~ '^MIO-[0-9]{4}$'),
 display_name varchar(80) NOT NULL,
 token_binding char(64) NOT NULL CHECK (token_binding ~ '^[a-f0-9]{64}$'),
 state varchar(12) NOT NULL CHECK (state IN ('pending','approved','consumed','expired')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 approved_operation_id char(32) UNIQUE,
 approved_by varchar(24) CHECK (approved_by IN ('admin-code','admin-passkey')),
 approved_at timestamptz,
 redeemed_at timestamptz,
 CHECK (expires_at>requested_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_device_recovery_one_active
 ON mio_device_recovery_requests(web_id) WHERE state IN ('pending','approved');
CREATE INDEX IF NOT EXISTS mio_device_recovery_active_listing
 ON mio_device_recovery_requests(state,requested_at DESC);
CREATE INDEX IF NOT EXISTS mio_device_recovery_expiry
 ON mio_device_recovery_requests(expires_at);
COMMIT;
-- After owner review, define retention purge for expired/consumed rows with audit export.
