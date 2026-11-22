-- Additive migration. Apply only to the dedicated isolated registration DB
-- after the current schema is verified. Never removes or updates source rows.
CREATE TABLE IF NOT EXISTS mio_review_link_approvals_v1 (
  browser_id text PRIMARY KEY REFERENCES mio_name_review_v201(browser_id) ON DELETE RESTRICT,
  master_id text NOT NULL UNIQUE CHECK (master_id ~ '^MIO-[0-9]{4}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  operation_id text NOT NULL UNIQUE CHECK (operation_id ~ '^[a-f0-9]{32}$'),
  actor text NOT NULL CHECK (actor ~ '^(passkey|owner-instruction):[a-f0-9]{64}$'),
  review_fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (expires_at > created_at)
);
