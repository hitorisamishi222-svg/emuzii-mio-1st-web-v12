-- Proposed isolated schema. NOT APPLIED to the EXISTING Neon database.
-- No mutation of legacy MIO-ID, GAS, gacha entitlements, draw/attendance history.
BEGIN;
CREATE TABLE IF NOT EXISTS mio_event_email_subjects (
 subject_id uuid PRIMARY KEY,
 email_lookup char(64) NOT NULL UNIQUE CHECK(email_lookup ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_events (
 event_id varchar(40) PRIMARY KEY CHECK(event_id ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
 policy varchar(12) NOT NULL CHECK(policy IN ('open','invite','member')),
 state varchar(12) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','closed')),
 opens_at timestamptz NOT NULL,
 closes_at timestamptz NOT NULL,
 CHECK(closes_at>opens_at)
);
CREATE TABLE IF NOT EXISTS mio_event_invites (
 event_id varchar(40) NOT NULL REFERENCES mio_events(event_id),
 invite_hash char(64) NOT NULL CHECK(invite_hash ~ '^[a-f0-9]{64}$'),
 reserved_for uuid REFERENCES mio_event_email_subjects(subject_id),
 used_by uuid REFERENCES mio_event_email_subjects(subject_id),
 used_at timestamptz,
 PRIMARY KEY(event_id,invite_hash)
);
CREATE TABLE IF NOT EXISTS mio_event_verified_members (
 event_id varchar(40) NOT NULL REFERENCES mio_events(event_id),
 subject_id uuid NOT NULL REFERENCES mio_event_email_subjects(subject_id),
 verified boolean NOT NULL DEFAULT false,
 verified_by varchar(80),
 verified_at timestamptz,
 PRIMARY KEY(event_id,subject_id)
);
CREATE TABLE IF NOT EXISTS mio_event_passes (
 pass_id uuid PRIMARY KEY,
 event_id varchar(40) NOT NULL REFERENCES mio_events(event_id),
 subject_id uuid NOT NULL REFERENCES mio_event_email_subjects(subject_id),
 state varchar(12) NOT NULL CHECK(state IN ('active','revoked')),
 issued_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,subject_id)
);
CREATE INDEX IF NOT EXISTS mio_event_pass_lookup
 ON mio_event_passes(subject_id,event_id,state);
COMMIT;
-- Open-event pass = entry into non-privileged content only.
-- Never treat pass_id as a bearer credential; access must check signed verified-email cookie.
-- Invite is one-time and atomically consumed. Members need preverified eligibility.
-- Email verification delivery/migration and anti-abuse limits remain separate gates.
