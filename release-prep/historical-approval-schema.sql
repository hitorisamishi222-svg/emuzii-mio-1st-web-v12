-- Additive ledger. Historical operator approval is not a browser credential.
CREATE TABLE mio_historical_approvals_v1 (
  browser_id text PRIMARY KEY REFERENCES mio_name_review_v201(browser_id) ON DELETE RESTRICT,
  master_id text NOT NULL UNIQUE CHECK (master_id ~ '^MIO-[0-9]{4}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  operation_id text NOT NULL UNIQUE CHECK (operation_id ~ '^[a-f0-9]{32}$'),
  actor text NOT NULL CHECK (actor ~ '^(passkey|owner-instruction):[a-f0-9]{64}$'),
  review_fingerprint char(64) NOT NULL CHECK (review_fingerprint ~ '^[a-f0-9]{64}$'),
  approved_at timestamptz NOT NULL DEFAULT now(),
  member_confirmed boolean NOT NULL CHECK (member_confirmed IS TRUE)
);
