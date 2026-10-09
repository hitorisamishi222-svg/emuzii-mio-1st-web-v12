-- NEXT TEST ONLY. Incremental migration; requires community-test-schema.sql first.
-- Do not apply to the production GAS, Sheets, or any live database.
-- Run ONLY against a separately provisioned TEST PostgreSQL database.
-- Admin/service roles should be least-privilege, distinct from production.
BEGIN;

CREATE TABLE IF NOT EXISTS next_test.test_device_sessions (
  test_participant_ref text PRIMARY KEY
    REFERENCES next_test.community_profiles(test_participant_ref) ON DELETE RESTRICT,
  active_device_id text NOT NULL CHECK (length(active_device_id) BETWEEN 3 AND 120),
  generation bigint NOT NULL CHECK (generation >= 1),
  session_digest char(64) NOT NULL CHECK (session_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS next_test.test_transfer_approvals (
  transfer_approval_id text PRIMARY KEY
    CHECK (length(transfer_approval_id) BETWEEN 16 AND 120),
  test_participant_ref text NOT NULL
    REFERENCES next_test.community_profiles(test_participant_ref) ON DELETE RESTRICT,
  verified_operator_ref text NOT NULL CHECK (length(verified_operator_ref) BETWEEN 3 AND 120),
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > verified_at),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (consumed_at IS NULL OR consumed_at >= verified_at)
);
CREATE INDEX IF NOT EXISTS idx_next_test_transfer_pending
  ON next_test.test_transfer_approvals(test_participant_ref,expires_at)
  WHERE consumed_at IS NULL;

-- Synthetic sample history is participant-keyed, NEVER device-keyed.
-- Real attendance, gacha and gallery history must NOT be copied into TEST.
CREATE TABLE IF NOT EXISTS next_test.test_participant_history (
  synthetic_event_id text PRIMARY KEY
    CHECK (length(synthetic_event_id) BETWEEN 3 AND 120),
  test_participant_ref text NOT NULL
    REFERENCES next_test.community_profiles(test_participant_ref) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('attendance','gacha','gallery')),
  synthetic_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_next_test_history_participant
  ON next_test.test_participant_history(test_participant_ref,created_at DESC);

CREATE TABLE IF NOT EXISTS next_test.test_device_transfer_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_participant_ref text NOT NULL
    REFERENCES next_test.community_profiles(test_participant_ref) ON DELETE RESTRICT,
  transfer_approval_id text NOT NULL,
  previous_generation bigint NOT NULL,
  next_generation bigint NOT NULL,
  verified_operator_ref text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (next_generation=previous_generation+1)
);
-- Never store a raw cookie, session token, login ID or full private identifier
-- in the audit table. Verify the operator in server-side TEST authorization.

ALTER TABLE next_test.test_device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_device_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_transfer_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_transfer_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_participant_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_participant_history FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_device_transfer_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_device_transfer_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA next_test FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA next_test FROM PUBLIC;
-- No CREATE POLICY grants: fail closed until dedicated TEST backend is designed.
-- Service transactions MUST lock the approval and profile in a single transaction,
-- atomically mark the approval consumed, compare-and-swap generation,
-- rotate session_digest, and append an audit row. Rollback on any error.
COMMIT;
