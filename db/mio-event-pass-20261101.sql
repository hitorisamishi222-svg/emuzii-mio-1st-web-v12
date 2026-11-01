-- Phase2E+2F isolated candidate tables: NOT APPLIED to existing Neon.
-- NEVER alter existing MIO identities, gacha, attendance or draw history.
BEGIN;

-- Ten-minute OTP challenges. No email address or OTP is stored as plaintext.
CREATE TABLE IF NOT EXISTS mio_event_email_challenges (
 challenge_id uuid PRIMARY KEY,
 email_lookup char(64) NOT NULL CHECK (email_lookup ~ '^[a-f0-9]{64}$'),
 ip_lookup char(64) NOT NULL CHECK (ip_lookup ~ '^[a-f0-9]{64}$'),
 browser_hash char(64) NOT NULL CHECK (browser_hash ~ '^[a-f0-9]{64}$'),
 code_digest char(64) NOT NULL CHECK (code_digest ~ '^[a-f0-9]{64}$'),
 state varchar(16) NOT NULL CHECK (state IN ('pending','verified','locked','send_failed','superseded')),
 attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 verified_at timestamptz,
 CHECK (expires_at > requested_at)
);
CREATE INDEX IF NOT EXISTS mio_event_email_rate_email
 ON mio_event_email_challenges(email_lookup,requested_at DESC);
CREATE INDEX IF NOT EXISTS mio_event_email_rate_ip
 ON mio_event_email_challenges(ip_lookup,requested_at DESC);
CREATE INDEX IF NOT EXISTS mio_event_email_browser_pending
 ON mio_event_email_challenges(browser_hash,requested_at DESC);

-- UUID represents a verified email account, NOT a unique physical person or MIO-ID.
CREATE TABLE IF NOT EXISTS mio_event_email_subjects (
 subject_id uuid PRIMARY KEY,
 email_lookup char(64) NOT NULL UNIQUE CHECK (email_lookup ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mio_events (
 event_id varchar(40) PRIMARY KEY CHECK (event_id ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
 policy varchar(12) NOT NULL CHECK (policy IN ('open','invite','member')),
 state varchar(12) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','closed')),
 opens_at timestamptz NOT NULL,
 closes_at timestamptz NOT NULL,
 CHECK (closes_at > opens_at)
);

-- Each invitation can be used only once, for one event and one verified email subject.
CREATE TABLE IF NOT EXISTS mio_event_invites (
 event_id varchar(40) NOT NULL REFERENCES mio_events(event_id),
 invite_hash char(64) NOT NULL CHECK (invite_hash ~ '^[a-f0-9]{64}$'),
 reserved_for uuid REFERENCES mio_event_email_subjects(subject_id),
 used_by uuid REFERENCES mio_event_email_subjects(subject_id),
 used_at timestamptz,
 PRIMARY KEY (event_id,invite_hash)
);

CREATE TABLE IF NOT EXISTS mio_event_verified_members (
 event_id varchar(40) NOT NULL REFERENCES mio_events(event_id),
 subject_id uuid NOT NULL REFERENCES mio_event_email_subjects(subject_id),
 verified boolean NOT NULL DEFAULT false,
 verified_by varchar(80),
 verified_at timestamptz,
 PRIMARY KEY (event_id,subject_id)
);

-- An entry pass never conveys MIO/gacha/attendance privileges.
CREATE TABLE IF NOT EXISTS mio_event_passes (
 pass_id uuid PRIMARY KEY,
 event_id varchar(40) NOT NULL REFERENCES mio_events(event_id),
 subject_id uuid NOT NULL REFERENCES mio_event_email_subjects(subject_id),
 state varchar(12) NOT NULL CHECK (state IN ('active','revoked')),
 issued_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (event_id,subject_id)
);
CREATE INDEX IF NOT EXISTS mio_event_pass_lookup
 ON mio_event_passes(subject_id,event_id,state);

-- Private event room text. No sensitive content may be checked in as static files.
-- The room API checks event state, time window, and the verified subject's active pass.
CREATE TABLE IF NOT EXISTS mio_event_rooms (
 event_id varchar(40) PRIMARY KEY REFERENCES mio_events(event_id),
 state varchar(12) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','disabled')),
 title varchar(120) NOT NULL CHECK (length(trim(title))>0),
 body_text varchar(4000) NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
-- Tables must be reviewed and backed up BEFORE any installation.
-- Existing project and production remain untouched until release approval.
