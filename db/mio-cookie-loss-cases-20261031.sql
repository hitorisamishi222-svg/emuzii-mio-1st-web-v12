-- Manual lost-cookie cases on EXISTING registration Postgres. REVIEW ONLY; NOT APPLIED.
-- Must NOT overwrite registration, authentication, gacha, attendance or draw history.
BEGIN;
CREATE TABLE IF NOT EXISTS mio_cookie_loss_cases (
 request_id uuid PRIMARY KEY,
 browser_proof_hash char(64) NOT NULL UNIQUE CHECK(browser_proof_hash ~ '^[a-f0-9]{64}$'),
 claimed_name varchar(40) NOT NULL,
 claimed_mio_id varchar(12),
 previous_browser varchar(10) NOT NULL
  CHECK (previous_browser IN ('safari','chrome','line','x','other','unknown')),
 state varchar(32) NOT NULL DEFAULT 'submitted'
  CHECK(state IN ('submitted','reviewing','manual_verification_required','closed')),
 identity_verified boolean NOT NULL DEFAULT false CHECK (identity_verified=false),
 login_enabled boolean NOT NULL DEFAULT false CHECK (login_enabled=false),
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 reviewed_at timestamptz,
 review_operation_id char(32),
 review_transition varchar(90)
);
CREATE INDEX IF NOT EXISTS mio_cookie_loss_review_idx ON mio_cookie_loss_cases(state,requested_at DESC);
CREATE TABLE IF NOT EXISTS mio_cookie_loss_audit (
 operation_id char(32) PRIMARY KEY CHECK(operation_id ~ '^[a-f0-9]{32}$'),
 request_id uuid NOT NULL REFERENCES mio_cookie_loss_cases(request_id),
 actor varchar(20) NOT NULL CHECK(actor IN ('admin-code','admin-passkey')),
 transition varchar(90) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
-- Manual retention / privacy purge review needed before rollout.
