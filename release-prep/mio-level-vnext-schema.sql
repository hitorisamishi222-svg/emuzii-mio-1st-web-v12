-- ISOLATED DESIGN ONLY. Do NOT execute on MIO production Neon or GAS yet.
-- New namespace only; no legacy MIO ID / attendance / draws / result table changes.
CREATE TABLE IF NOT EXISTS mio_level_issuers_v1 (
 issuer_id text PRIMARY KEY CHECK(issuer_id ~ '^[a-z][a-z0-9_-]{1,31}$'),
 owner_user_id text NOT NULL,
 display_name text NOT NULL,
 active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_level_accounts_v1 (
 master_id text PRIMARY KEY CHECK(master_id ~ '^MIO-([0-9]{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$'),
 display_name text NOT NULL,
 issuer_id text NOT NULL REFERENCES mio_level_issuers_v1(issuer_id),
 level smallint NOT NULL CHECK(level BETWEEN 1 AND 3),
 member_until timestamptz,
 status text NOT NULL CHECK(status IN ('pending','active','revoked')),
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
 device_thumbprint text CHECK(device_thumbprint IS NULL OR device_thumbprint ~ '^sha256:[a-f0-9]{64}$'),
 device_public_jwk jsonb,
 session_hash char(64) UNIQUE,
 session_expires_at timestamptz,
 browser_hint varchar(40),
 os_hint varchar(40),
 device_registered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT mio_member_expiry CHECK(level<>3 OR member_until IS NOT NULL),
 CONSTRAINT mio_device_session_pair CHECK((session_hash IS NULL)=(device_thumbprint IS NULL)),
 CONSTRAINT mio_session_expiry_pair CHECK((session_hash IS NULL)=(session_expires_at IS NULL))
);
-- Additive mapping for signed legacy mio_session identities after GAS verifies
-- the terminal switch. Candidate only: legacy APIs do not read it until the
-- common authorization gate is integrated and reviewed.
CREATE TABLE IF NOT EXISTS mio_level_legacy_sessions_v1 (
 web_id text PRIMARY KEY CHECK(web_id ~ '^MIO-W-[a-f0-9]{24}
 invite_id uuid PRIMARY KEY,
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 issuer_id text NOT NULL REFERENCES mio_level_issuers_v1(issuer_id),
 generation bigint NOT NULL CHECK(generation>=1),
 level smallint NOT NULL CHECK(level BETWEEN 1 AND 3),
 member_until timestamptz,
 code_hash char(64) UNIQUE NOT NULL,
 status text NOT NULL CHECK(status IN ('issued','claimed','revoked')),
 expires_at timestamptz NOT NULL,
 claimed_at timestamptz,
 revoked_at timestamptz,
 CONSTRAINT mio_pending_member_expiry CHECK(level<>3 OR member_until IS NOT NULL),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_level_one_unused_code_v1
 ON mio_level_invites_v1(master_id) WHERE status='issued';
CREATE TABLE IF NOT EXISTS mio_level_audit_v1 (
 operation_id uuid PRIMARY KEY,
 master_id text NOT NULL,
 issuer_id text NOT NULL,
 actor_id text NOT NULL,
 event text NOT NULL CHECK(event IN ('issue','claim','revoke','change_level')),
 generation bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_level_challenges_v1 (
 id text PRIMARY KEY,
 record jsonb NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS mio_level_challenges_expiry_v1
 ON mio_level_challenges_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_rate_v1 (
 rate_key char(64) NOT NULL,
 bucket bigint NOT NULL,
 hits integer NOT NULL CHECK(hits>0),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(rate_key,bucket)
);
CREATE INDEX IF NOT EXISTS mio_level_rate_expiry_v1
 ON mio_level_rate_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_pending_claims_v1 (
 invite_id uuid PRIMARY KEY REFERENCES mio_level_invites_v1(invite_id),
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 generation bigint NOT NULL CHECK(generation>=1),
 device_thumbprint text NOT NULL CHECK(device_thumbprint ~ '^sha256:[a-f0-9]{64}$'),
 device_public_jwk jsonb,
 session_hash char(64) NOT NULL UNIQUE,
 session_expires_at timestamptz NOT NULL,
 browser_hint varchar(40) NOT NULL,
 os_hint varchar(40) NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','active')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 CONSTRAINT mio_pending_claim_activation CHECK((status='active')=(activated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mio_level_pending_claims_expiry_v1
 ON mio_level_pending_claims_v1(expires_at) WHERE status='pending';
-- Separate release prerequisite: actual account master_id and issuer must be
-- verified against GAS roster & owner login. No issuer or member rows auto-seeded.
-- Gallery media for levels 2/3 must be served via authorized APIs, not /public URLs.

),
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 token_hash char(64) UNIQUE NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}
 invite_id uuid PRIMARY KEY,
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 issuer_id text NOT NULL REFERENCES mio_level_issuers_v1(issuer_id),
 generation bigint NOT NULL CHECK(generation>=1),
 level smallint NOT NULL CHECK(level BETWEEN 1 AND 3),
 member_until timestamptz,
 code_hash char(64) UNIQUE NOT NULL,
 status text NOT NULL CHECK(status IN ('issued','claimed','revoked')),
 expires_at timestamptz NOT NULL,
 claimed_at timestamptz,
 revoked_at timestamptz,
 CONSTRAINT mio_pending_member_expiry CHECK(level<>3 OR member_until IS NOT NULL),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_level_one_unused_code_v1
 ON mio_level_invites_v1(master_id) WHERE status='issued';
CREATE TABLE IF NOT EXISTS mio_level_audit_v1 (
 operation_id uuid PRIMARY KEY,
 master_id text NOT NULL,
 issuer_id text NOT NULL,
 actor_id text NOT NULL,
 event text NOT NULL CHECK(event IN ('issue','claim','revoke','change_level')),
 generation bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_level_challenges_v1 (
 id text PRIMARY KEY,
 record jsonb NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS mio_level_challenges_expiry_v1
 ON mio_level_challenges_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_rate_v1 (
 rate_key char(64) NOT NULL,
 bucket bigint NOT NULL,
 hits integer NOT NULL CHECK(hits>0),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(rate_key,bucket)
);
CREATE INDEX IF NOT EXISTS mio_level_rate_expiry_v1
 ON mio_level_rate_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_pending_claims_v1 (
 invite_id uuid PRIMARY KEY REFERENCES mio_level_invites_v1(invite_id),
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 generation bigint NOT NULL CHECK(generation>=1),
 device_thumbprint text NOT NULL CHECK(device_thumbprint ~ '^sha256:[a-f0-9]{64}$'),
 device_public_jwk jsonb,
 session_hash char(64) NOT NULL UNIQUE,
 session_expires_at timestamptz NOT NULL,
 browser_hint varchar(40) NOT NULL,
 os_hint varchar(40) NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','active')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 CONSTRAINT mio_pending_claim_activation CHECK((status='active')=(activated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mio_level_pending_claims_expiry_v1
 ON mio_level_pending_claims_v1(expires_at) WHERE status='pending';
-- Separate release prerequisite: actual account master_id and issuer must be
-- verified against GAS roster & owner login. No issuer or member rows auto-seeded.
-- Gallery media for levels 2/3 must be served via authorized APIs, not /public URLs.

),
 generation bigint NOT NULL CHECK(generation>=1),
 state text NOT NULL CHECK(state IN ('pending','active','gas_committed','revoked')),
 level smallint NOT NULL CHECK(level BETWEEN 1 AND 3),
 member_until timestamptz,
 device_thumbprint text NOT NULL CHECK(device_thumbprint ~ '^sha256:[a-f0-9]{64}
 invite_id uuid PRIMARY KEY,
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 issuer_id text NOT NULL REFERENCES mio_level_issuers_v1(issuer_id),
 generation bigint NOT NULL CHECK(generation>=1),
 level smallint NOT NULL CHECK(level BETWEEN 1 AND 3),
 member_until timestamptz,
 code_hash char(64) UNIQUE NOT NULL,
 status text NOT NULL CHECK(status IN ('issued','claimed','revoked')),
 expires_at timestamptz NOT NULL,
 claimed_at timestamptz,
 revoked_at timestamptz,
 CONSTRAINT mio_pending_member_expiry CHECK(level<>3 OR member_until IS NOT NULL),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_level_one_unused_code_v1
 ON mio_level_invites_v1(master_id) WHERE status='issued';
CREATE TABLE IF NOT EXISTS mio_level_audit_v1 (
 operation_id uuid PRIMARY KEY,
 master_id text NOT NULL,
 issuer_id text NOT NULL,
 actor_id text NOT NULL,
 event text NOT NULL CHECK(event IN ('issue','claim','revoke','change_level')),
 generation bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_level_challenges_v1 (
 id text PRIMARY KEY,
 record jsonb NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS mio_level_challenges_expiry_v1
 ON mio_level_challenges_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_rate_v1 (
 rate_key char(64) NOT NULL,
 bucket bigint NOT NULL,
 hits integer NOT NULL CHECK(hits>0),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(rate_key,bucket)
);
CREATE INDEX IF NOT EXISTS mio_level_rate_expiry_v1
 ON mio_level_rate_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_pending_claims_v1 (
 invite_id uuid PRIMARY KEY REFERENCES mio_level_invites_v1(invite_id),
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 generation bigint NOT NULL CHECK(generation>=1),
 device_thumbprint text NOT NULL CHECK(device_thumbprint ~ '^sha256:[a-f0-9]{64}$'),
 device_public_jwk jsonb,
 session_hash char(64) NOT NULL UNIQUE,
 session_expires_at timestamptz NOT NULL,
 browser_hint varchar(40) NOT NULL,
 os_hint varchar(40) NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','active')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 CONSTRAINT mio_pending_claim_activation CHECK((status='active')=(activated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mio_level_pending_claims_expiry_v1
 ON mio_level_pending_claims_v1(expires_at) WHERE status='pending';
-- Separate release prerequisite: actual account master_id and issuer must be
-- verified against GAS roster & owner login. No issuer or member rows auto-seeded.
-- Gallery media for levels 2/3 must be served via authorized APIs, not /public URLs.

),
 operation_id uuid NOT NULL,
 replaced_web_id text CHECK(replaced_web_id IS NULL OR replaced_web_id ~ '^MIO-W-[a-f0-9]{24}
 invite_id uuid PRIMARY KEY,
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 issuer_id text NOT NULL REFERENCES mio_level_issuers_v1(issuer_id),
 generation bigint NOT NULL CHECK(generation>=1),
 level smallint NOT NULL CHECK(level BETWEEN 1 AND 3),
 member_until timestamptz,
 code_hash char(64) UNIQUE NOT NULL,
 status text NOT NULL CHECK(status IN ('issued','claimed','revoked')),
 expires_at timestamptz NOT NULL,
 claimed_at timestamptz,
 revoked_at timestamptz,
 CONSTRAINT mio_pending_member_expiry CHECK(level<>3 OR member_until IS NOT NULL),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_level_one_unused_code_v1
 ON mio_level_invites_v1(master_id) WHERE status='issued';
CREATE TABLE IF NOT EXISTS mio_level_audit_v1 (
 operation_id uuid PRIMARY KEY,
 master_id text NOT NULL,
 issuer_id text NOT NULL,
 actor_id text NOT NULL,
 event text NOT NULL CHECK(event IN ('issue','claim','revoke','change_level')),
 generation bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_level_challenges_v1 (
 id text PRIMARY KEY,
 record jsonb NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS mio_level_challenges_expiry_v1
 ON mio_level_challenges_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_rate_v1 (
 rate_key char(64) NOT NULL,
 bucket bigint NOT NULL,
 hits integer NOT NULL CHECK(hits>0),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(rate_key,bucket)
);
CREATE INDEX IF NOT EXISTS mio_level_rate_expiry_v1
 ON mio_level_rate_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_pending_claims_v1 (
 invite_id uuid PRIMARY KEY REFERENCES mio_level_invites_v1(invite_id),
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 generation bigint NOT NULL CHECK(generation>=1),
 device_thumbprint text NOT NULL CHECK(device_thumbprint ~ '^sha256:[a-f0-9]{64}$'),
 device_public_jwk jsonb,
 session_hash char(64) NOT NULL UNIQUE,
 session_expires_at timestamptz NOT NULL,
 browser_hint varchar(40) NOT NULL,
 os_hint varchar(40) NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','active')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 CONSTRAINT mio_pending_claim_activation CHECK((status='active')=(activated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mio_level_pending_claims_expiry_v1
 ON mio_level_pending_claims_v1(expires_at) WHERE status='pending';
-- Separate release prerequisite: actual account master_id and issuer must be
-- verified against GAS roster & owner login. No issuer or member rows auto-seeded.
-- Gallery media for levels 2/3 must be served via authorized APIs, not /public URLs.

),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT mio_legacy_member_expiry CHECK(level<>3 OR member_until IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_level_one_live_legacy_session_v1
 ON mio_level_legacy_sessions_v1(master_id)
 WHERE state IN ('active','gas_committed');
CREATE INDEX IF NOT EXISTS mio_level_legacy_session_operation_v1
 ON mio_level_legacy_sessions_v1(operation_id);
CREATE TABLE IF NOT EXISTS mio_level_invites_v1 (
 invite_id uuid PRIMARY KEY,
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 issuer_id text NOT NULL REFERENCES mio_level_issuers_v1(issuer_id),
 generation bigint NOT NULL CHECK(generation>=1),
 level smallint NOT NULL CHECK(level BETWEEN 1 AND 3),
 member_until timestamptz,
 code_hash char(64) UNIQUE NOT NULL,
 status text NOT NULL CHECK(status IN ('issued','claimed','revoked')),
 expires_at timestamptz NOT NULL,
 claimed_at timestamptz,
 revoked_at timestamptz,
 CONSTRAINT mio_pending_member_expiry CHECK(level<>3 OR member_until IS NOT NULL),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_level_one_unused_code_v1
 ON mio_level_invites_v1(master_id) WHERE status='issued';
CREATE TABLE IF NOT EXISTS mio_level_audit_v1 (
 operation_id uuid PRIMARY KEY,
 master_id text NOT NULL,
 issuer_id text NOT NULL,
 actor_id text NOT NULL,
 event text NOT NULL CHECK(event IN ('issue','claim','revoke','change_level')),
 generation bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_level_challenges_v1 (
 id text PRIMARY KEY,
 record jsonb NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS mio_level_challenges_expiry_v1
 ON mio_level_challenges_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_rate_v1 (
 rate_key char(64) NOT NULL,
 bucket bigint NOT NULL,
 hits integer NOT NULL CHECK(hits>0),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(rate_key,bucket)
);
CREATE INDEX IF NOT EXISTS mio_level_rate_expiry_v1
 ON mio_level_rate_v1(expires_at);
CREATE TABLE IF NOT EXISTS mio_level_pending_claims_v1 (
 invite_id uuid PRIMARY KEY REFERENCES mio_level_invites_v1(invite_id),
 master_id text NOT NULL REFERENCES mio_level_accounts_v1(master_id),
 generation bigint NOT NULL CHECK(generation>=1),
 device_thumbprint text NOT NULL CHECK(device_thumbprint ~ '^sha256:[a-f0-9]{64}$'),
 device_public_jwk jsonb,
 session_hash char(64) NOT NULL UNIQUE,
 session_expires_at timestamptz NOT NULL,
 browser_hint varchar(40) NOT NULL,
 os_hint varchar(40) NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','active')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 CONSTRAINT mio_pending_claim_activation CHECK((status='active')=(activated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mio_level_pending_claims_expiry_v1
 ON mio_level_pending_claims_v1(expires_at) WHERE status='pending';
-- Separate release prerequisite: actual account master_id and issuer must be
-- verified against GAS roster & owner login. No issuer or member rows auto-seeded.
-- Gallery media for levels 2/3 must be served via authorized APIs, not /public URLs.

