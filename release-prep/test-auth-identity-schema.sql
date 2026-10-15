-- NEXT TEST ONLY. Requires community-test-schema.sql first.
-- This migration has not been applied to any database.
-- Never copy participant data or credentials from GAS/Sheets into TEST.
BEGIN;

CREATE TABLE IF NOT EXISTS next_test.test_auth_accounts (
  test_account_ref text PRIMARY KEY
    CHECK (length(test_account_ref) BETWEEN 16 AND 120),
  test_participant_ref text NOT NULL UNIQUE
    REFERENCES next_test.community_profiles(test_participant_ref) ON DELETE RESTRICT,
  account_state text NOT NULL DEFAULT 'active'
    CHECK (account_state IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- MIO-ID and login IDs share one namespace, so cross-type collisions are blocked.
-- Retired login IDs stay reserved to their original account and can be restored
-- only by that account. Login resolution must filter to state='current'.
CREATE TABLE IF NOT EXISTS next_test.test_auth_identifiers (
  identifier_key text PRIMARY KEY
    CHECK (identifier_key=lower(identifier_key)),
  display_value varchar(120) NOT NULL,
  test_account_ref text NOT NULL
    REFERENCES next_test.test_auth_accounts(test_account_ref) ON DELETE RESTRICT,
  identifier_type text NOT NULL CHECK (identifier_type IN ('mio_id','login_id')),
  identifier_state text NOT NULL DEFAULT 'current'
    CHECK (identifier_state IN ('current','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK (identifier_key=lower(display_value)),
  CHECK ((identifier_state='current' AND retired_at IS NULL) OR
         (identifier_state='retired' AND retired_at IS NOT NULL)),
  CHECK (identifier_type<>'mio_id' OR identifier_state='current'),
  CHECK (identifier_type<>'login_id' OR (
    char_length(display_value) BETWEEN 8 AND 20 AND
    display_value ~ '^[A-Za-z0-9_.!@-]+$' AND
    (CASE WHEN display_value ~ '[A-Z]' THEN 1 ELSE 0 END +
     CASE WHEN display_value ~ '[a-z]' THEN 1 ELSE 0 END +
     CASE WHEN display_value ~ '[0-9]' THEN 1 ELSE 0 END +
     CASE WHEN display_value ~ '[_!@.-]' THEN 1 ELSE 0 END) >= 3
  ))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_next_test_one_mio_id_per_account
  ON next_test.test_auth_identifiers(test_account_ref)
  WHERE identifier_type='mio_id' AND identifier_state='current';
CREATE UNIQUE INDEX IF NOT EXISTS idx_next_test_one_current_login_per_account
  ON next_test.test_auth_identifiers(test_account_ref)
  WHERE identifier_type='login_id' AND identifier_state='current';
CREATE INDEX IF NOT EXISTS idx_next_test_current_identifier_lookup
  ON next_test.test_auth_identifiers(identifier_key,identifier_type)
  WHERE identifier_state='current';

CREATE TABLE IF NOT EXISTS next_test.test_login_id_history (
  history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_account_ref text NOT NULL
    REFERENCES next_test.test_auth_accounts(test_account_ref) ON DELETE RESTRICT,
  previous_identifier_key text,
  next_identifier_key text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('registered','changed','restored')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_identifier_key IS NULL OR previous_identifier_key<>next_identifier_key)
);
CREATE INDEX IF NOT EXISTS idx_next_test_login_history_account
  ON next_test.test_login_id_history(test_account_ref,occurred_at DESC);

ALTER TABLE next_test.test_auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_auth_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_auth_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_auth_identifiers FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_login_id_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.test_login_id_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA next_test FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA next_test FROM PUBLIC;
-- No client policies are created. Server operations must resolve/modify IDs
-- transactionally and append history without changing the stable account link.
COMMIT;
